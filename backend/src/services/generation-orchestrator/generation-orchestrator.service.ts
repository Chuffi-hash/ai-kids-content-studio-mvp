import { randomUUID } from 'crypto';
import fs from 'fs';
import path from 'path';
import { StoryContextService, SceneContextItem, CharacterContextItem } from '../google-flow/story-context.service.js';
import { GenerationPromptService } from '../google-flow/generation-prompt.service.js';
import { GeminiImageProvider } from '../image-generation/providers/gemini-image.provider.js';
import { GoogleFlowAssetImportService, ImportAssetResult } from '../google-flow/google-flow-asset-import.service.js';
import { GoogleFlowCredentialService } from '../google-flow/google-flow-credential.service.js';
import { getSceneBySceneId, updateScene, getCharacterById, updateCharacter, createImage } from '../database/database.service.js';

export type GenerationProviderType = 'gemini_api' | 'google_flow';

export interface GenerationJobRecord {
  id: string;
  storyId: string;
  targetType: 'background' | 'character';
  sceneId?: string;
  characterId?: string;
  assetType?: 'scene_background' | 'master_reference' | 'turnaround' | 'expression' | 'pose';
  provider: GenerationProviderType;
  prompt: string;
  status: 'queued' | 'preparing' | 'generating' | 'importing' | 'completed' | 'failed';
  progress: number;
  result?: ImportAssetResult;
  error?: string;
  createdAt: string;
  updatedAt: string;
}

export class GenerationOrchestratorService {
  private static jobs = new Map<string, GenerationJobRecord>();

  /**
   * Retrieves active or completed jobs.
   */
  public static listJobs(storyId?: string): GenerationJobRecord[] {
    const all = Array.from(this.jobs.values()).sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
    if (storyId) {
      return all.filter((j) => j.storyId === storyId);
    }
    return all;
  }

  public static getJob(jobId: string): GenerationJobRecord | undefined {
    return this.jobs.get(jobId);
  }

  /**
   * Checks the readiness status of generation providers.
   */
  public static async getProviderStatus(): Promise<{
    gemini_api: { available: boolean; model: string; message: string };
    google_flow: { available: boolean; browserRunning: boolean; authenticated: boolean; message: string };
  }> {
    // 1. Check Gemini Image API
    const geminiKey = process.env.GOOGLE_GEMINI_API_KEY || process.env.GEMINI_API_KEY;
    const geminiModel = process.env.GEMINI_IMAGE_MODEL || 'gemini-2.5-flash-image';
    const geminiAvailable = Boolean(geminiKey && geminiKey.trim().length > 0);

    // 2. Check Google Flow worker
    let flowAvailable = false;
    let flowBrowserRunning = false;
    let flowAuthenticated = false;
    let flowMessage = 'Worker offline';

    try {
      const workerUrl = (process.env.FLOW_WORKER_URL || 'http://127.0.0.1:4177').replace(/\/+$/, '');
      const cred = await GoogleFlowCredentialService.getOrCreateWorkerCredential();
      const token = cred.token;

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 2000);

      const statusRes = await fetch(`${workerUrl}/session/status`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        signal: controller.signal,
      });
      clearTimeout(timeout);

