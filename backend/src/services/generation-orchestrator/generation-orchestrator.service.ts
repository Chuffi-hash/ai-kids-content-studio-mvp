import { randomUUID } from 'crypto';
import fs from 'fs';
import path from 'path';
import { Resvg } from '@resvg/resvg-js';
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
          imageBuffer = createPlaceholderSceneBuffer(scene.title, scene.location, promptData.width, promptData.height, {
            sceneNumber: scene.sceneNumber,
            timeOfDay: scene.timeOfDay,
            visualStyle: context.story.visualStyle,
            storyTitle: context.story.title,
          });
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

        // Ensure worker token is synchronized to local disk
        GoogleFlowCredentialService.syncLocalWorkerTokenFile(token);

        // 1. Submit Job to Worker
        let submitRes = await fetch(`${workerUrl}/jobs`, {
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

        // Self-healing recovery: if worker returns 401 (e.g. process was started prior to credential provision),
        // sync token and attempt handshake provision before failing
        if (submitRes.status === 401 && token) {
          try {
            await GoogleFlowCredentialService.provisionWorker(workerUrl);
            submitRes = await fetch(`${workerUrl}/jobs`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${token}`,
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
          } catch {}
        }

        if (!submitRes.ok) {
          const errData = (await submitRes.json().catch(() => ({}))) as any;
          if (submitRes.status === 409) {
            throw new Error("Google Flow browser is not open. Please click 'Open Flow Browser' in the top bar to launch the companion browser.");
          }
          if (submitRes.status === 401) {
            throw new Error("Flow worker authentication out of sync. Please retry or click 'Verify / Reconnect' in Integration Studio.");
          }
          throw new Error(errData.message || `Flow worker returned HTTP ${submitRes.status}`);
        }

        const submitPayload = (await submitRes.json()) as any;
        const workerJobId = submitPayload.job?.id || jobId;

        // 2. Trigger Generation on Worker
        jobRecord.progress = 60;
        jobRecord.updatedAt = new Date().toISOString();

        let genRes = await fetch(`${workerUrl}/jobs/${workerJobId}/generate`, {
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

        if (genRes.status === 401 && token) {
          try {
            genRes = await fetch(`${workerUrl}/jobs/${workerJobId}/generate`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${token}`,
              },
              body: JSON.stringify({
                confirmGenerate: true,
                referenceConfirmed: true,
              }),
            });
          } catch {}
        }

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
          imageBuffer = createPlaceholderCharacterBuffer(character.name, character.species, 1024, 1024, {
            personality: character.personality,
            distinctiveFeatures: character.distinctiveFeatures,
            storyTitle: context.story.title,
          });
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

        // Ensure worker token is synchronized to local disk
        GoogleFlowCredentialService.syncLocalWorkerTokenFile(token);

        let submitRes = await fetch(`${workerUrl}/jobs`, {
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

        // Self-healing recovery: if worker returns 401, re-sync token & provision before failing
        if (submitRes.status === 401 && token) {
          try {
            await GoogleFlowCredentialService.provisionWorker(workerUrl);
            submitRes = await fetch(`${workerUrl}/jobs`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${token}`,
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
          } catch {}
        }

        if (!submitRes.ok) {
          const errData = (await submitRes.json().catch(() => ({}))) as any;
          if (submitRes.status === 409) {
            throw new Error("Google Flow browser is not open. Please click 'Open Flow Browser' in the top bar to launch the companion browser.");
          }
          if (submitRes.status === 401) {
            throw new Error("Flow worker authentication out of sync. Please retry or click 'Verify / Reconnect' in Integration Studio.");
          }
          throw new Error(errData.message || `Flow worker returned HTTP ${submitRes.status}`);
        }

        const submitPayload = (await submitRes.json()) as any;
        const workerJobId = submitPayload.job?.id || jobId;

        let genRes = await fetch(`${workerUrl}/jobs/${workerJobId}/generate`, {
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

        if (genRes.status === 401 && token) {
          try {
            await fetch(`${workerUrl}/jobs/${workerJobId}/generate`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${token}`,
              },
              body: JSON.stringify({
                confirmGenerate: true,
                referenceConfirmed: true,
              }),
            });
          } catch {}
        }

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

