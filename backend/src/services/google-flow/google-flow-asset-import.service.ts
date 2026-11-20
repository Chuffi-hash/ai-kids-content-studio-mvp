import { randomUUID } from 'crypto';
import path from 'path';
import { prisma } from '../database/database.service.js';
import { LocalStorageService } from '../storage/local-storage.service.js';
import {
  getSceneBySceneId,
  updateScene,
  createImage,
  getCharacterById,
  updateCharacter,
} from '../database/database.service.js';
import { CharacterReferenceService } from '../character-studio/character-reference.service.js';
import { BackgroundStudioService } from '../background-studio/background-studio.service.js';

const MAX_IMAGE_BYTES = 25 * 1024 * 1024; // 25 MB

export interface ImportAssetOptions {
  target: 'scene_background' | 'background_library' | 'character_view' | 'character_reference';
  imageData: string | Buffer;
  filename?: string;
  mimeType?: string;
  provider?: 'google_flow' | 'gemini_api' | 'manual_upload' | string;
  model?: string;
  sourceJobId?: string;
  flowProjectId?: string;

  // Scene background options
  storyId?: string;
  sceneId?: string;
  fit?: 'cover' | 'contain';
  prompt?: string;
  cameraDirection?: string;
  aspectRatio?: '16:9' | '9:16' | '1:1' | '4:5' | string;

  // Background library options
  name?: string;
  environmentType?: string;
  notes?: string;

