import { randomUUID } from 'crypto';
import fs from 'fs';
import path from 'path';
import { StoryContextService, SceneContextItem, CharacterContextItem } from '../google-flow/story-context.service.js';
import { GenerationPromptService } from '../google-flow/generation-prompt.service.js';
import { GeminiImageProvider } from '../image-generation/providers/gemini-image.provider.js';
import { GoogleFlowAssetImportService, ImportAssetResult } from '../google-flow/google-flow-asset-import.service.js';
import { GoogleFlowCredentialService } from '../google-flow/google-flow-credential.service.js';
import {
  getSceneBySceneId,
  updateScene,
  getCharacterById,
  updateCharacter,
  createImage,
  createGenerationJob,
  updateGenerationJob,
  getGenerationJob,
  listGenerationJobs,
  getFlowCharacterMapping,
  upsertFlowCharacterMapping,
  listFlowCharacterMappings,
} from '../database/database.service.js';

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
  status:
    | 'queued'
    | 'preparing'
    | 'prompt_filled'
    | 'agent_prompt_submitted'
    | 'awaiting_agent_confirmation'
    | 'generation_submitted'
    | 'generating'
    | 'output_detected'
    | 'downloading'
    | 'importing'
    | 'completed'
    | 'failed'
    | 'cancelled'
    | 'awaiting_download'
    | 'awaiting_manual_action';
  progress: number;
  result?: ImportAssetResult;
  error?: string;
  workerJobId?: string;
  createdAt: string;
  updatedAt: string;
}

export class GenerationOrchestratorService {
  private static jobs = new Map<string, GenerationJobRecord>();

  /**
   * Retrieves active or completed jobs from PostgreSQL with in-memory caching.
   */
  public static async listJobs(storyId?: string): Promise<GenerationJobRecord[]> {
    try {
      const dbJobs = await listGenerationJobs(storyId ? { storyId } : undefined);
      if (dbJobs.length > 0) {
        return dbJobs.map((j) => ({
          id: j.id,
          storyId: j.storyId || '',
          targetType: j.targetType.includes('character') ? 'character' : 'background',
          sceneId: j.sceneId || undefined,
          characterId: j.characterId || undefined,
          assetType: (j.assetType as any) || undefined,
          provider: j.provider as any,
          prompt: j.prompt,
          status: (j.status as any) || 'queued',
          progress: j.progress,
          workerJobId: j.workerJobId || undefined,
          result: j.resultUrl
            ? {
                success: true,
                target: j.targetType,
                assetId: j.resultAssetId || j.id,
                imageUrl: j.resultUrl,
                message: 'Completed',
              }
            : undefined,
          error: j.error || undefined,
          createdAt: j.createdAt.toISOString(),
          updatedAt: j.updatedAt.toISOString(),
        }));
      }
    } catch {
      // Fallback to in-memory if DB query fails during bootstrap
    }

    const all = Array.from(this.jobs.values()).sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
    if (storyId) {
      return all.filter((j) => j.storyId === storyId);
    }
    return all;
  }