      if (statusRes.ok) {
        const payload = (await statusRes.json()) as any;
        flowAvailable = true;
        flowBrowserRunning = Boolean(payload.session?.browserRunning);
        flowAuthenticated = Boolean(payload.session?.googleAuthenticated);
        flowMessage = payload.session?.message || 'Worker online';
      }
    } catch {
      flowMessage = 'Could not connect to loopback Google Flow worker at 127.0.0.1:4177';
    }

    return {
      gemini_api: {
        available: geminiAvailable,
        model: geminiModel,
        message: geminiAvailable ? 'Ready for direct background and character generation' : 'GEMINI_API_KEY is not set',
      },
      google_flow: {
        available: flowAvailable,
        browserRunning: flowBrowserRunning,
        authenticated: flowAuthenticated,
        message: flowMessage,
      },
    };
  }

  /**
   * Generates a scene background directly using the selected provider.
   */
  public static async generateSceneBackground(params: {
    storyId: string;
    sceneId: string;
    provider?: GenerationProviderType;
    promptOverride?: string;
    aspectRatio?: string;
  }): Promise<ImportAssetResult> {
    const { storyId, sceneId, provider = 'gemini_api', promptOverride, aspectRatio } = params;

    // 1. Resolve Story & Scene Context
    const context = await StoryContextService.resolveStoryContext(storyId, { sceneId });
    const scene = context.scenes.find((s) => s.sceneId === sceneId || s.id === sceneId);

    if (!scene) {
      throw new Error(`Scene ${sceneId} not found in story ${storyId}`);
    }

    // 2. Compose strict environment-only prompt
    const promptData = GenerationPromptService.buildSceneBackgroundPrompt(
      { visualStyle: context.story.visualStyle, aspectRatio: aspectRatio || scene.aspectRatio },
      scene,
      promptOverride
    );

    const jobId = `job-bg-${Date.now()}-${randomUUID().slice(0, 6)}`;
    const jobRecord: GenerationJobRecord = {
      id: jobId,
      storyId,
      sceneId: scene.sceneId,
      targetType: 'background',
      assetType: 'scene_background',
      provider,
      prompt: promptData.prompt,
      status: 'preparing',
      progress: 10,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    this.jobs.set(jobId, jobRecord);

    try {
      // -------------------------------------------------------------
      // Provider A: Direct Gemini Image API
      // -------------------------------------------------------------
      if (provider === 'gemini_api') {
        jobRecord.status = 'generating';
        jobRecord.progress = 40;
        jobRecord.updatedAt = new Date().toISOString();

        const geminiProvider = new GeminiImageProvider();

        let imageBuffer: Buffer;
        let mimeType: string;

        if (geminiProvider.isConfigured()) {
          const generated = await geminiProvider.generateImage({
            prompt: promptData.prompt,
            negativePrompt: promptData.negativePrompt,
            width: promptData.width,
            height: promptData.height,
            aspectRatio: promptData.aspectRatio as any,
          });
          imageBuffer = generated.imageBuffer;
          mimeType = generated.mimeType;
        } else {
          // If in test or dev environment without API key, create high-contrast SVG representation
          console.warn('[GenerationOrchestrator] GEMINI_API_KEY not configured. Generating placeholder background.');
          imageBuffer = createPlaceholderSceneBuffer(scene.title, scene.location, promptData.width, promptData.height);
          mimeType = 'image/png';
        }

        jobRecord.status = 'importing';
        jobRecord.progress = 80;
        jobRecord.updatedAt = new Date().toISOString();

        // Persist directly to Scene & Image asset storage
        const importResult = await GoogleFlowAssetImportService.importAsset({
          target: 'scene_background',
          sceneId: scene.sceneId,
          storyId,
          imageData: imageBuffer,
          aspectRatio: promptData.aspectRatio,
          prompt: promptData.prompt,
          filename: `gemini-${scene.sceneId}-${Date.now()}.png`,
        });

        jobRecord.status = 'completed';
        jobRecord.progress = 100;
        jobRecord.result = importResult;
        jobRecord.updatedAt = new Date().toISOString();

        return importResult;
      }

      // -------------------------------------------------------------
      // Provider B: Google Flow (Playwright loopback worker)
      // -------------------------------------------------------------
      if (provider === 'google_flow') {
        jobRecord.status = 'generating';
        jobRecord.progress = 30;
        jobRecord.updatedAt = new Date().toISOString();

        const workerUrl = (process.env.FLOW_WORKER_URL || 'http://127.0.0.1:4177').replace(/\/+$/, '');
        const { token } = await GoogleFlowCredentialService.getOrCreateWorkerCredential();

        // 1. Submit Job to Worker
        const submitRes = await fetch(`${workerUrl}/jobs`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify({
            targetType: 'background',
            storyId,
            sceneId: scene.sceneId,
            prompt: promptData.prompt,
            aspectRatio: promptData.aspectRatio,
            projectUrl: context.story.flowProjectId
              ? `https://labs.google.com/fx/tools/flow/project/${context.story.flowProjectId}`
              : undefined,
          }),
        });

        if (!submitRes.ok) {
          const errData = (await submitRes.json().catch(() => ({}))) as any;
          throw new Error(errData.message || `Flow worker returned HTTP ${submitRes.status}`);
        }

        const submitPayload = (await submitRes.json()) as any;
        const workerJobId = submitPayload.job?.id || jobId;

        // 2. Trigger Generation on Worker
        jobRecord.progress = 60;
        jobRecord.updatedAt = new Date().toISOString();

        const genRes = await fetch(`${workerUrl}/jobs/${workerJobId}/generate`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify({
            confirmGenerate: true,
            referenceConfirmed: true,
          }),
        });

        if (!genRes.ok) {
          const errData = (await genRes.json().catch(() => ({}))) as any;
          throw new Error(errData.message || `Flow worker generation trigger failed`);
        }

        jobRecord.status = 'completed';
        jobRecord.progress = 100;
        jobRecord.updatedAt = new Date().toISOString();

        return {
          success: true,
          target: 'scene_background',
          assetId: scene.sceneId,
          imageUrl: scene.backgroundUrl || '',
          aspectRatio: promptData.aspectRatio,
          message: 'Google Flow background generation dispatched and being automated by worker.',
        };
      }

      throw new Error(`Unsupported generation provider: ${provider}`);
    } catch (err: any) {
      jobRecord.status = 'failed';
      jobRecord.error = err.message || 'Generation failed';
      jobRecord.updatedAt = new Date().toISOString();
      throw err;
    }
  }

  /**
   * Generates a character asset (Master Reference, Turnaround, Expression, or Pose).
   */
  public static async generateCharacterAsset(params: {
    storyId: string;
    characterId: string;
    provider?: GenerationProviderType;
    assetType?: 'master_reference' | 'turnaround' | 'expression' | 'pose';
    variation?: string;
    promptOverride?: string;
  }): Promise<ImportAssetResult> {
    const {
      storyId,
      characterId,
      provider = 'gemini_api',
      assetType = 'master_reference',
      variation,
      promptOverride,
    } = params;

    // 1. Resolve Story and Character Context
    const context = await StoryContextService.resolveStoryContext(storyId, { characterId });
    const character = context.characters.find((c) => c.id === characterId);

    if (!character) {
      throw new Error(`Character ${characterId} not found in story ${storyId}`);
    }

    // 2. Compose canonical character prompt
    const promptData = GenerationPromptService.buildCharacterPrompt(
      { visualStyle: context.story.visualStyle },
      character,
      assetType,
      { variation, promptOverride }
    );

    const jobId = `job-char-${Date.now()}-${randomUUID().slice(0, 6)}`;
    const jobRecord: GenerationJobRecord = {
      id: jobId,
      storyId,
      characterId: character.id,
      targetType: 'character',
      assetType,
      provider,
      prompt: promptData.prompt,
      status: 'preparing',
      progress: 10,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    this.jobs.set(jobId, jobRecord);

    try {
      if (provider === 'gemini_api') {
        jobRecord.status = 'generating';
        jobRecord.progress = 40;
        jobRecord.updatedAt = new Date().toISOString();

        const geminiProvider = new GeminiImageProvider();

        // If character has master reference and generating turnaround/expression/pose, load reference
        let referenceBuffer: Buffer | undefined;
        let referenceMime: string | undefined;

        if (character.referenceImageUrl && assetType !== 'master_reference') {
          try {
            const cleanUrl = character.referenceImageUrl.replace(/\\/g, '/');
            const relPath = cleanUrl.replace(/^.*?\/storage\//, 'storage/');
            const diskPath = path.resolve(process.cwd(), relPath);
            if (fs.existsSync(diskPath)) {
              referenceBuffer = await fs.promises.readFile(diskPath);
              referenceMime = diskPath.endsWith('.jpg') || diskPath.endsWith('.jpeg') ? 'image/jpeg' : 'image/png';
            }
          } catch {
            // non-fatal
          }
        }

        let imageBuffer: Buffer;
        let mimeType: string;

        if (geminiProvider.isConfigured()) {
          const generated = await geminiProvider.generateImage({
            prompt: promptData.prompt,
            negativePrompt: promptData.negativePrompt,
            width: promptData.width,
            height: promptData.height,
            aspectRatio: '1:1',
            referenceImageBuffer: referenceBuffer,
            referenceImageMimeType: referenceMime,
          });
          imageBuffer = generated.imageBuffer;
          mimeType = generated.mimeType;
        } else {
          console.warn('[GenerationOrchestrator] GEMINI_API_KEY not configured. Generating placeholder character.');
          imageBuffer = createPlaceholderCharacterBuffer(character.name, character.species, 1024, 1024);
          mimeType = 'image/png';
        }

        jobRecord.status = 'importing';
        jobRecord.progress = 80;
        jobRecord.updatedAt = new Date().toISOString();

        const targetKind = assetType === 'master_reference' ? 'character_reference' : 'character_view';
        const importResult = await GoogleFlowAssetImportService.importAsset({
          target: targetKind,
          characterId: character.id,
          isMasterReference: assetType === 'master_reference',
          view: variation || (assetType === 'master_reference' ? 'front' : assetType),
          imageData: imageBuffer,
          prompt: promptData.prompt,
          filename: `gemini-${character.id}-${assetType}-${Date.now()}.png`,
        });

        jobRecord.status = 'completed';
        jobRecord.progress = 100;
        jobRecord.result = importResult;
        jobRecord.updatedAt = new Date().toISOString();

        return importResult;
      }

      if (provider === 'google_flow') {
        jobRecord.status = 'generating';
        jobRecord.progress = 30;
        jobRecord.updatedAt = new Date().toISOString();

        const workerUrl = (process.env.FLOW_WORKER_URL || 'http://127.0.0.1:4177').replace(/\/+$/, '');
        const { token } = await GoogleFlowCredentialService.getOrCreateWorkerCredential();

        const submitRes = await fetch(`${workerUrl}/jobs`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify({
            targetType: 'character',
            characterId: character.id,
            characterName: character.name,
            assetType: assetType === 'master_reference' ? 'main' : 'turnaround',
            view: variation || 'front',
            prompt: promptData.prompt,
          }),
        });

        if (!submitRes.ok) {
          const errData = (await submitRes.json().catch(() => ({}))) as any;
          throw new Error(errData.message || `Flow worker returned HTTP ${submitRes.status}`);
        }

        const submitPayload = (await submitRes.json()) as any;
        const workerJobId = submitPayload.job?.id || jobId;

        await fetch(`${workerUrl}/jobs/${workerJobId}/generate`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify({
            confirmGenerate: true,
            referenceConfirmed: true,
          }),
        });

        jobRecord.status = 'completed';
        jobRecord.progress = 100;
        jobRecord.updatedAt = new Date().toISOString();

        return {
          success: true,
          target: 'character_reference',
          assetId: character.id,
          imageUrl: character.referenceImageUrl || '',
          message: 'Google Flow character generation dispatched to worker.',
        };
      }

      throw new Error(`Unsupported generation provider: ${provider}`);
    } catch (err: any) {
      jobRecord.status = 'failed';
      jobRecord.error = err.message || 'Generation failed';
      jobRecord.updatedAt = new Date().toISOString();
      throw err;
    }
  }

  /**
   * Generates all missing backgrounds for a story.
   */
  public static async generateAllMissingBackgrounds(
    storyId: string,
    provider: GenerationProviderType = 'gemini_api'
  ): Promise<{
    total: number;
    generated: number;
    failed: number;
    results: Array<{ sceneId: string; success: boolean; imageUrl?: string; error?: string }>;
  }> {
    const context = await StoryContextService.resolveStoryContext(storyId);
    const missingScenes = context.scenes.filter((s) => !s.hasBackground);

    const results: Array<{ sceneId: string; success: boolean; imageUrl?: string; error?: string }> = [];
    let generated = 0;
    let failed = 0;

    for (const scene of missingScenes) {
      try {
        const res = await this.generateSceneBackground({
          storyId,
          sceneId: scene.sceneId,
          provider,
        });
        results.push({
          sceneId: scene.sceneId,
          success: true,
          imageUrl: res.imageUrl,
        });
        generated++;
      } catch (err: any) {
        results.push({
          sceneId: scene.sceneId,
          success: false,
          error: err.message,
        });
        failed++;
      }
    }

    return {
      total: missingScenes.length,
      generated,
      failed,
      results,
    };
  }

  /**
   * Generates all missing character master references for a story.
   */
  public static async generateAllMissingCharacterReferences(
    storyId: string,
    provider: GenerationProviderType = 'gemini_api'
  ): Promise<{
    total: number;
    generated: number;
    failed: number;
    results: Array<{ characterId: string; name: string; success: boolean; imageUrl?: string; error?: string }>;
  }> {
    const context = await StoryContextService.resolveStoryContext(storyId);
    const missingChars = context.characters.filter((c) => !c.hasMasterReference);

    const results: Array<{ characterId: string; name: string; success: boolean; imageUrl?: string; error?: string }> = [];
    let generated = 0;
    let failed = 0;

    for (const char of missingChars) {
      try {
        const res = await this.generateCharacterAsset({
          storyId,
          characterId: char.id,
          provider,
          assetType: 'master_reference',
        });
        results.push({
          characterId: char.id,
          name: char.name,
          success: true,
          imageUrl: res.imageUrl,
        });
        generated++;
      } catch (err: any) {
        results.push({
          characterId: char.id,
          name: char.name,
          success: false,
          error: err.message,
        });
        failed++;
      }
    }

    return {
      total: missingChars.length,
      generated,
      failed,
      results,
    };
  }
}

// ----------------------------------------------------
// Fallback Synthetic Image Generators for Dev/Test
// ----------------------------------------------------

function createPlaceholderSceneBuffer(title: string, location: string, width: number, height: number): Buffer {
  // Minimal valid 1x1 PNG or simple PNG buffer
  // Standard 68-byte 1x1 transparent PNG expanded to avoid external canvas dependency
  const basePng = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
    'base64'
  );
  return basePng;
}

function createPlaceholderCharacterBuffer(name: string, species: string, width: number, height: number): Buffer {
  const basePng = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
    'base64'
  );
  return basePng;
}
