import { randomUUID } from "crypto";
import path from "path";
import { prisma } from "../database/database.service.js";
import { LocalStorageService } from "../storage/local-storage.service.js";
import {
  getSceneBySceneId,
  updateScene,
  createImage,
  getCharacterById,
  updateCharacter,
  createBackgroundImageVersion,
  upsertFlowCharacterMapping,
  createFlowCharacterVersion,
} from "../database/database.service.js";
import { CharacterReferenceService } from "../character-studio/character-reference.service.js";
import { BackgroundStudioService } from "../background-studio/background-studio.service.js";

const MAX_IMAGE_BYTES = 25 * 1024 * 1024; // 25 MB

export interface ImportAssetOptions {
  target:
    | "scene_background"
    | "background_library"
    | "character_view"
    | "character_reference";
  imageData: string | Buffer;
  filename?: string;
  mimeType?: string;
  provider?: "google_flow" | "gemini_api" | "manual_upload" | string;
  model?: string;
  sourceJobId?: string;
  flowProjectId?: string;

  // Scene background options
  storyId?: string;
  sceneId?: string;
  fit?: "cover" | "contain";
  prompt?: string;
  cameraDirection?: string;
  aspectRatio?: "16:9" | "9:16" | "1:1" | "4:5" | string;
  googleFlowProjectId?: string;
  googleFlowEditId?: string;
  googleFlowEditUrl?: string;
  googleFlowPrompt?: string;
  googleFlowParentAssetId?: string;
  googleFlowVersion?: number;
  googleFlowImageId?: string | null;
  googleFlowImageRef?: string | null;
  googleFlowImageSourceUrl?: string | null;

  // Background library options
  name?: string;
  environmentType?: string;
  notes?: string;

  // Character options
  characterId?: string;
  characterName?: string;
  view?: string;
  isMasterReference?: boolean;
  googleFlowCharacterId?: string;
  flowCharacterId?: string;
  flowCharacterUrl?: string;
}

export interface ImportAssetResult {
  success: boolean;
  target: string;
  assetId: string;
  imageUrl?: string | null;
  width?: number;
  height?: number;
  aspectRatio?: string;
  metadata?: Record<string, any>;
  message: string;
  jobId?: string;
  workerJobId?: string;
  status?: string;
  sceneId?: string;
  characterId?: string;
}

/**
 * Resolve stable Google Flow identifiers from the editor URL.
 *
 * Flow exposes the generated media identifier in /project/{projectId}/edit/{editId}.
 * When no explicit image ID is available in the DOM, editId is the canonical
 * image/edit identifier to persist (rather than leaving googleFlowImageId null).
 */
export function resolveGoogleFlowReferences(
  input: Partial<ImportAssetOptions>,
) {
  let urlProjectId: string | null = null;
  let urlEditId: string | null = null;

  const candidateUrl = input.googleFlowEditUrl || "";
  try {
    const parsed = new URL(candidateUrl);
    if (parsed.hostname === "flow.google.com") {
      const match = parsed.pathname.match(
        /^\/project\/([^/]+)\/edit\/([^/]+)\/?$/,
      );
      if (match) {
        urlProjectId = decodeURIComponent(match[1]);
        urlEditId = decodeURIComponent(match[2]);
      }
    }
  } catch {
    // A malformed or absent URL is not fatal when explicit IDs were supplied.
  }

  const projectId =
    input.googleFlowProjectId ||
    input.flowProjectId ||
    urlProjectId ||
    null;
  const editId = input.googleFlowEditId || urlEditId || null;
  const editUrl =
    input.googleFlowEditUrl ||
    (projectId && editId
      ? `https://flow.google.com/project/${encodeURIComponent(projectId)}/edit/${encodeURIComponent(editId)}`
      : null);

  return {
    googleFlowProjectId: projectId,
    googleFlowEditId: editId,
    googleFlowEditUrl: editUrl,
    googleFlowImageId: input.googleFlowImageId || editId || null,
    googleFlowImageRef: input.googleFlowImageRef || input.googleFlowImageSourceUrl || null,
    googleFlowImageSourceUrl: input.googleFlowImageSourceUrl || input.googleFlowImageRef || null,
    googleFlowParentAssetId: input.googleFlowParentAssetId || null,
    googleFlowPrompt: input.googleFlowPrompt || null,
  };
}