  /**
   * Retrieves job status and reconciles active jobs with Flow Worker.
   */
  public static async getJob(jobId: string): Promise<GenerationJobRecord | undefined> {
    try {
      const j = await getGenerationJob(jobId);
      if (j) {
        // Reconcile with worker if job is in progress
        if (
          j.provider === 'google_flow' &&
          j.workerJobId &&
          !['completed', 'failed', 'cancelled'].includes(j.status)
        ) {
          try {
            const { token, metadata } = await GoogleFlowCredentialService.getOrCreateWorkerCredential();
            const workerUrl = (metadata?.workerUrl || process.env.FLOW_WORKER_URL || 'http://127.0.0.1:4177').replace(/\/+$/, '');
            const res = await fetch(`${workerUrl}/jobs/${j.workerJobId}`, {
              headers: token ? { Authorization: `Bearer ${token}` } : {},
            });
            if (res.ok) {
              const payload = (await res.json().catch(() => ({}))) as any;
              const wJob = payload.job;
              if (wJob) {
                let nextStatus = j.status;
                let nextProgress = j.progress;
                let resultUrl = j.resultUrl;
                let resultAssetId = j.resultAssetId;

                if (wJob.status === 'completed' && wJob.importResult) {
                  nextStatus = 'completed';
                  nextProgress = 100;
                  resultUrl = wJob.importResult.imageUrl || wJob.importResult.url;
                  resultAssetId = wJob.importResult.assetId;
                } else if (wJob.status === 'failed') {
                  nextStatus = 'failed';
                } else if (wJob.status === 'prompt_filled') {
                  nextStatus = 'prompt_filled';
                  nextProgress = 25;
                } else if (wJob.status === 'agent_prompt_submitted') {
                  nextStatus = 'agent_prompt_submitted';
                  nextProgress = 35;
                } else if (wJob.status === 'awaiting_agent_confirmation') {
                  nextStatus = 'awaiting_agent_confirmation';
                  nextProgress = 40;
                } else if (wJob.status === 'generation_submitted') {
                  nextStatus = 'generation_submitted';
                  nextProgress = 45;
                } else if (wJob.status === 'generating') {
                  nextStatus = 'generating';
                  nextProgress = 60;
                } else if (wJob.status === 'output_detected') {
                  nextStatus = 'output_detected';
                  nextProgress = 75;
                } else if (wJob.status === 'downloading') {
                  nextStatus = 'downloading';
                  nextProgress = 85;
                } else if (wJob.status === 'importing') {
                  nextStatus = 'importing';
                  nextProgress = 95;
                } else if (wJob.status === 'awaiting_download') {
                  nextStatus = 'awaiting_download';
                  nextProgress = 70;
                } else if (wJob.status === 'awaiting_manual_generate') {
                  nextStatus = 'awaiting_manual_action';
                }

                if (nextStatus !== j.status || resultUrl !== j.resultUrl) {
                  await updateGenerationJob(j.id, {
                    status: nextStatus,
                    progress: nextProgress,
                    resultUrl: resultUrl || undefined,
                    resultAssetId: resultAssetId || undefined,
                    error: wJob.error || undefined,
                    completedAt: nextStatus === 'completed' ? new Date() : undefined,
                  });
                  j.status = nextStatus;
                  j.progress = nextProgress;
                  j.resultUrl = resultUrl;
                  j.resultAssetId = resultAssetId;
                  j.error = wJob.error || null;
                }
              }
            }
          } catch {}
        }

        return {
          id: j.id,
          storyId: j.storyId || '',
          targetType: j.targetType.includes('character') ? 'character' : 'background',
          sceneId: j.sceneId || undefined,
          characterId: j.characterId || undefined,
          assetType: (j.assetType as any) || undefined,
          provider: j.provider as any,
          prompt: j.prompt,
          status: (j.status as any) || 'queued',
          progress: j.progress,
          workerJobId: j.workerJobId || undefined,
          result: j.resultUrl
            ? {
                success: true,
                target: j.targetType,
                assetId: j.resultAssetId || j.id,
                imageUrl: j.resultUrl,
                message: 'Completed',
              }
            : undefined,
          error: j.error || undefined,
          createdAt: j.createdAt.toISOString(),
          updatedAt: j.updatedAt.toISOString(),
        };
      }
    } catch {
      // Fallback to in-memory
    }

    return this.jobs.get(jobId);
  }

  /**
   * Explicitly cancels the active Flow job on worker and reconciles database state.
   */
  public static async cancelActiveFlowJob(): Promise<{ success: boolean; message: string }> {
    try {
      const { token, metadata } = await GoogleFlowCredentialService.getOrCreateWorkerCredential();
      const workerUrl = (metadata?.workerUrl || process.env.FLOW_WORKER_URL || 'http://127.0.0.1:4177').replace(/\/+$/, '');
      const res = await fetch(`${workerUrl}/jobs/cancel-active`, {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      }).catch(() => null);

      // Reconcile any in-memory or PostgreSQL jobs that are active
      for (const [id, j] of this.jobs.entries()) {
        if (!['completed', 'cancelled', 'failed'].includes(j.status)) {
          j.status = 'cancelled';
          j.error = 'Cancelled by user request.';
          j.updatedAt = new Date().toISOString();
          try {
            await updateGenerationJob(id, { status: 'cancelled', error: 'Cancelled by user request.' });
          } catch {}
        }
      }

      if (res && res.ok) {
        const data = await res.json().catch(() => ({}));
        return { success: true, message: data.message || 'Active Google Flow job cancelled successfully.' };
      }
      return { success: true, message: 'Active Google Flow jobs cleared.' };
    } catch (err: any) {
      return { success: false, message: err.message || 'Failed to cancel active Flow job.' };
    }
  }

