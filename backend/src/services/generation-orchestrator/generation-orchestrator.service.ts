import { randomUUID } from "crypto";
import fs from "fs";
import path from "path";
import {
  StoryContextService,
  SceneContextItem,
  CharacterContextItem,
} from "../google-flow/story-context.service.js";
import {
  GenerationPromptService,
  normalizeCharacterFacingDirection,
} from "../google-flow/generation-prompt.service.js";
import { GeminiImageProvider } from "../image-generation/providers/gemini-image.provider.js";
import {
  GoogleFlowAssetImportService,
  ImportAssetResult,
  resolveGoogleFlowBackgroundVersionReferences,
} from "../google-flow/google-flow-asset-import.service.js";
import { GoogleFlowCredentialService } from "../google-flow/google-flow-credential.service.js";
import {
  prisma,
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
} from "../database/database.service.js";

export type GenerationProviderType = "gemini_api" | "google_flow";

export interface GenerationJobRecord {
  id: string;
  storyId: string;
  targetType: "background" | "character";
  sceneId?: string;
  characterId?: string;
  assetType?:
    | "scene_background"
    | "master_reference"
    | "turnaround"
    | "expression"
    | "pose";
  variation?: string;
  provider: GenerationProviderType;
  prompt: string;
  status:
    | "queued"
    | "preparing"
    | "prompt_filled"
    | "agent_prompt_submitted"
    | "awaiting_agent_confirmation"
    | "generation_submitted"
    | "generating"
    | "output_detected"
    | "downloading"
    | "importing"
    | "completed"
    | "failed"
    | "cancelled"
    | "awaiting_download"
    | "awaiting_manual_action";
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
  public static async listJobs(
    storyId?: string,
  ): Promise<GenerationJobRecord[]> {
    try {
      const dbJobs = await listGenerationJobs(
        storyId ? { storyId } : undefined,
      );
      if (dbJobs.length > 0) {
        return dbJobs.map((j) => ({
          id: j.id,
          storyId: j.storyId || "",
          targetType: j.targetType.includes("character")
            ? "character"
            : "background",
          sceneId: j.sceneId || undefined,
          characterId: j.characterId || undefined,
          assetType: (j.assetType as any) || undefined,
          provider: j.provider as any,
          prompt: j.prompt,
          status: (j.status as any) || "queued",
          progress: j.progress,
          workerJobId: j.workerJobId || undefined,
          result: j.resultUrl
            ? {
                success: true,
                target: j.targetType,
                assetId: j.resultAssetId || j.id,
                imageUrl: j.resultUrl,
                message: "Completed",
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
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );
    if (storyId) {
      return all.filter((j) => j.storyId === storyId);
    }
    return all;
  }

  /**
   * Retrieves job status and reconciles active jobs with Flow Worker.
   */
  public static async getJob(
    jobId: string,
  ): Promise<GenerationJobRecord | undefined> {
    try {
      const j = await getGenerationJob(jobId);
      if (j) {
        // Reconcile with worker if job is in progress
        if (
          j.provider === "google_flow" &&
          j.workerJobId &&
          !["completed", "failed", "cancelled"].includes(j.status)
        ) {
          try {
            const { token, metadata } =
              await GoogleFlowCredentialService.getOrCreateWorkerCredential();
            const workerUrl = (
              metadata?.workerUrl ||
              process.env.FLOW_WORKER_URL ||
              "http://127.0.0.1:4177"
            ).replace(/\/+$/, "");
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

                if (wJob.status === "completed" && wJob.importResult) {
                  nextStatus = "completed";
                  nextProgress = 100;
                  resultUrl =
                    wJob.importResult.imageUrl || wJob.importResult.url;
                  resultAssetId = wJob.importResult.assetId;
                } else if (wJob.status === "failed") {
                  nextStatus = "failed";
                } else if (wJob.status === "prompt_filled") {
                  nextStatus = "prompt_filled";
                  nextProgress = 25;
                } else if (wJob.status === "agent_prompt_submitted") {
                  nextStatus = "agent_prompt_submitted";
                  nextProgress = 35;
                } else if (wJob.status === "awaiting_agent_confirmation") {
                  nextStatus = "awaiting_agent_confirmation";
                  nextProgress = 40;
                } else if (wJob.status === "generation_submitted") {
                  nextStatus = "generation_submitted";
                  nextProgress = 45;
                } else if (wJob.status === "generating") {
                  nextStatus = "generating";
                  nextProgress = 60;
                } else if (wJob.status === "output_detected") {
                  nextStatus = "output_detected";
                  nextProgress = 75;
                } else if (wJob.status === "downloading") {
                  nextStatus = "downloading";
                  nextProgress = 85;
                } else if (wJob.status === "importing") {
                  nextStatus = "importing";
                  nextProgress = 95;
                } else if (wJob.status === "awaiting_download") {
                  nextStatus = "awaiting_download";
                  nextProgress = 70;
                } else if (wJob.status === "awaiting_manual_generate") {
                  nextStatus = "awaiting_manual_action";
                }

                if (nextStatus !== j.status || resultUrl !== j.resultUrl) {
                  await updateGenerationJob(j.id, {
                    status: nextStatus,
                    progress: nextProgress,
                    resultUrl: resultUrl || undefined,
                    resultAssetId: resultAssetId || undefined,
                    error: wJob.error || undefined,
                    completedAt:
                      nextStatus === "completed" ? new Date() : undefined,
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
          storyId: j.storyId || "",
          targetType: j.targetType.includes("character")
            ? "character"
            : "background",
          sceneId: j.sceneId || undefined,
          characterId: j.characterId || undefined,
          assetType: (j.assetType as any) || undefined,
          provider: j.provider as any,
          prompt: j.prompt,
          status: (j.status as any) || "queued",
          progress: j.progress,
          workerJobId: j.workerJobId || undefined,
          result: j.resultUrl
            ? {
                success: true,
                target: j.targetType,
                assetId: j.resultAssetId || j.id,
                imageUrl: j.resultUrl,
                message: "Completed",
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
  public static async cancelActiveFlowJob(): Promise<{
    success: boolean;
    message: string;
  }> {
    try {
      const { token, metadata } =
        await GoogleFlowCredentialService.getOrCreateWorkerCredential();
      const workerUrl = (
        metadata?.workerUrl ||
        process.env.FLOW_WORKER_URL ||
        "http://127.0.0.1:4177"
      ).replace(/\/+$/, "");
      const res = await fetch(`${workerUrl}/jobs/cancel-active`, {
        method: "POST",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      }).catch(() => null);

      // Reconcile any in-memory or PostgreSQL jobs that are active
      for (const [id, j] of this.jobs.entries()) {
        if (
          j.provider === "google_flow" &&
          !["completed", "cancelled", "failed"].includes(j.status)
        ) {
          j.status = "cancelled";
          j.error = "Cancelled by user request.";
          j.updatedAt = new Date().toISOString();
          try {
            await updateGenerationJob(id, {
              status: "cancelled",
              error: "Cancelled by user request.",
            });
          } catch {}
        }
      }
      try {
        await prisma.generationJob.updateMany({
          where: {
            provider: "google_flow",
            status: { notIn: ["completed", "cancelled", "failed"] },
          },
          data: { status: "cancelled", error: "Cancelled by user request." },
        });
      } catch {}

      if (res && res.ok) {
        const data = await res.json().catch(() => ({}));
        return {
          success: true,
          message:
            data.message || "Active Google Flow job cancelled successfully.",
        };
      }
      return { success: true, message: "Active Google Flow jobs cleared." };
    } catch (err: any) {
      return {
        success: false,
        message: err.message || "Failed to cancel active Flow job.",
      };
    }
  }

  /**
   * Cancels a specific generation job by ID.
   */
  public static async cancelJob(
    jobId: string,
  ): Promise<{ success: boolean; message: string }> {
    const job = await this.getJob(jobId);
    if (!job) {
      return { success: false, message: "Job not found." };
    }
    if (job.workerJobId) {
      try {
        const { token, metadata } =
          await GoogleFlowCredentialService.getOrCreateWorkerCredential();
        const workerUrl = (
          metadata?.workerUrl ||
          process.env.FLOW_WORKER_URL ||
          "http://127.0.0.1:4177"
        ).replace(/\/+$/, "");
        await fetch(`${workerUrl}/jobs/${job.workerJobId}`, {
          method: "DELETE",
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        }).catch(() => {});
      } catch {}
    }
    job.status = "cancelled";
    job.error = "Job cancelled by user request.";
    job.updatedAt = new Date().toISOString();
    try {
      await updateGenerationJob(jobId, {
        status: "cancelled",
        error: "Job cancelled by user request.",
      });
    } catch {}
    return { success: true, message: `Job ${jobId} was cancelled.` };
  }

  /**
   * Checks the readiness status of generation providers.
   */
  public static async getProviderStatus(): Promise<{
    gemini_api: { available: boolean; model: string; message: string };
    google_flow: {
      available: boolean;
      browserRunning: boolean;
      authenticated: boolean;
      message: string;
    };
  }> {
    // 1. Check Gemini Image API
    const geminiKey =
      process.env.GOOGLE_GEMINI_API_KEY || process.env.GEMINI_API_KEY;
    const geminiModel =
      process.env.GEMINI_IMAGE_MODEL || "gemini-2.5-flash-image";
    const geminiAvailable = Boolean(geminiKey && geminiKey.trim().length > 0);

    // 2. Check Google Flow worker using PostgreSQL persisted configuration
    let flowAvailable = false;
    let flowBrowserRunning = false;
    let flowAuthenticated = false;
    let flowMessage = "Worker offline";

    try {
      const cred =
        await GoogleFlowCredentialService.getOrCreateWorkerCredential();
      const token = cred.token;
      const workerUrl = (
        cred.metadata?.workerUrl ||
        process.env.FLOW_WORKER_URL ||
        "http://127.0.0.1:4177"
      ).replace(/\/+$/, "");

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
        flowMessage = payload.session?.message || "Worker online";
      }
    } catch {
      flowMessage =
        "Could not connect to loopback Google Flow worker at configured endpoint";
    }

    return {
      gemini_api: {
        available: geminiAvailable,
        model: geminiModel,
        message: geminiAvailable
          ? "Ready for direct background and character generation"
          : "GEMINI_API_KEY is not configured",
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
    const {
      storyId,
      sceneId,
      provider = "gemini_api",
      promptOverride,
      aspectRatio,
      testMockBuffer,
    } = params;

    // 1. Resolve Story & Scene Context
    const context = await StoryContextService.resolveStoryContext(storyId, {
      sceneId,
    });
    const scene = context.scenes.find(
      (s) => s.sceneId === sceneId || s.id === sceneId,
    );

    if (!scene) {
      throw new Error(`Scene ${sceneId} not found in story ${storyId}`);
    }

    // 2. Compose strict environment-only prompt
    const promptData = GenerationPromptService.buildSceneBackgroundPrompt(
      {
        visualStyle: context.story.visualStyle,
        aspectRatio: aspectRatio || scene.aspectRatio,
      },
      scene,
      promptOverride,
    );

    const jobId = `job-bg-${Date.now()}-${randomUUID().slice(0, 6)}`;
    const jobRecord: GenerationJobRecord = {
      id: jobId,
      storyId,
      sceneId: scene.sceneId,
      targetType: "background",
      assetType: "scene_background",
      provider,
      prompt: promptData.prompt,
      status: "preparing",
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
        targetType: "scene_background",
        assetType: "scene_background",
        prompt: promptData.prompt,
        flowProjectId: context.story.flowProjectId || undefined,
        status: "preparing",
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
      if (provider === "gemini_api") {
        jobRecord.status = "generating";
        jobRecord.progress = 40;
        jobRecord.updatedAt = new Date().toISOString();

        let imageBuffer: Buffer;
        if (testMockBuffer) {
          imageBuffer = testMockBuffer;
        } else {
          const geminiProvider = new GeminiImageProvider();

          if (!geminiProvider.isConfigured()) {
            throw new Error(
              "GEMINI_API_KEY is not configured in your environment or settings. Please provide a valid Gemini API key or switch Generation Engine to Google Flow.",
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

        jobRecord.status = "importing";
        jobRecord.progress = 80;
        jobRecord.updatedAt = new Date().toISOString();

        // Persist directly to Scene & Image asset storage
        const importResult = await GoogleFlowAssetImportService.importAsset({
          target: "scene_background",
          sceneId: scene.sceneId,
          storyId,
          imageData: imageBuffer,
          aspectRatio: promptData.aspectRatio,
          prompt: promptData.prompt,
          provider: "gemini_api",
          model: "imagen-3",
          sourceJobId: jobId,
          filename: `gemini-${scene.sceneId}-${Date.now()}.png`,
        });

        jobRecord.status = "completed";
        jobRecord.progress = 100;
        jobRecord.result = importResult;
        jobRecord.updatedAt = new Date().toISOString();

        try {
          await updateGenerationJob(jobId, {
            status: "completed",
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
      if (provider === "google_flow") {
        const flowProjectId = context.story.flowProjectId;
        if (!flowProjectId) {
          throw new Error(
            "This story is not connected to a Google Flow project. Please connect a Google Flow project first.",
          );
        }

        jobRecord.status = "generating";
        jobRecord.progress = 30;
        jobRecord.updatedAt = new Date().toISOString();

        const { token, metadata } =
          await GoogleFlowCredentialService.getOrCreateWorkerCredential();
        const workerUrl = (
          metadata?.workerUrl ||
          process.env.FLOW_WORKER_URL ||
          "http://127.0.0.1:4177"
        ).replace(/\/+$/, "");

        // Ensure worker token is synchronized to local disk
        GoogleFlowCredentialService.syncLocalWorkerTokenFile(token);

        const projectUrl = `https://flow.google.com/project/${flowProjectId}`;

        // 1. Submit Job to Worker
        let submitRes = await fetch(`${workerUrl}/jobs`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify({
            targetType: "background",
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
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${token}`,
              },
              body: JSON.stringify({
                targetType: "background",
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
            if (
              errData.message?.includes("browser session") ||
              errData.message?.includes("browser is not open")
            ) {
              throw new Error(
                "Google Flow browser is not open. Please click 'Open Flow Browser' in the top bar to launch the companion browser.",
              );
            }
            if (errData.message?.includes("Another Flow job is active")) {
              throw new Error(
                "Another Google Flow generation is active. Wait for it to finish or cancel that specific job before starting this background generation.",
              );
            }
          }
          if (!submitRes.ok) {
            if (submitRes.status === 401) {
              throw new Error(
                "Flow worker authentication out of sync. Please retry or click 'Verify / Reconnect' in Integration Studio.",
              );
            }
            const retryErr = (await submitRes.json().catch(() => ({}))) as any;
            throw new Error(
              retryErr.message ||
                errData.message ||
                `Flow worker returned HTTP ${submitRes.status}`,
            );
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
            status: "generating",
            progress: 50,
          });
        } catch {}

        // 2. Trigger Generation on Worker
        let genRes = await fetch(`${workerUrl}/jobs/${workerJobId}/generate`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify({
            confirmGenerate: true,
            referenceConfirmed: true,
          }),
        });

        if (genRes.status === 401 && token) {
          try {
            GoogleFlowCredentialService.syncLocalWorkerTokenFile(token);
            await GoogleFlowCredentialService.provisionWorker(workerUrl);
            genRes = await fetch(`${workerUrl}/jobs/${workerJobId}/generate`, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
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
          if (genRes.status === 401) {
            throw new Error(
              "Flow worker authentication out of sync. Please retry or click 'Verify / Reconnect' in Integration Studio.",
            );
          }
          const errData = (await genRes.json().catch(() => ({}))) as any;
          throw new Error(
            errData.message || "Flow worker generation trigger failed",
          );
        }

        // 3. Await generation settlement if fast (e.g. in tests/mocked worker), up to 10 seconds
        let completedResult: any = null;
        const pollStart = Date.now();
        while (Date.now() - pollStart < 10000) {
          const statusRes = await fetch(`${workerUrl}/jobs/${workerJobId}`, {
            headers: token ? { Authorization: `Bearer ${token}` } : {},
          }).catch(() => null);

          if (statusRes && statusRes.ok) {
            const workerStatus = (await statusRes
              .json()
              .catch(() => ({}))) as any;
            const wJob = workerStatus.job;
            if (wJob?.status === "completed" && wJob?.importResult) {
              completedResult = wJob.importResult;
              break;
            }
            if (wJob?.status === "failed") {
              throw new Error(wJob.error || "Flow worker generation failed");
            }
          }
          await new Promise((r) => setTimeout(r, 1000));
        }

        if (completedResult) {
          jobRecord.status = "completed";
          jobRecord.progress = 100;
          jobRecord.result = completedResult;
          jobRecord.updatedAt = new Date().toISOString();

          try {
            await updateGenerationJob(jobId, {
              status: "completed",
              progress: 100,
              resultAssetId: completedResult.assetId,
              resultUrl: completedResult.imageUrl || completedResult.url,
              completedAt: new Date(),
            });
          } catch (dbErr: any) {
            console.warn(
              "[GenerationOrchestrator] Could not persist job completion to database:",
              dbErr.message,
            );
          }

          return {
            success: true,
            jobId: jobRecord.id,
            workerJobId,
            status: "completed",
            target: "scene_background",
            assetId: scene.sceneId,
            sceneId: scene.sceneId,
            imageUrl: completedResult.imageUrl || completedResult.url,
            aspectRatio: promptData.aspectRatio,
            message:
              "Google Flow background generation completed and imported successfully.",
          };
        }

        // Return ongoing job info with persistent job ID and generating status
        return {
          success: true,
          jobId: jobRecord.id,
          workerJobId,
          status: "generating",
          target: "scene_background",
          sceneId: scene.sceneId,
          assetId: scene.sceneId,
          imageUrl: null,
          aspectRatio: promptData.aspectRatio,
          message: "Google Flow generation started.",
        };
      }

      throw new Error(`Unsupported generation provider: ${provider}`);
    } catch (err: any) {
      jobRecord.status = "failed";
      jobRecord.error = err.message || "Generation failed";
      jobRecord.updatedAt = new Date().toISOString();

      try {
        await updateGenerationJob(jobId, {
          status: "failed",
          error: err.message || "Generation failed",
        });
      } catch {}

      throw err;
    }
  }

  /**
   * Regenerates a scene background plate using an existing image record's Flow editor URL and asset ID.
   */
  public static async regenerateSceneBackground(params: {
    storyId?: string;
    sceneId?: string;
    imageId: string;
    promptOverride?: string;
  }): Promise<ImportAssetResult> {
    const { imageId, promptOverride } = params;

    // 1. Fetch Image record from database
    const imageRecord = await prisma.image.findUnique({
      where: { id: imageId },
      include: {
        scene: {
          include: {
            backgroundVersions: true,
          },
        },
      },
    });

    if (!imageRecord) {
      throw new Error(`Image record not found: ${imageId}`);
    }

    const sceneId = params.sceneId || imageRecord.sceneId;
    if (!sceneId) {
      throw new Error(`Image ${imageId} is not associated with a scene.`);
    }

    // The Image columns are the fast path. For older imports, resolve the same
    // editor reference from the canonical background version metadata instead.
    const matchingBackgroundVersion =
      imageRecord.scene?.backgroundVersions?.find(
        (version) =>
          version.localImageId === imageRecord.id &&
          version.provider === imageRecord.provider,
      ) || null;
    const activeBackgroundVersion =
      imageRecord.scene?.backgroundVersions?.find(
        (version) =>
          version.version === imageRecord.scene?.activeBackgroundVersion,
      ) || null;
    const backgroundVersion =
      matchingBackgroundVersion ||
      (activeBackgroundVersion?.provider === imageRecord.provider &&
      (activeBackgroundVersion.localImageId === imageRecord.id ||
        (!activeBackgroundVersion.localImageId &&
          ((activeBackgroundVersion.storageKey &&
            activeBackgroundVersion.storageKey === imageRecord.storageKey) ||
            (activeBackgroundVersion.imageUrl &&
              activeBackgroundVersion.imageUrl === imageRecord.imageUrl))))
        ? activeBackgroundVersion
        : null);
    const flowReferences = resolveGoogleFlowBackgroundVersionReferences(
      {
        // Prisma stores these optional reference columns as nullable. The
        // reference resolver accepts undefined for absent optional metadata.
        googleFlowProjectId: imageRecord.googleFlowProjectId ?? undefined,
        googleFlowEditId: imageRecord.googleFlowEditId ?? undefined,
        googleFlowEditUrl: imageRecord.googleFlowEditUrl ?? undefined,
        googleFlowPrompt: imageRecord.googleFlowPrompt ?? undefined,
        googleFlowParentAssetId:
          imageRecord.googleFlowParentAssetId ?? undefined,
        googleFlowVersion: imageRecord.googleFlowVersion ?? undefined,
        googleFlowImageId: imageRecord.googleFlowImageId ?? undefined,
        googleFlowImageRef: imageRecord.googleFlowImageRef ?? undefined,
      },
      backgroundVersion,
    );
    const editUrl = flowReferences.googleFlowEditUrl;

    if (!editUrl) {
      throw new Error(
        `Image ${imageId} does not have a Google Flow editor URL or editor reference.`,
      );
    }

    const storyId = params.storyId || imageRecord.scene?.storyId;
    if (!storyId) {
      throw new Error(
        `Story context could not be resolved for image ${imageId}.`,
      );
    }

    // 2. Resolve Story Context & Prompt
    const context = await StoryContextService.resolveStoryContext(storyId, {
      sceneId,
    });
    const scene = context.scenes.find(
      (s) => s.sceneId === sceneId || s.id === sceneId,
    );
    if (!scene) {
      throw new Error(`Scene ${sceneId} not found in story ${storyId}`);
    }

    const promptData = GenerationPromptService.buildSceneBackgroundPrompt(
      {
        visualStyle: context.story.visualStyle,
        aspectRatio: scene.aspectRatio,
      },
      scene,
      promptOverride || flowReferences.googleFlowPrompt || imageRecord.prompt,
    );

    const jobId = `job-bg-regen-${Date.now()}-${randomUUID().slice(0, 6)}`;
    const jobRecord: GenerationJobRecord = {
      id: jobId,
      storyId,
      sceneId: scene.sceneId,
      targetType: "background",
      assetType: "scene_background",
      provider: "google_flow",
      prompt: promptData.prompt,
      status: "preparing",
      progress: 10,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    this.jobs.set(jobId, jobRecord);

    try {
      await createGenerationJob({
        id: jobId,
        storyId,
        sceneId: scene.sceneId,
        provider: "google_flow",
        targetType: "scene_background",
        assetType: "scene_background",
        prompt: promptData.prompt,
        flowProjectId:
          flowReferences.googleFlowProjectId ||
          context.story.flowProjectId ||
          undefined,
        status: "preparing",
        progress: 10,
        metadata: {
          aspectRatio: promptData.aspectRatio,
          width: promptData.width,
          height: promptData.height,
          isRegeneration: true,
          parentImageId: imageRecord.id,
          googleFlowEditUrl: editUrl,
        },
      });
    } catch {}

    try {
      const { token, metadata } =
        await GoogleFlowCredentialService.getOrCreateWorkerCredential();
      const workerUrl = (
        metadata?.workerUrl ||
        process.env.FLOW_WORKER_URL ||
        "http://127.0.0.1:4177"
      ).replace(/\/+$/, "");
      GoogleFlowCredentialService.syncLocalWorkerTokenFile(token);

      jobRecord.status = "generating";
      jobRecord.progress = 30;
      jobRecord.updatedAt = new Date().toISOString();

      // Submit regeneration job to worker
      let submitRes = await fetch(`${workerUrl}/jobs`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          targetType: "background",
          isRegeneration: true,
          storyId,
          sceneId: scene.sceneId,
          prompt: promptData.prompt,
          aspectRatio: promptData.aspectRatio,
          editUrl,
          googleFlowEditUrl: editUrl,
          googleFlowProjectId:
            flowReferences.googleFlowProjectId || context.story.flowProjectId,
          googleFlowEditId: flowReferences.googleFlowEditId,
          googleFlowParentAssetId: imageRecord.id,
          googleFlowVersion: (flowReferences.googleFlowVersion || 1) + 1,
        }),
      });

      if (!submitRes.ok) {
        const errData = (await submitRes.json().catch(() => ({}))) as any;
        throw new Error(
          errData.message || `Flow worker returned HTTP ${submitRes.status}`,
        );
      }

      const submitPayload = (await submitRes.json()) as any;
      const workerJobId = submitPayload.job?.id || jobId;

      jobRecord.workerJobId = workerJobId;
      jobRecord.progress = 50;
      jobRecord.updatedAt = new Date().toISOString();

      try {
        await updateGenerationJob(jobId, {
          workerJobId,
          status: "generating",
          progress: 50,
        });
      } catch {}

      // Trigger generation on worker
      let genRes = await fetch(`${workerUrl}/jobs/${workerJobId}/generate`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          confirmGenerate: true,
          referenceConfirmed: true,
        }),
      });

      if (!genRes.ok) {
        const errData = (await genRes.json().catch(() => ({}))) as any;
        throw new Error(
          errData.message || "Flow worker regeneration trigger failed",
        );
      }

      // Poll briefly for completion
      let completedResult: any = null;
      const pollStart = Date.now();
      while (Date.now() - pollStart < 10000) {
        const statusRes = await fetch(`${workerUrl}/jobs/${workerJobId}`, {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        }).catch(() => null);

        if (statusRes && statusRes.ok) {
          const workerStatus = (await statusRes
            .json()
            .catch(() => ({}))) as any;
          const wJob = workerStatus.job;
          if (wJob?.status === "completed" && wJob?.importResult) {
            completedResult = wJob.importResult;
            break;
          }
          if (wJob?.status === "failed") {
            throw new Error(wJob.error || "Flow worker regeneration failed");
          }
        }
        await new Promise((r) => setTimeout(r, 1000));
      }

      if (completedResult) {
        jobRecord.status = "completed";
        jobRecord.progress = 100;
        jobRecord.result = completedResult;
        jobRecord.updatedAt = new Date().toISOString();

        try {
          await updateGenerationJob(jobId, {
            status: "completed",
            progress: 100,
            resultAssetId: completedResult.assetId,
            resultUrl: completedResult.imageUrl || completedResult.url,
            completedAt: new Date(),
          });
        } catch {}

        return {
          success: true,
          jobId: jobRecord.id,
          workerJobId,
          status: "completed",
          target: "scene_background",
          assetId: completedResult.assetId || scene.sceneId,
          sceneId: scene.sceneId,
          imageUrl: completedResult.imageUrl || completedResult.url,
          aspectRatio: promptData.aspectRatio,
          message:
            "Google Flow background regeneration completed and imported successfully.",
        };
      }

      return {
        success: true,
        jobId: jobRecord.id,
        workerJobId,
        status: "generating",
        target: "scene_background",
        sceneId: scene.sceneId,
        assetId: scene.sceneId,
        imageUrl: null,
        aspectRatio: promptData.aspectRatio,
        message: "Google Flow regeneration started.",
      };
    } catch (err: any) {
      jobRecord.status = "failed";
      jobRecord.error = err.message || "Regeneration failed";
      jobRecord.updatedAt = new Date().toISOString();
      try {
        await updateGenerationJob(jobId, {
          status: "failed",
          error: err.message || "Regeneration failed",
        });
      } catch {}
      throw err;
    }
  }

  /**
   * Generates a character asset (Master Reference, Turnaround, Expression, or Pose).
   */
  private static resolveLocalReferencePath(
    referenceUrl?: string | null,
  ): string | null {
    if (!referenceUrl || typeof referenceUrl !== "string") return null;
    const cleanUrl = referenceUrl.trim().replace(/\\/g, "/");
    const storageMatch = cleanUrl.match(
      /(?:^|https?:\/\/[^/]+)(\/storage\/.+)$/i,
    );
    if (!storageMatch) return null;
    const relFromRoot = storageMatch[1].replace(/^\/+/, "");
    const candidates = [
      path.resolve(process.cwd(), relFromRoot),
      path.resolve(process.cwd(), "backend", relFromRoot),
    ];
    for (const candidate of candidates) {
      if (fs.existsSync(candidate)) {
        return candidate;
      }
    }
    return null;
  }

  public static async generateCharacterAsset(params: {
    storyId: string;
    characterId: string;
    provider?: GenerationProviderType;
    assetType?: "master_reference" | "turnaround" | "expression" | "pose";
    variation?: string;
    promptOverride?: string;
    testMockBuffer?: Buffer;
  }): Promise<ImportAssetResult> {
    const {
      storyId,
      characterId,
      provider = "gemini_api",
      assetType = "master_reference",
      variation,
      promptOverride,
      testMockBuffer,
    } = params;

    const normalizedVariation =
      assetType === "turnaround"
        ? normalizeCharacterFacingDirection(variation || "front")
        : variation;

    // 1. Resolve Story and Character Context
    const context = await StoryContextService.resolveStoryContext(storyId, {
      characterId,
    });
    const character = context.characters.find((c) => c.id === characterId);

    if (!character) {
      throw new Error(`Character ${characterId} not found in story ${storyId}`);
    }

    // Prevent duplicate jobs across the in-memory cache and persisted job
    // history. Existing jobs can be in any non-terminal lifecycle state.
    const activeStatuses = new Set([
      "queued",
      "preparing",
      "prompt_filled",
      "agent_prompt_submitted",
      "awaiting_agent_confirmation",
      "generation_submitted",
      "generating",
      "output_detected",
      "downloading",
      "importing",
      "awaiting_download",
      "awaiting_manual_action",
    ]);
    const matchingJob = (candidate: any) => {
      const candidateVariation =
        candidate.variation ?? candidate.metadata?.variation ?? "";
      return (
        candidate.storyId === storyId &&
        candidate.characterId === character.id &&
        candidate.provider === provider &&
        candidate.assetType === assetType &&
        String(candidateVariation || "") === String(normalizedVariation || "") &&
        activeStatuses.has(candidate.status)
      );
    };

    let existingJob: any = Array.from(this.jobs.values()).find(matchingJob);
    if (!existingJob) {
      try {
        const persistedJobs = await listGenerationJobs({
          storyId,
          characterId: character.id,
        });
        existingJob = persistedJobs.find(matchingJob);
      } catch (error) {
        console.warn(
          "[GenerationOrchestrator] Could not inspect persisted character jobs for duplicate prevention:",
          (error as Error).message,
        );
      }
    }

    if (existingJob) {
      return {
        success: true,
        jobId: existingJob.id,
        workerJobId: existingJob.workerJobId || undefined,
        status: existingJob.status,
        target:
          assetType === "master_reference"
            ? "character_reference"
            : "character_view",
        assetId: character.id,
        characterId: character.id,
        imageUrl: null,
        message: `Generation for ${normalizedVariation || assetType} is already in progress.`,
      };
    }

    // 2. Check for existing Flow Character Mapping
    let flowCharacterName = character.name;
    const mapping = await getFlowCharacterMapping(storyId, character.id);
    if (
      mapping &&
      mapping.syncStatus === "synced" &&
      mapping.flowCharacterName
    ) {
      flowCharacterName = mapping.flowCharacterName;
    }

    // 3. Compose a provider-specific prompt. Google Flow's saved Character
    // editor already has the selected character image as visual context; do
    // not insert a plain-text @name or send Gemini's long prompt structure.
    const promptData =
      provider === "google_flow"
        ? GenerationPromptService.buildGoogleFlowCharacterPrompt(
            { visualStyle: context.story.visualStyle },
            character,
            assetType,
            {
              variation: normalizedVariation,
              promptOverride,
              isExistingFlowCharacter: Boolean(
                mapping?.syncStatus === "synced" && mapping.flowCharacterId,
              ),
            },
          )
        : GenerationPromptService.buildCharacterPrompt(
            { visualStyle: context.story.visualStyle },
            character,
            assetType,
            { variation: normalizedVariation, promptOverride },
          );

    const finalPrompt = promptData.prompt;

    const canonicalRefUrl =
      character.referenceImageUrl ||
      (character.canonicalAppearance as any)?.references?.mainUrl ||
      null;
    const localCanonicalRefPath =
      this.resolveLocalReferencePath(canonicalRefUrl);
    const hasSyncedFlowCharacter = Boolean(
      mapping?.syncStatus === "synced" && mapping.flowCharacterId,
    );

    let canonicalReferenceBuffer: Buffer | undefined;
    let canonicalReferenceMime: string | undefined;
    if (assetType !== "master_reference" && !testMockBuffer) {
      if (!canonicalRefUrl) {
        throw new Error(
          "CHARACTER_MASTER_REFERENCE_REQUIRED: Generate or upload and approve a canonical master reference before creating directional views. The generator will not invent a new character for each angle.",
        );
      }

      if (provider === "gemini_api") {
        try {
          if (localCanonicalRefPath) {
            canonicalReferenceBuffer = await fs.promises.readFile(localCanonicalRefPath);
            canonicalReferenceMime =
              /\\.(?:jpe?g)$/i.test(localCanonicalRefPath)
                ? "image/jpeg"
                : /\\.webp$/i.test(localCanonicalRefPath)
                  ? "image/webp"
                  : "image/png";
          } else if (canonicalRefUrl.startsWith("data:image/")) {
            const match = canonicalRefUrl.match(
              /^data:(image\\/[a-zA-Z0-9.+_-]+);base64,(.+)$/,
            );
            if (match) {
              canonicalReferenceMime = match[1];
              canonicalReferenceBuffer = Buffer.from(match[2], "base64");
            }
          }
        } catch (error) {
          throw new Error(
            "CHARACTER_MASTER_REFERENCE_UNREADABLE: Could not read the canonical master image: " +
              (error instanceof Error ? error.message : String(error)),
          );
        }

        if (!canonicalReferenceBuffer || canonicalReferenceBuffer.length < 100) {
          throw new Error(
            "CHARACTER_MASTER_REFERENCE_UNAVAILABLE: The saved master reference cannot be opened by the backend. Repair or re-upload the master image before generating directional views. Text-only generation is blocked to prevent character drift.",
          );
        }
      }

      if (provider === "google_flow" && !hasSyncedFlowCharacter) {
        throw new Error(
          "FLOW_CHARACTER_NOT_SYNCED: This character does not have a saved Google Flow Character mapping. Sync the canonical master reference to Google Flow once, confirm the saved Flow Character, and then generate directional views. The editor will not create a new Flow character for each angle.",
        );
      }
    }

    const jobId = `job-char-${Date.now()}-${randomUUID().slice(0, 6)}`;
    const jobRecord: GenerationJobRecord & { variation?: string } = {
      id: jobId,
      storyId,
      characterId: character.id,
      targetType: "character",
      assetType,
      variation: normalizedVariation,
      provider,
      prompt: finalPrompt,
      status: "preparing",
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
        status: "preparing",
        progress: 10,
        metadata: {
          variation: normalizedVariation || null,
          sourceCanonicalReferenceId: canonicalRefUrl,
        },
      });
    } catch {}

    try {
      if (provider === "gemini_api") {
        jobRecord.status = "generating";
        jobRecord.progress = 40;
        jobRecord.updatedAt = new Date().toISOString();

        let imageBuffer: Buffer;
        if (testMockBuffer) {
          imageBuffer = testMockBuffer;
        } else {
          const geminiProvider = new GeminiImageProvider();

          if (!geminiProvider.isConfigured()) {
            throw new Error(
              "GEMINI_API_KEY is not configured in your environment or settings. Please provide a valid Gemini API key or switch Generation Engine to Google Flow.",
            );
          }

          const generated = await geminiProvider.generateImage({
            prompt: finalPrompt,
            negativePrompt: promptData.negativePrompt,
            width: promptData.width,
            height: promptData.height,
            aspectRatio: "1:1",
            referenceImageBuffer: canonicalReferenceBuffer,
            referenceImageMimeType: canonicalReferenceMime,
          });
          imageBuffer = generated.imageBuffer;
        }

        jobRecord.status = "importing";
        jobRecord.progress = 80;
        jobRecord.updatedAt = new Date().toISOString();

        const targetKind =
          assetType === "master_reference"
            ? "character_reference"
            : "character_view";
        const geminiModel =
          process.env.GEMINI_IMAGE_MODEL || "gemini-2.5-flash-image";
        const importResult = await GoogleFlowAssetImportService.importAsset({
          target: targetKind,
          characterId: character.id,
          storyId,
          isMasterReference: assetType === "master_reference",
          view:
            normalizedVariation ||
            (assetType === "master_reference" ? "front" : assetType),
          imageData: imageBuffer,
          prompt: finalPrompt,
          provider: "gemini_api",
          model: geminiModel,
          sourceJobId: jobId,
          jobId,
          sourceCanonicalReferenceId:
            assetType !== "master_reference"
              ? canonicalRefUrl || undefined
              : undefined,
          filename: `gemini-${character.id}-${assetType}-${Date.now()}.png`,
        });

        jobRecord.status = "completed";
        jobRecord.progress = 100;
        jobRecord.result = importResult;
        jobRecord.updatedAt = new Date().toISOString();

        try {
          await updateGenerationJob(jobId, {
            status: "completed",
            progress: 100,
            resultAssetId: importResult.assetId,
            resultUrl: importResult.imageUrl,
            completedAt: new Date(),
          });
        } catch {}

        return importResult;
      }

      if (provider === "google_flow") {
        const flowProjectId = context.story.flowProjectId;
        if (!flowProjectId) {
          throw new Error(
            "This story is not connected to a Google Flow project. Please connect a Google Flow project first.",
          );
        }

        jobRecord.status = "generating";
        jobRecord.progress = 30;
        jobRecord.updatedAt = new Date().toISOString();

        const { token, metadata } =
          await GoogleFlowCredentialService.getOrCreateWorkerCredential();
        const workerUrl = (
          metadata?.workerUrl ||
          process.env.FLOW_WORKER_URL ||
          "http://127.0.0.1:4177"
        ).replace(/\/+$/, "");

        // Ensure worker token is synchronized to local disk
        GoogleFlowCredentialService.syncLocalWorkerTokenFile(token);

        const projectUrl = `https://flow.google.com/project/${flowProjectId}`;
        const workerJobPayload = {
          targetType: "character",
          backendJobId: jobId,
          characterId: character.id,
          characterName: flowCharacterName,
          googleFlowCharacterId:
            mapping?.syncStatus === "synced"
              ? mapping.flowCharacterId || undefined
              : undefined,
          googleFlowCharacterUrl:
            mapping?.syncStatus === "synced"
              ? mapping.flowCharacterUrl || undefined
              : undefined,
          assetType: assetType === "master_reference" ? "main" : "turnaround",
          isMasterReference: assetType === "master_reference",
          view: normalizedVariation || "front",
          // When a mapped Flow Character exists, the saved editor image is the
          // trusted reference. Otherwise upload the canonical master into the
          // one-time character creation flow; the worker must verify the upload.
          uploadedReferences:
            assetType !== "master_reference" &&
            !hasSyncedFlowCharacter &&
            localCanonicalRefPath
              ? [localCanonicalRefPath]
              : undefined,
          sourceCanonicalReferenceId:
            assetType !== "master_reference"
              ? canonicalRefUrl || undefined
              : undefined,
          prompt: finalPrompt,
          projectUrl,
          storyId,
        };

        let submitRes = await fetch(`${workerUrl}/jobs`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify(workerJobPayload),
        });

        if (submitRes.status === 401 && token) {
          try {
            await GoogleFlowCredentialService.provisionWorker(workerUrl);
            submitRes = await fetch(`${workerUrl}/jobs`, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${token}`,
              },
              body: JSON.stringify(workerJobPayload),
            });
          } catch {}
        }

        if (!submitRes.ok) {
          const errData = (await submitRes.json().catch(() => ({}))) as any;
          if (submitRes.status === 409) {
            if (
              errData.message?.includes("browser session") ||
              errData.message?.includes("browser is not open")
            ) {
              throw new Error(
                "Google Flow browser is not open. Please click 'Open Flow Browser' in the top bar to launch the companion browser.",
              );
            }
            if (errData.message?.includes("Another Flow job is active")) {
              throw new Error(
                "Another Google Flow generation is active. Wait for it to finish or cancel that specific job before starting this one.",
              );
            }
          }
          if (!submitRes.ok) {
            if (submitRes.status === 401) {
              throw new Error(
                "Flow worker authentication out of sync. Please retry or click 'Verify / Reconnect' in Integration Studio.",
              );
            }
            const retryErr = (await submitRes.json().catch(() => ({}))) as any;
            throw new Error(
              retryErr.message ||
                errData.message ||
                `Flow worker returned HTTP ${submitRes.status}`,
            );
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
            status: "generating",
            progress: 50,
          });
        } catch {}

        let genRes = await fetch(`${workerUrl}/jobs/${workerJobId}/generate`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify({
            confirmGenerate: true,
            referenceConfirmed: true,
          }),
        });

        if (genRes.status === 401 && token) {
          try {
            GoogleFlowCredentialService.syncLocalWorkerTokenFile(token);
            await GoogleFlowCredentialService.provisionWorker(workerUrl);
            genRes = await fetch(`${workerUrl}/jobs/${workerJobId}/generate`, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
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
          if (genRes.status === 401) {
            throw new Error(
              "Flow worker authentication out of sync. Please retry or click 'Verify / Reconnect' in Integration Studio.",
            );
          }
          const errData = (await genRes.json().catch(() => ({}))) as any;
          throw new Error(
            errData.message ||
              "Flow worker character generation trigger failed",
          );
        }

        // Await generation settlement if fast (up to 10 seconds)
        let completedResult: any = null;
        const pollStart = Date.now();
        while (Date.now() - pollStart < 10000) {
          const statusRes = await fetch(`${workerUrl}/jobs/${workerJobId}`, {
            headers: token ? { Authorization: `Bearer ${token}` } : {},
          }).catch(() => null);

          if (statusRes && statusRes.ok) {
            const workerStatus = (await statusRes
              .json()
              .catch(() => ({}))) as any;
            const wJob = workerStatus.job;
            if (wJob?.status === "completed" && wJob?.importResult) {
              completedResult = wJob.importResult;
              break;
            }
            if (wJob?.status === "failed") {
              throw new Error(wJob.error || "Flow worker generation failed");
            }
          }
          await new Promise((r) => setTimeout(r, 1000));
        }

        if (completedResult) {
          jobRecord.status = "completed";
          jobRecord.progress = 100;
          jobRecord.result = completedResult;
          jobRecord.updatedAt = new Date().toISOString();

          try {
            await updateGenerationJob(jobId, {
              status: "completed",
              progress: 100,
              resultAssetId: completedResult.assetId,
              resultUrl: completedResult.imageUrl || completedResult.url,
              completedAt: new Date(),
            });
          } catch {}

          return {
            success: true,
            jobId: jobRecord.id,
            workerJobId,
            status: "completed",
            target:
              assetType === "master_reference"
                ? "character_reference"
                : "character_view",
            assetId: completedResult.assetId,
            characterId: character.id,
            imageUrl: completedResult.imageUrl || completedResult.url,
            message:
              "Google Flow character view generation completed and imported successfully.",
          };
        }

        return {
          success: true,
          jobId: jobRecord.id,
          workerJobId,
          status: "generating",
          target:
            assetType === "master_reference"
              ? "character_reference"
              : "character_view",
          assetId: character.id,
          characterId: character.id,
          imageUrl: null,
          message: "Google Flow generation started.",
        };
      }

      throw new Error(`Unsupported generation provider: ${provider}`);
    } catch (err: any) {
      jobRecord.status = "failed";
      jobRecord.error = err.message || "Generation failed";
      jobRecord.updatedAt = new Date().toISOString();

      try {
        await updateGenerationJob(jobId, {
          status: "failed",
          error: err.message || "Generation failed",
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
    options?: { force?: boolean; workerUrl?: string },
  ): Promise<{
    success: boolean;
    mapping: any;
    message: string;
  }> {
    const context = await StoryContextService.resolveStoryContext(storyId);
    const flowProjectId = context.story.flowProjectId;
    if (!flowProjectId) {
      throw new Error(
        "This story is not connected to a Google Flow project. Please connect a Flow project first.",
      );
    }

    const character = await getCharacterById(characterId);
    if (!character) {
      throw new Error(`Character not found: ${characterId}`);
    }

    // Check existing mapping
    const existingMapping = await getFlowCharacterMapping(storyId, characterId);
    const referenceUrl =
      character.referenceImageUrl ||
      (character.canonicalAppearance as any)?.references?.mainUrl ||
      null;

    const localImagePath = this.resolveLocalReferencePath(referenceUrl);

    // Idempotent: If already synced and reference has not changed
    if (
      !options?.force &&
      existingMapping &&
      existingMapping.syncStatus === "synced"
    ) {
      if (
        !referenceUrl ||
        existingMapping.sourceReferenceUrl === referenceUrl
      ) {
        return {
          success: true,
          mapping: existingMapping,
          message: `Character "${character.name}" is already synchronized with Google Flow project ${flowProjectId}.`,
        };
      }
    }

    // Submit sync request to Flow worker
    const { token, metadata } =
      await GoogleFlowCredentialService.getOrCreateWorkerCredential();
    const workerUrl = (
      options?.workerUrl ||
      metadata?.workerUrl ||
      process.env.FLOW_WORKER_URL ||
      "http://127.0.0.1:4177"
    ).replace(/\/+$/, "");
    const projectUrl = `https://flow.google.com/project/${flowProjectId}`;

    const syncRes = await fetch(`${workerUrl}/characters/sync`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
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
      const errMsg =
        errData.message || `Flow worker returned HTTP ${syncRes.status}`;
      await upsertFlowCharacterMapping({
        storyId,
        characterId,
        flowProjectId,
        flowCharacterName: character.name,
        syncStatus: "failed",
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
      flowCharacterId: syncPayload.flowCharacterId || undefined,
      flowCharacterUrl: syncPayload.flowCharacterUrl || undefined,
      syncStatus: "synced",
      sourceReferenceUrl: referenceUrl,
      lastSyncedAt: new Date(),
      lastError: null,
    });

    return {
      success: true,
      mapping: savedMapping,
      message:
        syncPayload.message ||
        `Character "${character.name}" successfully synchronized to Google Flow as @${flowCharName}.`,
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
    provider: GenerationProviderType = "gemini_api",
    options?: { testMockBuffer?: Buffer },
  ): Promise<{
    total: number;
    generated: number;
    failed: number;
    results: Array<{
      sceneId: string;
      success: boolean;
      imageUrl?: string;
      error?: string;
    }>;
  }> {
    const context = await StoryContextService.resolveStoryContext(storyId);
    const missingScenes = context.scenes.filter((s) => !s.hasBackground);

    const results: Array<{
      sceneId: string;
      success: boolean;
      imageUrl?: string;
      error?: string;
    }> = [];
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
          imageUrl: res.imageUrl || undefined,
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
    provider: GenerationProviderType = "gemini_api",
    options?: { testMockBuffer?: Buffer },
  ): Promise<{
    total: number;
    generated: number;
    failed: number;
    results: Array<{
      characterId: string;
      name: string;
      success: boolean;
      imageUrl?: string;
      error?: string;
    }>;
  }> {
    const context = await StoryContextService.resolveStoryContext(storyId);
    const missingChars = context.characters.filter(
      (c) => !c.hasMasterReference,
    );

    const results: Array<{
      characterId: string;
      name: string;
      success: boolean;
      imageUrl?: string;
      error?: string;
    }> = [];
    let generated = 0;
    let failed = 0;

    for (const char of missingChars) {
      try {
        const res = await this.generateCharacterAsset({
          storyId,
          characterId: char.id,
          provider,
          assetType: "master_reference",
          testMockBuffer: options?.testMockBuffer,
        });
        results.push({
          characterId: char.id,
          name: char.name,
          success: true,
          imageUrl: res.imageUrl || undefined,
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