/**
 * Resolve a saved image's Flow editor reference using the direct Image columns
 * first and the canonical BackgroundImageVersion.providerMetadata as a fallback.
 * This keeps regeneration working for assets written before the Image columns
 * were fully populated, while preserving the single version-history source.
 */
export function resolveGoogleFlowBackgroundVersionReferences(
  image: Partial<
    Pick<
      ImportAssetOptions,
      | "googleFlowProjectId"
      | "googleFlowEditId"
      | "googleFlowEditUrl"
      | "googleFlowPrompt"
      | "googleFlowParentAssetId"
      | "googleFlowVersion"
      | "googleFlowImageId"
      | "googleFlowImageRef"
      | "googleFlowImageSourceUrl"
    >
  >,
  version?: {
    providerMetadata?: unknown;
    prompt?: string | null;
    version?: number | null;
  } | null,
) {
  const metadata =
    version?.providerMetadata &&
    typeof version.providerMetadata === "object" &&
    !Array.isArray(version.providerMetadata)
      ? (version.providerMetadata as Record<string, any>)
      : {};
  const flowMetadata =
    metadata.googleFlow &&
    typeof metadata.googleFlow === "object" &&
    !Array.isArray(metadata.googleFlow)
      ? (metadata.googleFlow as Record<string, any>)
      : metadata;

  const imageRefs = resolveGoogleFlowReferences({
    googleFlowProjectId: image.googleFlowProjectId || undefined,
    googleFlowEditId: image.googleFlowEditId || undefined,
    googleFlowEditUrl: image.googleFlowEditUrl || undefined,
    googleFlowPrompt: image.googleFlowPrompt || undefined,
    googleFlowParentAssetId: image.googleFlowParentAssetId || undefined,
    googleFlowImageId: image.googleFlowImageId || undefined,
    googleFlowImageRef: image.googleFlowImageRef || undefined,
    googleFlowImageSourceUrl: image.googleFlowImageSourceUrl || undefined,
  });
  const versionRefs = resolveGoogleFlowReferences({
    googleFlowProjectId:
      flowMetadata.projectId || flowMetadata.googleFlowProjectId || undefined,
    googleFlowEditId:
      flowMetadata.editId || flowMetadata.googleFlowEditId || undefined,
    googleFlowEditUrl:
      flowMetadata.editUrl || flowMetadata.googleFlowEditUrl || undefined,
    googleFlowPrompt: flowMetadata.prompt || version?.prompt || undefined,
    googleFlowParentAssetId:
      flowMetadata.parentAssetId || flowMetadata.googleFlowParentAssetId || undefined,
    googleFlowImageId:
      flowMetadata.imageId || flowMetadata.googleFlowImageId || undefined,
    googleFlowImageRef:
      flowMetadata.imageRef || flowMetadata.googleFlowImageRef || undefined,
    googleFlowImageSourceUrl:
      flowMetadata.imageSourceUrl || flowMetadata.googleFlowImageSourceUrl || undefined,
  });

  // Never let an older history URL override explicit identifiers on the selected
  // Image row. Use the version URL only when it describes the same Flow asset.
  const versionUrlMatchesImage =
    (!imageRefs.googleFlowProjectId ||
      imageRefs.googleFlowProjectId === versionRefs.googleFlowProjectId) &&
    (!imageRefs.googleFlowEditId ||
      imageRefs.googleFlowEditId === versionRefs.googleFlowEditId);
  const projectId =
    imageRefs.googleFlowProjectId ||
    (versionUrlMatchesImage ? versionRefs.googleFlowProjectId : null);
  const editId =
    imageRefs.googleFlowEditId ||
    (versionUrlMatchesImage ? versionRefs.googleFlowEditId : null);
  // Rebuild the route from the resolved IDs whenever both are known. This
  // prevents a stale URL column from pointing at a different Flow image.
  const editUrl =
    projectId && editId
      ? `https://flow.google.com/project/${encodeURIComponent(projectId)}/edit/${encodeURIComponent(editId)}`
      : imageRefs.googleFlowEditUrl ||
        (versionUrlMatchesImage ? versionRefs.googleFlowEditUrl : null);

  const refs = resolveGoogleFlowReferences({
    googleFlowProjectId: projectId || undefined,
    googleFlowEditId: editId || undefined,
    googleFlowEditUrl: editUrl || undefined,
    googleFlowPrompt:
      imageRefs.googleFlowPrompt || versionRefs.googleFlowPrompt || undefined,
    googleFlowParentAssetId:
      imageRefs.googleFlowParentAssetId ||
      versionRefs.googleFlowParentAssetId ||
      undefined,
    googleFlowImageId:
      imageRefs.googleFlowImageId || versionRefs.googleFlowImageId || undefined,
    googleFlowImageRef:
      imageRefs.googleFlowImageRef || versionRefs.googleFlowImageRef || undefined,
    googleFlowImageSourceUrl:
      imageRefs.googleFlowImageSourceUrl ||
      versionRefs.googleFlowImageSourceUrl ||
      undefined,
  });

  return {
    ...refs,
    googleFlowVersion: image.googleFlowVersion || version?.version || null,
  };
}