  /**
   * Cancels a specific generation job by ID.
   */
  public static async cancelJob(jobId: string): Promise<{ success: boolean; message: string }> {
    const job = await this.getJob(jobId);
    if (!job) {
      return { success: false, message: 'Job not found.' };
    }
    if (job.workerJobId) {
      try {
        const { token, metadata } = await GoogleFlowCredentialService.getOrCreateWorkerCredential();
        const workerUrl = (metadata?.workerUrl || process.env.FLOW_WORKER_URL || 'http://127.0.0.1:4177').replace(/\/+$/, '');
        await fetch(`${workerUrl}/jobs/${job.workerJobId}`, {
          method: 'DELETE',
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        }).catch(() => {});
      } catch {}
    }
    job.status = 'cancelled';
    job.error = 'Job cancelled by user request.';
    job.updatedAt = new Date().toISOString();
    try {
      await updateGenerationJob(jobId, { status: 'cancelled', error: 'Job cancelled by user request.' });
    } catch {}
    return { success: true, message: `Job ${jobId} was cancelled.` };
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

    // 2. Check Google Flow worker using PostgreSQL persisted configuration
    let flowAvailable = false;
    let flowBrowserRunning = false;
    let flowAuthenticated = false;
    let flowMessage = 'Worker offline';

    try {
      const cred = await GoogleFlowCredentialService.getOrCreateWorkerCredential();
      const token = cred.token;
      const workerUrl = (cred.metadata?.workerUrl || process.env.FLOW_WORKER_URL || 'http://127.0.0.1:4177').replace(/\/+$/, '');

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
      flowMessage = 'Could not connect to loopback Google Flow worker at configured endpoint';
    }

    return {
      gemini_api: {
        available: geminiAvailable,
        model: geminiModel,
        message: geminiAvailable ? 'Ready for direct background and character generation' : 'GEMINI_API_KEY is not configured',
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
    testMockBuffer?: Buffer;
  }): Promise<ImportAssetResult> {
    const { storyId, sceneId, provider = 'gemini_api', promptOverride, aspectRatio, testMockBuffer } = params;

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

    // Persist to PostgreSQL
    try {
      await createGenerationJob({
        id: jobId,
        storyId,
        sceneId: scene.sceneId,
        provider,
        targetType: 'scene_background',
        assetType: 'scene_background',
        prompt: promptData.prompt,
        flowProjectId: context.story.flowProjectId || undefined,
        status: 'preparing',
        progress: 10,
        metadata: {
          aspectRatio: promptData.aspectRatio,
          width: promptData.width,
          height: promptData.height,
        },
      });
    } catch {}

    try {
      // -------------------------------------------------------------
      // Provider A: Direct Gemini Image API
      // -------------------------------------------------------------
      if (provider === 'gemini_api') {
        jobRecord.status = 'generating';
        jobRecord.progress = 40;
        jobRecord.updatedAt = new Date().toISOString();

        let imageBuffer: Buffer;
        if (testMockBuffer) {
          imageBuffer = testMockBuffer;
        } else {
          const geminiProvider = new GeminiImageProvider();

          if (!geminiProvider.isConfigured()) {
            throw new Error(
              'GEMINI_API_KEY is not configured in your environment or settings. Please provide a valid Gemini API key or switch Generation Engine to Google Flow.'
            );
          }

          const generated = await geminiProvider.generateImage({
            prompt: promptData.prompt,
            negativePrompt: promptData.negativePrompt,
            width: promptData.width,
            height: promptData.height,
            aspectRatio: promptData.aspectRatio as any,
          });
          imageBuffer = generated.imageBuffer;
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
          provider: 'gemini_api',
          model: 'imagen-3',
          sourceJobId: jobId,
          filename: `gemini-${scene.sceneId}-${Date.now()}.png`,
        });

        jobRecord.status = 'completed';
        jobRecord.progress = 100;
        jobRecord.result = importResult;
        jobRecord.updatedAt = new Date().toISOString();

        try {
          await updateGenerationJob(jobId, {
            status: 'completed',
            progress: 100,
            resultAssetId: importResult.assetId,
            resultUrl: importResult.imageUrl,
            completedAt: new Date(),
          });
        } catch {}

        return importResult;
      }

      // -------------------------------------------------------------
      // Provider B: Google Flow (Playwright loopback worker)
      // -------------------------------------------------------------
      if (provider === 'google_flow') {
        const flowProjectId = context.story.flowProjectId;
        if (!flowProjectId) {
          throw new Error('This story is not connected to a Google Flow project. Please connect a Google Flow project first.');
        }

        jobRecord.status = 'generating';
        jobRecord.progress = 30;
        jobRecord.updatedAt = new Date().toISOString();

        const { token, metadata } = await GoogleFlowCredentialService.getOrCreateWorkerCredential();
        const workerUrl = (metadata?.workerUrl || process.env.FLOW_WORKER_URL || 'http://127.0.0.1:4177').replace(/\/+$/, '');

        // Ensure worker token is synchronized to local disk
        GoogleFlowCredentialService.syncLocalWorkerTokenFile(token);

        const projectUrl = `https://flow.google.com/project/${flowProjectId}`;

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
            projectUrl,
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
                targetType: 'background',
                storyId,
                sceneId: scene.sceneId,
                prompt: promptData.prompt,
                aspectRatio: promptData.aspectRatio,
                projectUrl,
              }),
            });
          } catch {}
        }

        if (!submitRes.ok) {
          const errData = (await submitRes.json().catch(() => ({}))) as any;
          if (submitRes.status === 409) {
            if (errData.message?.includes("browser session") || errData.message?.includes("browser is not open")) {
              throw new Error("Google Flow browser is not open. Please click 'Open Flow Browser' in the top bar to launch the companion browser.");
            }
            if (errData.message?.includes("Another Flow job is active")) {
              console.warn('[GenerationOrchestrator] Another Flow job was active. Auto-recovering lock and retrying with cancelPrevious...');
              try {
                await fetch(`${workerUrl}/jobs/cancel-active`, {
                  method: 'POST',
                  headers: token ? { Authorization: `Bearer ${token}` } : {},
                });
                submitRes = await fetch(`${workerUrl}/jobs`, {
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
                    projectUrl,
                    cancelPrevious: true,
                  }),
                });
              } catch {}
            }
          }
          if (!submitRes.ok) {
            if (submitRes.status === 401) {
              throw new Error("Flow worker authentication out of sync. Please retry or click 'Verify / Reconnect' in Integration Studio.");
            }
            const retryErr = (await submitRes.json().catch(() => ({}))) as any;
            throw new Error(retryErr.message || errData.message || `Flow worker returned HTTP ${submitRes.status}`);
          }
        }

        const submitPayload = (await submitRes.json()) as any;
        const workerJobId = submitPayload.job?.id || jobId;

        jobRecord.workerJobId = workerJobId;
        jobRecord.progress = 50;
        jobRecord.updatedAt = new Date().toISOString();

        try {
          await updateGenerationJob(jobId, {
            workerJobId,
            status: 'generating',
            progress: 50,
          });
        } catch {}

        // 2. Trigger Generation on Worker
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
          throw new Error(errData.message || 'Flow worker generation trigger failed');
        }

        // 3. Await generation settlement if fast (e.g. in tests/mocked worker), up to 10 seconds
        let completedResult: any = null;
        const pollStart = Date.now();
        while (Date.now() - pollStart < 10000) {
          const statusRes = await fetch(`${workerUrl}/jobs/${workerJobId}`, {
            headers: token ? { Authorization: `Bearer ${token}` } : {},
          }).catch(() => null);

          if (statusRes && statusRes.ok) {
            const workerStatus = (await statusRes.json().catch(() => ({}))) as any;
            const wJob = workerStatus.job;
            if (wJob?.status === 'completed' && wJob?.importResult) {
              completedResult = wJob.importResult;
              break;
            }
            if (wJob?.status === 'failed') {
              throw new Error(wJob.error || 'Flow worker generation failed');
            }
          }
          await new Promise((r) => setTimeout(r, 1000));
        }

        if (completedResult) {
          jobRecord.status = 'completed';
          jobRecord.progress = 100;
          jobRecord.result = completedResult;
          jobRecord.updatedAt = new Date().toISOString();

          try {
            await updateGenerationJob(jobId, {
              status: 'completed',
              progress: 100,
              resultAssetId: completedResult.assetId,
              resultUrl: completedResult.imageUrl || completedResult.url,
              completedAt: new Date(),
            });
          } catch {}

          return {
            success: true,
            target: 'scene_background',
            assetId: scene.sceneId,
            imageUrl: completedResult.imageUrl || completedResult.url,
            aspectRatio: promptData.aspectRatio,
            message: 'Google Flow background generation completed and imported successfully.',
          };
        }

        // Return ongoing job info
        return {
          success: true,
          target: 'scene_background',
          assetId: scene.sceneId,
          imageUrl: scene.backgroundUrl || '',
          aspectRatio: promptData.aspectRatio,
          message: 'Google Flow background generation dispatched and being automated by worker. Polling in progress.',
        };
      }

      throw new Error(`Unsupported generation provider: ${provider}`);
    } catch (err: any) {
      jobRecord.status = 'failed';
      jobRecord.error = err.message || 'Generation failed';
      jobRecord.updatedAt = new Date().toISOString();

      try {
        await updateGenerationJob(jobId, {
          status: 'failed',
          error: err.message || 'Generation failed',
        });
      } catch {}

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
    testMockBuffer?: Buffer;
  }): Promise<ImportAssetResult> {
    const {
      storyId,
      characterId,
      provider = 'gemini_api',
      assetType = 'master_reference',
      variation,
      promptOverride,
      testMockBuffer,
    } = params;

    // 1. Resolve Story and Character Context
    const context = await StoryContextService.resolveStoryContext(storyId, { characterId });
    const character = context.characters.find((c) => c.id === characterId);

    if (!character) {
      throw new Error(`Character ${characterId} not found in story ${storyId}`);
    }

    // 2. Check for existing Flow Character Mapping
    let flowCharacterName = character.name;
    const mapping = await getFlowCharacterMapping(storyId, character.id);
    if (mapping && mapping.syncStatus === 'synced' && mapping.flowCharacterName) {
      flowCharacterName = mapping.flowCharacterName;
    }

    // 3. Compose canonical character prompt with @Character reference when applicable
    const promptData = GenerationPromptService.buildCharacterPrompt(
      { visualStyle: context.story.visualStyle },
      character,
      assetType,
      { variation, promptOverride }
    );

    let finalPrompt = promptData.prompt;
    if (provider === 'google_flow' && assetType !== 'master_reference' && mapping?.syncStatus === 'synced') {
      finalPrompt = `Use the saved Google Flow character reference named @${flowCharacterName} as the exact subject identity.\n\n${promptData.prompt}`;
    }

    const jobId = `job-char-${Date.now()}-${randomUUID().slice(0, 6)}`;
    const jobRecord: GenerationJobRecord = {
      id: jobId,
      storyId,
      characterId: character.id,
      targetType: 'character',
      assetType,
      provider,
      prompt: finalPrompt,
      status: 'preparing',
      progress: 10,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    this.jobs.set(jobId, jobRecord);

    try {
      await createGenerationJob({
        id: jobId,
        storyId,
        characterId: character.id,
        provider,
        targetType: `character_${assetType}`,
        assetType,
        prompt: finalPrompt,
        flowProjectId: context.story.flowProjectId || undefined,
        status: 'preparing',
        progress: 10,
      });
    } catch {}

    try {
      if (provider === 'gemini_api') {
        jobRecord.status = 'generating';
        jobRecord.progress = 40;
        jobRecord.updatedAt = new Date().toISOString();

        let imageBuffer: Buffer;
        if (testMockBuffer) {
          imageBuffer = testMockBuffer;
        } else {
          const geminiProvider = new GeminiImageProvider();

          if (!geminiProvider.isConfigured()) {
            throw new Error(
              'GEMINI_API_KEY is not configured in your environment or settings. Please provide a valid Gemini API key or switch Generation Engine to Google Flow.'
            );
          }

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
            } catch {}
          }

          const generated = await geminiProvider.generateImage({
            prompt: finalPrompt,
            negativePrompt: promptData.negativePrompt,
            width: promptData.width,
            height: promptData.height,
            aspectRatio: '1:1',
            referenceImageBuffer: referenceBuffer,
            referenceImageMimeType: referenceMime,
          });
          imageBuffer = generated.imageBuffer;
        }

        jobRecord.status = 'importing';
        jobRecord.progress = 80;
        jobRecord.updatedAt = new Date().toISOString();

        const targetKind = assetType === 'master_reference' ? 'character_reference' : 'character_view';
        const importResult = await GoogleFlowAssetImportService.importAsset({
          target: targetKind,
          characterId: character.id,
          storyId,
          isMasterReference: assetType === 'master_reference',
          view: variation || (assetType === 'master_reference' ? 'front' : assetType),
          imageData: imageBuffer,
          prompt: finalPrompt,
          provider: 'gemini_api',
          model: 'imagen-3',
          sourceJobId: jobId,
          filename: `gemini-${character.id}-${assetType}-${Date.now()}.png`,
        });

        jobRecord.status = 'completed';
        jobRecord.progress = 100;
        jobRecord.result = importResult;
        jobRecord.updatedAt = new Date().toISOString();

        try {
          await updateGenerationJob(jobId, {
            status: 'completed',
            progress: 100,
            resultAssetId: importResult.assetId,
            resultUrl: importResult.imageUrl,
            completedAt: new Date(),
          });
        } catch {}

        return importResult;
      }

      if (provider === 'google_flow') {
        const flowProjectId = context.story.flowProjectId;
        if (!flowProjectId) {
          throw new Error('This story is not connected to a Google Flow project. Please connect a Google Flow project first.');
        }

        jobRecord.status = 'generating';
        jobRecord.progress = 30;
        jobRecord.updatedAt = new Date().toISOString();

        const { token, metadata } = await GoogleFlowCredentialService.getOrCreateWorkerCredential();
        const workerUrl = (metadata?.workerUrl || process.env.FLOW_WORKER_URL || 'http://127.0.0.1:4177').replace(/\/+$/, '');

        // Ensure worker token is synchronized to local disk
        GoogleFlowCredentialService.syncLocalWorkerTokenFile(token);

        const projectUrl = `https://flow.google.com/project/${flowProjectId}`;

        let submitRes = await fetch(`${workerUrl}/jobs`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify({
            targetType: 'character',
            characterId: character.id,
            characterName: flowCharacterName,
            assetType: assetType === 'master_reference' ? 'main' : 'turnaround',
            view: variation || 'front',
            prompt: finalPrompt,
            projectUrl,
            storyId,
          }),
        });

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
                characterName: flowCharacterName,
                assetType: assetType === 'master_reference' ? 'main' : 'turnaround',
                view: variation || 'front',
                prompt: finalPrompt,
                projectUrl,
                storyId,
              }),
            });
          } catch {}
        }

        if (!submitRes.ok) {
          const errData = (await submitRes.json().catch(() => ({}))) as any;
          if (submitRes.status === 409) {
            if (errData.message?.includes("browser session") || errData.message?.includes("browser is not open")) {
              throw new Error("Google Flow browser is not open. Please click 'Open Flow Browser' in the top bar to launch the companion browser.");
            }
            if (errData.message?.includes("Another Flow job is active")) {
              console.warn('[GenerationOrchestrator] Another Flow job was active. Auto-recovering lock and retrying with cancelPrevious...');
              try {
                await fetch(`${workerUrl}/jobs/cancel-active`, {
                  method: 'POST',
                  headers: token ? { Authorization: `Bearer ${token}` } : {},
                });
                submitRes = await fetch(`${workerUrl}/jobs`, {
                  method: 'POST',
                  headers: {
                    'Content-Type': 'application/json',
                    ...(token ? { Authorization: `Bearer ${token}` } : {}),
                  },
                  body: JSON.stringify({
                    targetType: 'character',
                    characterId: character.id,
                    characterName: flowCharacterName,
                    assetType: assetType === 'master_reference' ? 'main' : 'turnaround',
                    view: variation || 'front',
                    prompt: finalPrompt,
                    projectUrl,
                    storyId,
                    cancelPrevious: true,
                  }),
                });
              } catch {}
            }
          }
          if (!submitRes.ok) {
            if (submitRes.status === 401) {
              throw new Error("Flow worker authentication out of sync. Please retry or click 'Verify / Reconnect' in Integration Studio.");
            }
            const retryErr = (await submitRes.json().catch(() => ({}))) as any;
            throw new Error(retryErr.message || errData.message || `Flow worker returned HTTP ${submitRes.status}`);
          }
        }

        const submitPayload = (await submitRes.json()) as any;
        const workerJobId = submitPayload.job?.id || jobId;

        jobRecord.workerJobId = workerJobId;
        jobRecord.progress = 50;
        jobRecord.updatedAt = new Date().toISOString();

        try {
          await updateGenerationJob(jobId, {
            workerJobId,
            status: 'generating',
            progress: 50,
          });
        } catch {}

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
          throw new Error(errData.message || 'Flow worker character generation trigger failed');
        }

        // Await generation settlement if fast (up to 10 seconds)
        let completedResult: any = null;
        const pollStart = Date.now();
        while (Date.now() - pollStart < 10000) {
          const statusRes = await fetch(`${workerUrl}/jobs/${workerJobId}`, {
            headers: token ? { Authorization: `Bearer ${token}` } : {},
          }).catch(() => null);

          if (statusRes && statusRes.ok) {
            const workerStatus = (await statusRes.json().catch(() => ({}))) as any;
            const wJob = workerStatus.job;
            if (wJob?.status === 'completed' && wJob?.importResult) {
              completedResult = wJob.importResult;
              break;
            }
            if (wJob?.status === 'failed') {
              throw new Error(wJob.error || 'Flow worker generation failed');
            }
          }
          await new Promise((r) => setTimeout(r, 1000));
        }

        if (completedResult) {
          jobRecord.status = 'completed';
          jobRecord.progress = 100;
          jobRecord.result = completedResult;
          jobRecord.updatedAt = new Date().toISOString();

          try {
            await updateGenerationJob(jobId, {
              status: 'completed',
              progress: 100,
              resultAssetId: completedResult.assetId,
              resultUrl: completedResult.imageUrl || completedResult.url,
              completedAt: new Date(),
            });
          } catch {}

          return {
            success: true,
            target: 'character_reference',
            assetId: character.id,
            imageUrl: completedResult.imageUrl || completedResult.url,
            message: 'Google Flow character view generation completed and imported successfully.',
          };
        }

        return {
          success: true,
          target: 'character_reference',
          assetId: character.id,
          imageUrl: character.referenceImageUrl || '',
          message: 'Google Flow character generation dispatched and being automated by worker. Polling in progress.',
        };
      }

      throw new Error(`Unsupported generation provider: ${provider}`);
    } catch (err: any) {
      jobRecord.status = 'failed';
      jobRecord.error = err.message || 'Generation failed';
      jobRecord.updatedAt = new Date().toISOString();

      try {
        await updateGenerationJob(jobId, {
          status: 'failed',
          error: err.message || 'Generation failed',
        });
      } catch {}

      throw err;
    }
  }

  /**
   * Synchronizes a story character to its associated Google Flow project.
   */
  public static async syncCharacterToGoogleFlow(
    storyId: string,
    characterId: string,
    options?: { force?: boolean; workerUrl?: string }
  ): Promise<{
    success: boolean;
    mapping: any;
    message: string;
  }> {
    const context = await StoryContextService.resolveStoryContext(storyId);
    const flowProjectId = context.story.flowProjectId;
    if (!flowProjectId) {
      throw new Error('This story is not connected to a Google Flow project. Please connect a Flow project first.');
    }

    const character = await getCharacterById(characterId);
    if (!character) {
      throw new Error(`Character not found: ${characterId}`);
    }

    // Check existing mapping
    const existingMapping = await getFlowCharacterMapping(storyId, characterId);
    const referenceUrl = character.referenceImageUrl;

    let localImagePath: string | null = null;
    if (referenceUrl) {
      if (referenceUrl.startsWith('/storage/')) {
        localImagePath = path.join(process.cwd(), 'backend', referenceUrl);
        if (!fs.existsSync(localImagePath)) {
          localImagePath = path.join(process.cwd(), referenceUrl);
        }
      }
    }

    // Idempotent: If already synced and reference has not changed
    if (!options?.force && existingMapping && existingMapping.syncStatus === 'synced') {
      if (!referenceUrl || existingMapping.sourceReferenceUrl === referenceUrl) {
        return {
          success: true,
          mapping: existingMapping,
          message: `Character "${character.name}" is already synchronized with Google Flow project ${flowProjectId}.`,
        };
      }
    }

    // Submit sync request to Flow worker
    const { token, metadata } = await GoogleFlowCredentialService.getOrCreateWorkerCredential();
    const workerUrl = (options?.workerUrl || metadata?.workerUrl || process.env.FLOW_WORKER_URL || 'http://127.0.0.1:4177').replace(/\/+$/, '');
    const projectUrl = `https://flow.google.com/project/${flowProjectId}`;

    const syncRes = await fetch(`${workerUrl}/characters/sync`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({
        characterId: character.id,
        characterName: character.name,
        description: character.visualDescription,
        referenceImagePath: localImagePath,
        projectUrl,
        storyId,
      }),
    });

    if (!syncRes.ok) {
      const errData = await syncRes.json().catch(() => ({}));
      const errMsg = errData.message || `Flow worker returned HTTP ${syncRes.status}`;
      await upsertFlowCharacterMapping({
        storyId,
        characterId,
        flowProjectId,
        flowCharacterName: character.name,
        syncStatus: 'failed',
        lastError: errMsg,
      });
      throw new Error(errMsg);
    }

    const syncPayload = (await syncRes.json()) as any;
    const flowCharName = syncPayload.flowCharacterName || character.name;

    const savedMapping = await upsertFlowCharacterMapping({
      storyId,
      characterId,
      flowProjectId,
      flowCharacterName: flowCharName,
      syncStatus: 'synced',
      sourceReferenceUrl: referenceUrl,
      lastSyncedAt: new Date(),
      lastError: null,
    });

    return {
      success: true,
      mapping: savedMapping,
      message: syncPayload.message || `Character "${character.name}" successfully synchronized to Google Flow as @${flowCharName}.`,
    };
  }

  /**
   * Lists all character mappings for a story.
   */
  public static async getCharacterMappings(storyId: string) {
    return listFlowCharacterMappings(storyId);
  }

  /**
   * Generates all missing backgrounds for a story.
   */
  public static async generateAllMissingBackgrounds(
    storyId: string,
    provider: GenerationProviderType = 'gemini_api',
    options?: { testMockBuffer?: Buffer }
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
          testMockBuffer: options?.testMockBuffer,
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
    provider: GenerationProviderType = 'gemini_api',
    options?: { testMockBuffer?: Buffer }
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
          testMockBuffer: options?.testMockBuffer,
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