  // Character options
  characterId?: string;
  view?: string;
  isMasterReference?: boolean;
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

export { detectImageMime, parseImageDimensions } from './image-dimension-helper.js';
import { detectImageMime, parseImageDimensions } from './image-dimension-helper.js';

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
  public static async importAsset(options: ImportAssetOptions): Promise<ImportAssetResult> {
    const { target, imageData, filename: rawFilename, aspectRatio = '16:9' } = options;

    if (!target) {
      throw new Error('target is required (scene_background, background_library, character_view, character_reference).');
    }

    if (!imageData) {
      throw new Error('imageData (base64 string or Buffer) is required.');
    }

    // 1. Decode to Buffer
    let buffer: Buffer;
    if (typeof imageData === 'string') {
      const clean = imageData.replace(/^data:image\/[a-zA-Z0-9.+_-]+;base64,/, '');
      buffer = Buffer.from(clean, 'base64');
    } else if (Buffer.isBuffer(imageData)) {
      buffer = imageData;
    } else {
      throw new Error('Invalid image data type.');
    }

    // 2. Validate Size
    if (buffer.length === 0) {
      throw new Error('Image data is empty (0 bytes).');
    }

    if (buffer.length > MAX_IMAGE_BYTES) {
      throw new Error(`Image size (${(buffer.length / (1024 * 1024)).toFixed(1)}MB) exceeds maximum 25MB limit.`);
    }

    // 3. Validate MIME Type / Magic Bytes
    const detected = detectImageMime(buffer);
    if (!detected) {
      throw new Error('Unsupported image format. Google Flow assets must be valid PNG, JPEG, or WebP images.');
    }

    const { width, height } = parseImageDimensions(buffer);
    if (!Number.isInteger(width) || !Number.isInteger(height) || width < 32 || height < 32) {
      throw new Error(`Invalid or unknown dimensions: ${width}x${height}px. Assets must be full-resolution scenes or character references, not placeholder pixels.`);
    }
    const fileId = randomUUID();
    const storageFilename = `flow-${target}-${Date.now()}-${fileId.slice(0, 8)}.${detected.ext}`;

    // ----------------------------------------------------------------
    // Target A: Scene Background
    // ----------------------------------------------------------------
    if (target === 'scene_background') {
      if (!options.sceneId) {
        throw new Error('sceneId is required when target is scene_background.');
      }

      const scene = await getSceneBySceneId(options.sceneId);
      if (!scene) {
        throw new Error(`Scene not found: ${options.sceneId}`);
      }

      if (options.storyId && scene.storyId !== options.storyId) {
        throw new Error(`Scene ${options.sceneId} does not belong to story ${options.storyId}`);
      }

      if (options.sourceJobId) {
        try {
          const genJob = await prisma.generationJob.findUnique({ where: { id: options.sourceJobId } });
          if (genJob) {
            if (genJob.sceneId && genJob.sceneId !== options.sceneId) {
              throw new Error(`Generation job ${options.sourceJobId} does not belong to scene ${options.sceneId}`);
            }
            if (genJob.storyId && options.storyId && genJob.storyId !== options.storyId) {
              throw new Error(`Generation job ${options.sourceJobId} does not belong to story ${options.storyId}`);
            }
          }
        } catch (jobCheckErr: any) {
          if (jobCheckErr.message?.includes("does not belong to")) throw jobCheckErr;
        }
      }

      const { url } = await this.storageService.saveFile(buffer, storageFilename, detected.mimeType);

      const currentAnim = (scene.animationData || {}) as any;
      const fit = options.fit === 'contain' ? 'contain' : 'cover';
      const prompt = options.prompt || currentAnim.background?.prompt || scene.visualPrompt || 'Google Flow scene background';
      const cameraDirection = options.cameraDirection || scene.cameraDirection || 'Eye-level wide shot';
      const provider = options.provider || 'google_flow';
      const model = options.model || (provider === 'google_flow' ? 'google_flow' : (provider === 'gemini_api' ? 'gemini-imagen' : 'manual_upload'));

      const updatedAnimData = {
        ...currentAnim,
        background: {
          ...currentAnim.background,
          imageUrl: url,
          fit,
          source: provider,
          prompt,
          cameraDirection,
          aspectRatio,
          dimensions: { width, height },
          filename: rawFilename || storageFilename,
          sizeBytes: buffer.length,
          sourceJobId: options.sourceJobId,
          flowProjectId: options.flowProjectId,
          removed: false,
        },
      };

      await updateScene(scene.sceneId, {
        imageUrl: url,
        animationData: updatedAnimData,
      });

      // Track in Image table with authentic provider
      await createImage({
        id: randomUUID(),
        sceneId: scene.sceneId,
        provider,
        model,
        prompt,
        storageKey: storageFilename,
        imageUrl: url,
        width,
        height,
        status: 'completed',
      });

      return {
        success: true,
        target: 'scene_background',
        assetId: scene.sceneId,
        imageUrl: url,
        width,
        height,
        aspectRatio,
        metadata: {
          sceneId: scene.sceneId,
          storyId: scene.storyId,
          fit,
        },
        message: `Background imported and applied to scene ${scene.number || scene.sceneId}.`,
      };
    }

    // ----------------------------------------------------------------
    // Target B: Background Library
    // ----------------------------------------------------------------
    if (target === 'background_library') {
      const asset = await this.getBackgroundStudioService().importFromGoogleFlow({
        name: options.name || (rawFilename ? path.basename(rawFilename, path.extname(rawFilename)) : 'Google Flow Background'),
        environmentType: options.environmentType || 'Storybook Environment',
        imageBufferOrBase64: buffer,
        filename: rawFilename || storageFilename,
        notes: options.notes || options.prompt || 'Imported via Google Flow Studio',
        aspectRatio: (aspectRatio as any) || '16:9',
      });

      return {
        success: true,
        target: 'background_library',
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
    if (target === 'character_view' || target === 'character_reference') {
      if (!options.characterId) {
        throw new Error('characterId is required when target is character_view or character_reference.');
      }

      const character = await getCharacterById(options.characterId);
      if (!character) {
        throw new Error(`Character not found: ${options.characterId}`);
      }

      const { url } = await this.storageService.saveFile(buffer, storageFilename, detected.mimeType);

      const view = options.view || 'front';
      const isMaster = Boolean(options.isMasterReference || target === 'character_reference');
      const assetId = `flow-${options.characterId}-${view}-${Date.now()}`;

      const provider = options.provider || 'google_flow';
      const model = options.model || (provider === 'google_flow' ? 'google_flow' : (provider === 'gemini_api' ? 'gemini-imagen' : 'manual_upload'));

      const registered = await this.getCharacterReferenceService().saveAssetToCharacter(options.characterId, {
        id: assetId,
        assetType: isMaster ? 'main' : (view === 'front' ? 'main' : 'turnaround'),
        direction: view,
        prompt: options.prompt || `${character.name} reference view (${view})`,
        provider,
        model,
        url,
        isMasterReference: isMaster,
        createdAt: new Date().toISOString(),
      });

      if (isMaster) {
        await updateCharacter(options.characterId, {
          referenceImageUrl: url,
          referenceImagePrompt: options.prompt || `${character.name} master reference`,
        });
      }

      return {
        success: true,
        target: target,
        assetId,
        imageUrl: url,
        width,
        height,
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