export {
  detectImageMime,
  parseImageDimensions,
} from "./image-dimension-helper.js";
import {
  detectImageMime,
  parseImageDimensions,
} from "./image-dimension-helper.js";

export class GoogleFlowAssetImportService {
  private static storageService = new LocalStorageService();
  private static _backgroundStudioService?: BackgroundStudioService;
  private static _characterReferenceService?: CharacterReferenceService;

  private static getBackgroundStudioService(): BackgroundStudioService {
    if (!this._backgroundStudioService) {
      this._backgroundStudioService = new BackgroundStudioService();
    }
    return this._backgroundStudioService;
  }

  private static getCharacterReferenceService(): CharacterReferenceService {
    if (!this._characterReferenceService) {
      this._characterReferenceService = new CharacterReferenceService();
    }
    return this._characterReferenceService;
  }

  /**
   * Unified asset import handler for Google Flow generated media.
   */
  public static async importAsset(
    options: ImportAssetOptions,
  ): Promise<ImportAssetResult> {
    const {
      target,
      imageData,
      filename: rawFilename,
      aspectRatio = "16:9",
    } = options;

    if (!target) {
      throw new Error(
        "target is required (scene_background, background_library, character_view, character_reference).",
      );
    }

    if (!imageData) {
      throw new Error("imageData (base64 string or Buffer) is required.");
    }

    // 1. Decode to Buffer
    let buffer: Buffer;
    if (typeof imageData === "string") {
      const clean = imageData.replace(
        /^data:image\/[a-zA-Z0-9.+_-]+;base64,/,
        "",
      );
      buffer = Buffer.from(clean, "base64");
    } else if (Buffer.isBuffer(imageData)) {
      buffer = imageData;
    } else {
      throw new Error("Invalid image data type.");
    }

    // 2. Validate Size
    if (buffer.length === 0) {
      throw new Error("Image data is empty (0 bytes).");
    }

    if (buffer.length > MAX_IMAGE_BYTES) {
      throw new Error(
        `Image size (${(buffer.length / (1024 * 1024)).toFixed(1)}MB) exceeds maximum 25MB limit.`,
      );
    }

    // 3. Validate MIME Type / Magic Bytes
    const detected = detectImageMime(buffer);
    if (!detected) {
      throw new Error(
        "Unsupported image format. Google Flow assets must be valid PNG, JPEG, or WebP images.",
      );
    }

    const { width, height } = parseImageDimensions(buffer);
    if (
      !Number.isInteger(width) ||
      !Number.isInteger(height) ||
      width < 32 ||
      height < 32
    ) {
      throw new Error(
        `Invalid or unknown dimensions: ${width}x${height}px. Assets must be full-resolution scenes or character references, not placeholder pixels.`,
      );
    }
    const fileId = randomUUID();
    const storageFilename = `flow-${target}-${Date.now()}-${fileId.slice(0, 8)}.${detected.ext}`;

    // ----------------------------------------------------------------
    // Target A: Scene Background
    // ----------------------------------------------------------------
    if (target === "scene_background") {
      if (!options.sceneId) {
        throw new Error("sceneId is required when target is scene_background.");
      }

      const scene = await getSceneBySceneId(options.sceneId);
      if (!scene) {
        throw new Error(`Scene not found: ${options.sceneId}`);
      }

      if (options.storyId && scene.storyId !== options.storyId) {
        throw new Error(
          `Scene ${options.sceneId} does not belong to story ${options.storyId}`,
        );
      }

      if (options.sourceJobId) {
        try {
          const genJob = await prisma.generationJob.findUnique({
            where: { id: options.sourceJobId },
          });
          if (genJob) {
            if (genJob.sceneId && genJob.sceneId !== options.sceneId) {
              throw new Error(
                `Generation job ${options.sourceJobId} does not belong to scene ${options.sceneId}`,
              );
            }
            if (
              genJob.storyId &&
              options.storyId &&
              genJob.storyId !== options.storyId
            ) {
              throw new Error(
                `Generation job ${options.sourceJobId} does not belong to story ${options.storyId}`,
              );
            }
          }
        } catch (jobCheckErr: any) {
          if (jobCheckErr.message?.includes("does not belong to"))
            throw jobCheckErr;
        }
      }

      const { url } = await this.storageService.saveFile(
        buffer,
        storageFilename,
        detected.mimeType,
      );

      const currentAnim = (scene.animationData || {}) as any;
      const fit = options.fit === "contain" ? "contain" : "cover";
      const prompt =
        options.prompt ||
        currentAnim.background?.prompt ||
        scene.visualPrompt ||
        "Google Flow scene background";
      const cameraDirection =
        options.cameraDirection ||
        scene.cameraDirection ||
        "Eye-level wide shot";
      const provider = options.provider || "google_flow";
      const model =
        options.model ||
        (provider === "google_flow"
          ? "google_flow"
          : provider === "gemini_api"
            ? "gemini-imagen"
            : "manual_upload");

      // The version number belongs to this scene's shared background history,
      // not to the optional Flow parent asset. This keeps versions sequential
      // across Google Flow, Gemini, Pollinations and manual uploads.
      const latestBackgroundVersion = await prisma.backgroundImageVersion.findFirst({
        where: { sceneId: scene.sceneId },
        orderBy: { version: "desc" },
        select: { id: true, version: true },
      });
      const nextBackgroundVersion = (latestBackgroundVersion?.version ?? 0) + 1;
      const requestedVersion = Number(options.googleFlowVersion);
      const version =
        Number.isInteger(requestedVersion) && requestedVersion >= nextBackgroundVersion
          ? requestedVersion
          : nextBackgroundVersion;

      const flowRefs = resolveGoogleFlowReferences(options);
      const imageId = randomUUID();

      // Track the canonical Flow identifiers on the local Image record.
      // googleFlowImageId intentionally falls back to the UUID in /edit/{id}.
      const imageRecord = await createImage({
        id: imageId,
        sceneId: scene.sceneId,
        provider,
        model,
        prompt,
        storageKey: storageFilename,
        imageUrl: url,
        width,
        height,
        status: "completed",
        googleFlowProjectId: flowRefs.googleFlowProjectId,
        googleFlowEditId: flowRefs.googleFlowEditId,
        googleFlowEditUrl: flowRefs.googleFlowEditUrl,
        googleFlowPrompt: flowRefs.googleFlowPrompt || prompt,
        googleFlowParentAssetId: flowRefs.googleFlowParentAssetId,
        googleFlowVersion: version,
        googleFlowImageId: flowRefs.googleFlowImageId,
        googleFlowImageRef: flowRefs.googleFlowImageRef,
      });

      // Persist a structured version row. providerMetadata stays flexible for
      // provider-specific fields, while StoryContextService flattens these
      // fields onto each backgroundVersions[] item for consumers.
      const bgVersion = await createBackgroundImageVersion({
        sceneId: scene.sceneId,
        version,
        provider,
        model,
        prompt,
        // parentVersionId is an internal BackgroundImageVersion ID. The
        // external Google Flow parent asset ID remains in providerMetadata.
        parentVersionId: latestBackgroundVersion?.id || null,
        localImageId: imageRecord.id,
        storageKey: storageFilename,
        imageUrl: url,
        width,
        height,
        aspectRatio,
        providerMetadata: {
          sourceJobId: options.sourceJobId || null,
          ...(provider === "google_flow"
            ? {
                googleFlow: {
                  projectId: flowRefs.googleFlowProjectId,
                  editId: flowRefs.googleFlowEditId,
                  editUrl: flowRefs.googleFlowEditUrl,
                  imageId: flowRefs.googleFlowImageId,
                  imageRef: flowRefs.googleFlowImageRef,
                  imageSourceUrl: flowRefs.googleFlowImageSourceUrl,
                  parentAssetId: flowRefs.googleFlowParentAssetId,
                  ...(flowRefs.googleFlowPrompt &&
                  flowRefs.googleFlowPrompt !== prompt
                    ? { prompt: flowRefs.googleFlowPrompt }
                    : {}),
                },
              }
            : {}),
        },
        status: "completed",
        makeActive: true,
      });

      const updatedAnimData = {
        ...currentAnim,
        background: {
          ...currentAnim.background,
          imageUrl: url,
          imageId: imageRecord.id,
          fit,
          source: provider,
          provider,
          prompt,
          cameraDirection,
          aspectRatio,
          dimensions: { width, height },
          filename: rawFilename || storageFilename,
          sizeBytes: buffer.length,
          sourceJobId: options.sourceJobId,
          flowProjectId: options.flowProjectId || options.googleFlowProjectId,
          googleFlowProjectId: flowRefs.googleFlowProjectId,
          googleFlowEditId: flowRefs.googleFlowEditId,
          googleFlowEditUrl: flowRefs.googleFlowEditUrl,
          googleFlowPrompt: flowRefs.googleFlowPrompt || prompt,
          googleFlowImageId: flowRefs.googleFlowImageId,
          googleFlowImageRef: flowRefs.googleFlowImageRef,
          googleFlowImageSourceUrl: flowRefs.googleFlowImageSourceUrl,
          googleFlowParentAssetId: flowRefs.googleFlowParentAssetId,
          googleFlowVersion: version,
          activeVersion: bgVersion.version,
          versionId: bgVersion.id,
          removed: false,
        },
      };

      await updateScene(scene.sceneId, {
        imageUrl: url,
        activeBackgroundVersion: bgVersion.version,
        animationData: updatedAnimData,
      });

      return {
        success: true,
        target: "scene_background",
        assetId: imageRecord.id,
        imageUrl: url,
        width,
        height,
        aspectRatio,
        metadata: {
          sceneId: scene.sceneId,
          storyId: scene.storyId,
          imageId: imageRecord.id,
          version: bgVersion.version,
          versionId: bgVersion.id,
          activeVersion: bgVersion.version,
          provider,
          model,
          googleFlowProjectId: imageRecord.googleFlowProjectId,
          googleFlowEditId: imageRecord.googleFlowEditId,
          googleFlowEditUrl: imageRecord.googleFlowEditUrl,
          googleFlowPrompt: imageRecord.googleFlowPrompt,
          googleFlowImageId: imageRecord.googleFlowImageId || imageRecord.googleFlowEditId || null,
          googleFlowImageRef: imageRecord.googleFlowImageRef || null,
          googleFlowImageSourceUrl: flowRefs.googleFlowImageSourceUrl,
          googleFlowVersion: imageRecord.googleFlowVersion,
          googleFlowParentAssetId: imageRecord.googleFlowParentAssetId,
          fit,
        },
        message: `Background imported and applied to scene ${scene.number || scene.sceneId} (Version ${bgVersion.version}).`,
      };
    }

    // ----------------------------------------------------------------
    // Target B: Background Library
    // ----------------------------------------------------------------
    if (target === "background_library") {
      const asset =
        await this.getBackgroundStudioService().importFromGoogleFlow({
          name:
            options.name ||
            (rawFilename
              ? path.basename(rawFilename, path.extname(rawFilename))
              : "Google Flow Background"),
          environmentType: options.environmentType || "Storybook Environment",
          imageBufferOrBase64: buffer,
          filename: rawFilename || storageFilename,
          notes:
            options.notes ||
            options.prompt ||
            "Imported via Google Flow Studio",
          aspectRatio: (aspectRatio as any) || "16:9",
        });

      return {
        success: true,
        target: "background_library",
        assetId: asset.id,
        imageUrl: asset.imageUrl,
        width: asset.width,
        height: asset.height,
        aspectRatio: asset.aspectRatio,
        metadata: {
          name: asset.name,
          environmentType: asset.environmentType,
        },
        message: `Background imported to Background Studio library: "${asset.name}".`,
      };
    }

    // ----------------------------------------------------------------
    // Target C & D: Character View / Reference
    // ----------------------------------------------------------------
    if (target === "character_view" || target === "character_reference") {
      if (!options.characterId) {
        throw new Error(
          "characterId is required when target is character_view or character_reference.",
        );
      }

      const character = await getCharacterById(options.characterId);
      if (!character) {
        throw new Error(`Character not found: ${options.characterId}`);
      }

      const { url } = await this.storageService.saveFile(
        buffer,
        storageFilename,
        detected.mimeType,
      );

      const view = options.view || "front";
      const isMaster = Boolean(
        options.isMasterReference || target === "character_reference",
      );
      const assetId = `flow-${options.characterId}-${view}-${Date.now()}`;

      const provider = options.provider || "google_flow";
      const model =
        options.model ||
        (provider === "google_flow"
          ? "google_flow"
          : provider === "gemini_api"
            ? "gemini-imagen"
            : "manual_upload");

      const registered =
        await this.getCharacterReferenceService().saveAssetToCharacter(
          options.characterId,
          {
            id: assetId,
            // Every non-master Flow image is an individual directional view,
            // including the front view generated as part of an 8-view set.
            // It must never replace the canonical master image.
            assetType: isMaster ? "main" : "turnaround",
            direction: view,
            prompt:
              options.prompt || `${character.name} reference view (${view})`,
            provider,
            model,
            url,
            isMasterReference: isMaster,
            createdAt: new Date().toISOString(),
          },
        );

      if (isMaster) {
        await updateCharacter(options.characterId, {
          referenceImageUrl: url,
          referenceImagePrompt:
            options.prompt || `${character.name} master reference`,
        });
      }

      if (options.storyId) {
        try {
          const flowProjId =
            options.googleFlowProjectId ||
            options.flowProjectId ||
            "default";
          const flowCharId =
            options.googleFlowCharacterId ||
            options.flowCharacterId ||
            null;
          const flowCharUrl =
            options.flowCharacterUrl ||
            (flowCharId
              ? `https://flow.google.com/project/${flowProjId}/character/${flowCharId}`
              : null);
          const mapping = await upsertFlowCharacterMapping({
            storyId: options.storyId,
            characterId: options.characterId,
            flowProjectId: flowProjId,
            flowCharacterName: options.characterName || character.name,
            flowCharacterId: flowCharId,
            flowCharacterUrl: flowCharUrl,
          });
          if (flowCharId && mapping?.id) {
            await createFlowCharacterVersion({
              mappingId: mapping.id,
              flowProjectId: flowProjId,
              flowCharacterId: flowCharId,
              flowCharacterUrl: flowCharUrl || "",
              prompt: options.prompt,
              imageUrl: url,
              metadata: {
                view,
                isMasterReference: isMaster,
                assetId,
              },
            });
          }
        } catch (mappingErr) {
          console.warn(
            "[AssetImport] Character flow mapping update notice:",
            (mappingErr as Error).message,
          );
        }
      }

      return {
        success: true,
        target: target,
        assetId,
        imageUrl: url,
        width,
        height,
        characterId: options.characterId,
        metadata: {
          characterId: options.characterId,
          characterName: character.name,
          view,
          isMasterReference: isMaster,
        },
        message: isMaster
          ? `Master reference updated for character "${character.name}".`
          : `Directional view (${view}) imported for character "${character.name}".`,
      };
    }

    throw new Error(`Unknown import target: ${target}`);
  }
}