function createPlaceholderSceneBuffer(
  title: string,
  location: string,
  width: number = 1280,
  height: number = 720,
  meta?: { sceneNumber?: number; timeOfDay?: string; visualStyle?: string; storyTitle?: string }
): Buffer {
  const w = width > 0 ? width : 1280;
  const h = height > 0 ? height : 720;
  const sceneNum = meta?.sceneNumber ? `Scene ${meta.sceneNumber}` : 'Scene Plate';
  const cleanTitle = (title || 'Environment Plate').replace(/[<>&"]/g, '');
  const cleanLoc = (location || 'Sunny Meadow').replace(/[<>&"]/g, '');
  const cleanTime = (meta?.timeOfDay || 'Golden Hour / Sunset').replace(/[<>&"]/g, '');
  const cleanStyle = (meta?.visualStyle || 'Pixar / Disney 3D Storybook Style').replace(/[<>&"]/g, '');
  const storyTitle = (meta?.storyTitle || 'AI Story Studio').replace(/[<>&"]/g, '');

  const isNight = /night|dark|midnight|evening|dusk/i.test(cleanTime);
  const skyGradStart = isNight ? '#090d16' : '#1e1b4b';
  const skyGradMid = isNight ? '#1e1b4b' : '#4338ca';
  const skyGradEnd = isNight ? '#312e81' : '#f59e0b';
  const sunColor = isNight ? '#e2e8f0' : '#fef08a';
  const groundColor = isNight ? '#0f172a' : '#064e3b';
  const hillColor = isNight ? '#1e293b' : '#047857';

  const svg = `
<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="skyGrad" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" stop-color="${skyGradStart}"/>
      <stop offset="55%" stop-color="${skyGradMid}"/>
      <stop offset="100%" stop-color="${skyGradEnd}"/>
    </linearGradient>
    <linearGradient id="hillGrad1" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" stop-color="${hillColor}"/>
      <stop offset="100%" stop-color="${groundColor}"/>
    </linearGradient>
    <linearGradient id="overlayGrad" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" stop-color="rgba(0,0,0,0.4)"/>
      <stop offset="40%" stop-color="rgba(0,0,0,0)"/>
      <stop offset="70%" stop-color="rgba(0,0,0,0.3)"/>
      <stop offset="100%" stop-color="rgba(0,0,0,0.7)"/>
    </linearGradient>
  </defs>

  <!-- Sky Backdrop -->
  <rect width="100%" height="100%" fill="url(#skyGrad)"/>

  <!-- Celestial Orb (Sun/Moon) -->
  <circle cx="${w * 0.78}" cy="${h * 0.38}" r="${h * 0.16}" fill="${sunColor}" opacity="0.85"/>

  <!-- Distant Mountain/Hill Contours -->
  <path d="M 0,${h * 0.65} Q ${w * 0.25},${h * 0.48} ${w * 0.5},${h * 0.62} T ${w},${h * 0.58} L ${w},${h} L 0,${h} Z" fill="${hillColor}" opacity="0.6"/>
  <path d="M 0,${h * 0.75} Q ${w * 0.35},${h * 0.62} ${w * 0.7},${h * 0.72} T ${w},${h * 0.7} L ${w},${h} L 0,${h} Z" fill="url(#hillGrad1)"/>

  <!-- Subtle Vignette / Contrast Overlay -->
  <rect width="100%" height="100%" fill="url(#overlayGrad)"/>

  <!-- Top Banner: Story Badge -->
  <rect x="36" y="32" width="${w - 72}" height="42" rx="8" fill="rgba(15, 23, 42, 0.7)" stroke="rgba(255,255,255,0.15)" stroke-width="1"/>
  <text x="54" y="58" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="15" font-weight="bold" fill="#f8fafc">
    ${storyTitle} &#8226; ${cleanStyle}
  </text>
  <text x="${w - 54}" y="58" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="13" font-weight="bold" fill="#a78bfa" text-anchor="end">
    Story Plate Preview
  </text>

  <!-- Center Card Info: Scene & Environment -->
  <rect x="${w * 0.1}" y="${h * 0.38}" width="${w * 0.8}" height="${h * 0.32}" rx="16" fill="rgba(15, 23, 42, 0.75)" stroke="rgba(139, 92, 246, 0.4)" stroke-width="1.5"/>
  <text x="${w * 0.5}" y="${h * 0.47}" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="28" font-weight="800" fill="#ffffff" text-anchor="middle">
    ${sceneNum}: ${cleanTitle}
  </text>
  <text x="${w * 0.5}" y="${h * 0.54}" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="16" font-weight="600" fill="#cbd5e1" text-anchor="middle">
    ${cleanLoc} &#8226; ${cleanTime}
  </text>
  <text x="${w * 0.5}" y="${h * 0.61}" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="13" font-weight="500" fill="#94a3b8" text-anchor="middle">
    Environment backdrop &#8226; Character-free plate matching story visual direction
  </text>

  <!-- Bottom Details Strip -->
  <rect x="36" y="${h - 60}" width="${w - 72}" height="32" rx="6" fill="rgba(0,0,0,0.5)"/>
  <text x="50" y="${h - 39}" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="12" fill="#94a3b8">
    Aspect Ratio: ${w > h ? '16:9 Landscape' : '9:16 Portrait'} &#8226; ${w}x${h}px
  </text>
</svg>
`.trim();

  try {
    const resvg = new Resvg(svg, {
      fitTo: { mode: 'width', value: w },
    });
    const pngData = resvg.render();
    return pngData.asPng();
  } catch (err) {
    console.warn('[GenerationOrchestrator] Resvg rendering fallback to base PNG:', err);
    return Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAGQAAABkCAYAAABw4pVUAAAAPklEQVR42u3BAQ0AAADCoPdPbQ8HFAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA4G9mbgABf+972QAAAABJRU5ErkJggg==',
      'base64'
    );
  }
}

function createPlaceholderCharacterBuffer(
  name: string,
  species: string,
  width: number = 1024,
  height: number = 1024,
  meta?: { personality?: string; distinctiveFeatures?: string; storyTitle?: string }
): Buffer {
  const w = width > 0 ? width : 1024;
  const h = height > 0 ? height : 1024;
  const cleanName = (name || 'Character Reference').replace(/[<>&"]/g, '');
  const cleanSpecies = (species || 'Character').replace(/[<>&"]/g, '');
  const cleanPersonality = (meta?.personality || 'Heroic, friendly').replace(/[<>&"]/g, '');
  const cleanFeatures = (meta?.distinctiveFeatures || 'Canonical Disney/Pixar 3D style').replace(/[<>&"]/g, '');
  const storyTitle = (meta?.storyTitle || 'Character Studio').replace(/[<>&"]/g, '');

  const svg = `
<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <radialGradient id="charBg" cx="50%" cy="40%" r="60%">
      <stop offset="0%" stop-color="#4338ca"/>
      <stop offset="60%" stop-color="#1e1b4b"/>
      <stop offset="100%" stop-color="#0f172a"/>
    </radialGradient>
    <linearGradient id="avatarGlow" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#8b5cf6"/>
      <stop offset="100%" stop-color="#ec4899"/>
    </linearGradient>
  </defs>

  <rect width="100%" height="100%" fill="url(#charBg)"/>

  <!-- Character Silhouette Ring -->
  <circle cx="${w * 0.5}" cy="${h * 0.42}" r="${w * 0.28}" fill="none" stroke="url(#avatarGlow)" stroke-width="4" stroke-dasharray="6,4"/>
  <circle cx="${w * 0.5}" cy="${h * 0.42}" r="${w * 0.25}" fill="rgba(139, 92, 246, 0.15)"/>

  <!-- Character Head Silhouette -->
  <circle cx="${w * 0.5}" cy="${h * 0.36}" r="${w * 0.1}" fill="#cbd5e1" opacity="0.9"/>
  <!-- Character Shoulders -->
  <path d="M ${w * 0.32},${h * 0.58} Q ${w * 0.5},${h * 0.46} ${w * 0.68},${h * 0.58} L ${w * 0.68},${h * 0.64} L ${w * 0.32},${h * 0.64} Z" fill="#cbd5e1" opacity="0.9"/>

  <!-- Top Story Header -->
  <rect x="40" y="36" width="${w - 80}" height="48" rx="10" fill="rgba(15, 23, 42, 0.8)" stroke="rgba(255,255,255,0.15)" stroke-width="1"/>
  <text x="60" y="66" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="18" font-weight="bold" fill="#f8fafc">
    ${cleanName} &#8226; Master Reference
  </text>
  <text x="${w - 60}" y="66" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="14" font-weight="bold" fill="#a78bfa" text-anchor="end">
    ${storyTitle}
  </text>

  <!-- Info Box -->
  <rect x="60" y="${h * 0.72}" width="${w - 120}" height="${h * 0.22}" rx="14" fill="rgba(15, 23, 42, 0.85)" stroke="rgba(139, 92, 246, 0.4)" stroke-width="1.5"/>
  <text x="${w * 0.5}" y="${h * 0.79}" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="28" font-weight="800" fill="#ffffff" text-anchor="middle">
    ${cleanName}
  </text>
  <text x="${w * 0.5}" y="${h * 0.84}" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="16" font-weight="600" fill="#c084fc" text-anchor="middle">
    Species: ${cleanSpecies} &#8226; Personality: ${cleanPersonality}
  </text>
  <text x="${w * 0.5}" y="${h * 0.89}" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="13" font-weight="500" fill="#94a3b8" text-anchor="middle">
    Visual Traits: ${cleanFeatures}
  </text>
</svg>
`.trim();

  try {
    const resvg = new Resvg(svg, {
      fitTo: { mode: 'width', value: w },
    });
    const pngData = resvg.render();
    return pngData.asPng();
  } catch (err) {
    console.warn('[GenerationOrchestrator] Resvg character rendering fallback:', err);
    return Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAGQAAABkCAYAAABw4pVUAAAAPklEQVR42u3BAQ0AAADCoPdPbQ8HFAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA4G9mbgABf+972QAAAABJRU5ErkJggg==',
      'base64'
    );
  }
}
