import fs from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';
import { BackgroundAsset, BackgroundProviderType } from './background-studio.types.js';
import { buildSceneBackgroundPrompt, BackgroundPromptOptions } from '../character-studio/prompt-templates.js';
import { DynamicPromptBuilderService } from '../prompt-builder/dynamic-prompt-builder.service.js';
import { AssetRightsService } from '../asset-rights/asset-rights.service.js';
import { PollinationsImageProvider } from '../image-generation/providers/pollinations-image.provider.js';
import { GeminiImageProvider } from '../image-generation/providers/gemini-image.provider.js';

export class BackgroundStudioService {
  private storageDir: string;
  private backgroundsDir: string;
  private indexFilePath: string;
  private pollinationsProvider: PollinationsImageProvider;
  private geminiProvider: GeminiImageProvider;

  constructor(options?: { storageDir?: string }) {
    this.storageDir = options?.storageDir || process.env.STORAGE_DIR || './storage';
    this.backgroundsDir = path.resolve(process.cwd(), this.storageDir, 'backgrounds');
    this.indexFilePath = path.join(this.backgroundsDir, 'backgrounds-index.json');
    this.pollinationsProvider = new PollinationsImageProvider();
    this.geminiProvider = new GeminiImageProvider();
  }

  private async ensureStorage(): Promise<void> {
    await fs.promises.mkdir(this.backgroundsDir, { recursive: true });
    if (!fs.existsSync(this.indexFilePath)) {
      await fs.promises.writeFile(this.indexFilePath, JSON.stringify([], null, 2), 'utf8');
    }
  }

  private toPublicUrl(relPath: string): string {
    const clean = relPath.replace(/\\/g, '/').replace(/^\/?storage\/?/, '');
    const origin = process.env.BACKEND_URL || 'http://localhost:5001';
    return `${origin}/storage/${clean}`;
  }

  /**
   * Retrieves all reusable background environment assets.
   */
  public async getAllBackgrounds(): Promise<BackgroundAsset[]> {
    await this.ensureStorage();
    try {
      const data = await fs.promises.readFile(this.indexFilePath, 'utf8');
      return JSON.parse(data) as BackgroundAsset[];
    } catch {
      return [];
    }
  }

  /**
   * Saves or updates a background asset in the persistent index.
   */
  public async saveBackgroundAsset(asset: BackgroundAsset): Promise<BackgroundAsset> {
    await this.ensureStorage();
    const assets = await this.getAllBackgrounds();
    const existingIndex = assets.findIndex((a) => a.id === asset.id);

    if (existingIndex >= 0) {
      assets[existingIndex] = asset;
    } else {
      assets.unshift(asset);
    }

    await fs.promises.writeFile(this.indexFilePath, JSON.stringify(assets, null, 2), 'utf8');
    return asset;
  }

  /**
   * Generates a new environment background image using AI prompts.
   */
  public async generateBackground(options: {
    name?: string;
    environmentType: string;
    details?: string;
    mood?: string;
    artStyle?: string;
    styleId?: string;
    customStyleInstructions?: string;
    mode?: 'environment_only' | 'complete_scene';
    characters?: Array<{ name: string; species?: string; description?: string; action?: string }>;
    sceneDescription?: string;
    aspectRatio?: '16:9' | '9:16' | '1:1' | '4:5';
    provider?: BackgroundProviderType;
  }): Promise<BackgroundAsset> {
    await this.ensureStorage();
    const {
      name,
      environmentType,
      details,
      mood,
      artStyle,
      styleId = artStyle || 'storybook_illustrated',
      customStyleInstructions,
      mode = 'environment_only',
      characters,
      sceneDescription,
      aspectRatio = '16:9',
      provider = 'pollinations',
    } = options;

    const promptResult = DynamicPromptBuilderService.buildBackgroundPrompt({
      mode,
      environmentType,
      details,
      mood,
      styleId,
      customStyleInstructions,
      aspectRatio,
      characters,
      sceneDescription,
      provider,
    });

    const prompt = promptResult.generatedPrompt;
    const width = promptResult.metadata.targetResolution.width;
    const height = promptResult.metadata.targetResolution.height;

    let imageBuffer: Buffer;
    let mimeType = 'image/png';

    if (provider === 'gemini') {
      const apiKey = process.env.GOOGLE_GEMINI_API_KEY || process.env.GEMINI_API_KEY;
      if (!apiKey) {
        throw new Error(
          'Gemini API key is not configured. Please set GEMINI_API_KEY in your environment, or choose Pollinations provider.'
        );
      }

      const generated = await this.geminiProvider.generateImage({
        prompt,
        negativePrompt: promptResult.negativePrompt,
        width,
        height,
        aspectRatio,
      });
      imageBuffer = generated.imageBuffer;
      mimeType = generated.mimeType;
    } else {
      const generated = await this.pollinationsProvider.generateImage({
        prompt,
        width,
        height,
      });
      imageBuffer = generated.imageBuffer;
      mimeType = generated.mimeType;
    }

    const assetId = `bg-${Date.now()}-${randomUUID().slice(0, 6)}`;
    const filename = `${assetId}.${mimeType.includes('png') ? 'png' : 'jpg'}`;
    const filePath = path.join(this.backgroundsDir, filename);

    await fs.promises.writeFile(filePath, imageBuffer);

    const rel = path.relative(path.resolve(process.cwd(), this.storageDir), filePath);

    const provenance = AssetRightsService.createProvenanceRecord({
      assetId,
      assetType: 'background',
      name: name || `${environmentType.charAt(0).toUpperCase() + environmentType.slice(1)} Background`,
      provider,
      originalPrompt: promptResult.originalPrompt,
      generatedPrompt: promptResult.generatedPrompt,
      dimensions: { width, height },
      stylePreset: promptResult.stylePreset.id,
      aspectRatio,
    });

    const asset: BackgroundAsset = {
      id: assetId,
      name: name || `${environmentType.charAt(0).toUpperCase() + environmentType.slice(1)} Background`,
      environmentType,
      description: details || `${promptResult.stylePreset.name} environment: ${environmentType}`,
      prompt,
      originalPrompt: promptResult.originalPrompt,
      imageUrl: this.toPublicUrl(rel),
      storagePath: filePath,
      provider,
      aspectRatio,
      width,
      height,
      originalDimensions: { width, height },
      originalAspectRatio: aspectRatio,
      fitMode: 'cover',
      focalPoint: { x: 50, y: 50 },
      stylePreset: promptResult.stylePreset.id,
      customStyleInstructions,
      mode,
      isCompleteSceneWithEmbeddedCharacters: promptResult.metadata.isCompleteSceneWithEmbeddedCharacters,
      areCharactersIndependentlyAnimated: promptResult.metadata.areCharactersIndependentlyAnimated,
      disclaimer: promptResult.metadata.disclaimer,
      provenance,
      tags: [environmentType, promptResult.stylePreset.id, aspectRatio, mode],
      createdAt: new Date().toISOString(),
    };

    return await this.saveBackgroundAsset(asset);
  }

  /**
   * Imports a background asset from Google Flow.
   */
  public async importFromGoogleFlow(options: {
    name?: string;
    environmentType?: string;
    imageBufferOrBase64: Buffer | string;
    filename?: string;
    notes?: string;
    aspectRatio?: '16:9' | '9:16' | '1:1' | '4:5';
  }): Promise<BackgroundAsset> {
    await this.ensureStorage();
    const { name, environmentType = 'Storybook Scene', imageBufferOrBase64, filename, notes, aspectRatio = '16:9' } = options;

    let buffer: Buffer;
    if (typeof imageBufferOrBase64 === 'string') {
      const clean = imageBufferOrBase64.replace(/^data:image\/\w+;base64,/, '');
      buffer = Buffer.from(clean, 'base64');
    } else {
      buffer = imageBufferOrBase64;
    }

    const assetId = `flow-bg-${Date.now()}-${randomUUID().slice(0, 6)}`;
    const targetFilename = filename ? `${assetId}-${path.basename(filename)}` : `${assetId}.png`;
    const filePath = path.join(this.backgroundsDir, targetFilename);

    await fs.promises.writeFile(filePath, buffer);

    const rel = path.relative(path.resolve(process.cwd(), this.storageDir), filePath);
    const asset: BackgroundAsset = {
      id: assetId,
      name: name || `Google Flow Background (${environmentType})`,
      environmentType,
      description: notes || 'Imported environment artwork from Google Flow',
      prompt: notes || 'Google Flow environment export',
      imageUrl: this.toPublicUrl(rel),
      storagePath: filePath,
      provider: 'google_flow',
      aspectRatio,
      width: aspectRatio === '9:16' ? 720 : 1280,
      height: aspectRatio === '9:16' ? 1280 : 720,
      tags: ['google_flow', environmentType, aspectRatio],
      createdAt: new Date().toISOString(),
    };

    return await this.saveBackgroundAsset(asset);
  }

  /**
   * Direct file upload of background artwork.
   */
  public async uploadBackground(options: {
    name?: string;
    environmentType?: string;
    base64Data: string;
    filename?: string;
    aspectRatio?: '16:9' | '9:16' | '1:1' | '4:5';
  }): Promise<BackgroundAsset> {
    await this.ensureStorage();
    const { name, environmentType = 'Environment', base64Data, filename, aspectRatio = '16:9' } = options;

    const clean = base64Data.replace(/^data:image\/\w+;base64,/, '');
    const buffer = Buffer.from(clean, 'base64');

    const assetId = `upload-bg-${Date.now()}-${randomUUID().slice(0, 6)}`;
    const ext = base64Data.startsWith('data:image/webp') ? 'webp' : (base64Data.startsWith('data:image/png') ? 'png' : 'jpg');
    const targetFilename = filename || `${assetId}.${ext}`;
    const filePath = path.join(this.backgroundsDir, targetFilename);

    await fs.promises.writeFile(filePath, buffer);

    const rel = path.relative(path.resolve(process.cwd(), this.storageDir), filePath);
    const asset: BackgroundAsset = {
      id: assetId,
      name: name || `${environmentType} (Uploaded)`,
      environmentType,
      description: 'Uploaded environment artwork',
      prompt: 'User uploaded artwork',
      imageUrl: this.toPublicUrl(rel),
      storagePath: filePath,
      provider: 'upload',
      aspectRatio,
      width: aspectRatio === '9:16' ? 720 : 1280,
      height: aspectRatio === '9:16' ? 1280 : 720,
      originalDimensions: {
        width: aspectRatio === '9:16' ? 720 : 1280,
        height: aspectRatio === '9:16' ? 1280 : 720,
      },
      originalAspectRatio: aspectRatio,
      tags: ['uploaded', environmentType, aspectRatio],
      createdAt: new Date().toISOString(),
    };

    return await this.saveBackgroundAsset(asset);
  }

  /**
   * Adapts an existing background asset to a target aspect ratio.
   * Modes:
   * - 'contain': Letterbox / pillarbox preserving original artwork without cropping.
   * - 'cover': Crops to target aspect ratio using focal point / crop offset.
   * - 'ai_extend': AI outpainting / expanding the scene to target aspect ratio.
   * - 'variant': Generates a new variant matching target aspect ratio with original style preset.
   *
   * Crucial: NEVER overwrites the original asset. Creates a new derived asset record.
   */
  public async adaptBackground(options: {
    sourceAssetId: string;
    targetAspectRatio: '16:9' | '9:16' | '1:1' | '4:5';
    adaptationMode: 'cover' | 'contain' | 'ai_extend' | 'variant';
    focalPoint?: { x: number; y: number };
    cropOffset?: { x: number; y: number };
  }): Promise<BackgroundAsset> {
    await this.ensureStorage();
    const assets = await this.getAllBackgrounds();
    const sourceAsset = assets.find((a) => a.id === options.sourceAssetId);
    if (!sourceAsset) {
      throw new Error(`Source background asset not found: ${options.sourceAssetId}`);
    }

    const targetDims =
      options.targetAspectRatio === '9:16'
        ? { width: 1080, height: 1920 }
        : options.targetAspectRatio === '1:1'
        ? { width: 1080, height: 1080 }
        : options.targetAspectRatio === '4:5'
        ? { width: 1080, height: 1350 }
        : { width: 1920, height: 1080 };

    if (options.adaptationMode === 'variant' || options.adaptationMode === 'ai_extend') {
      const modeInstruction =
        options.adaptationMode === 'ai_extend'
          ? `Outpainted extension of ${sourceAsset.environmentType || 'scenic background'} seamlessly extending margins to ${options.targetAspectRatio}. Maintain exact central features, lighting, textures and atmosphere.`
          : sourceAsset.description || sourceAsset.prompt;

      const newAsset = await this.generateBackground({
        name: `${sourceAsset.name} (${options.targetAspectRatio} ${options.adaptationMode === 'ai_extend' ? 'Extended' : 'Variant'})`,
        environmentType: sourceAsset.environmentType,
        details: modeInstruction,
        mood: sourceAsset.tags?.find((t) => ['calm', 'cheerful', 'magical', 'adventurous'].includes(t)),
        styleId: sourceAsset.stylePreset || 'storybook_illustrated',
        customStyleInstructions: sourceAsset.customStyleInstructions,
        mode: sourceAsset.mode || 'environment_only',
        aspectRatio: options.targetAspectRatio,
        provider: sourceAsset.provider === 'gemini' ? 'gemini' : 'pollinations',
      });

      newAsset.derivedFromAssetId = sourceAsset.id;
      newAsset.adaptationMode = options.adaptationMode;
      newAsset.originalDimensions = sourceAsset.originalDimensions || {
        width: sourceAsset.width,
        height: sourceAsset.height,
      };
      newAsset.originalAspectRatio = sourceAsset.originalAspectRatio || sourceAsset.aspectRatio;
      newAsset.focalPoint = options.focalPoint || { x: 50, y: 50 };
      newAsset.cropOffset = options.cropOffset || { x: 0, y: 0 };
      newAsset.fitMode = 'cover';

      return await this.saveBackgroundAsset(newAsset);
    }

    // For 'cover' and 'contain', create a new derived asset record referencing the original image file
    const derivedId = `adapted-bg-${Date.now()}-${randomUUID().slice(0, 6)}`;
    const adaptedAsset: BackgroundAsset = {
      ...sourceAsset,
      id: derivedId,
      name: `${sourceAsset.name} (${options.targetAspectRatio} ${options.adaptationMode.toUpperCase()})`,
      aspectRatio: options.targetAspectRatio,
      width: targetDims.width,
      height: targetDims.height,
      originalDimensions: sourceAsset.originalDimensions || {
        width: sourceAsset.width,
        height: sourceAsset.height,
      },
      originalAspectRatio: sourceAsset.originalAspectRatio || sourceAsset.aspectRatio,
      derivedFromAssetId: sourceAsset.id,
      adaptationMode: options.adaptationMode,
      fitMode: options.adaptationMode === 'contain' ? 'contain' : 'cover',
      focalPoint: options.focalPoint || sourceAsset.focalPoint || { x: 50, y: 50 },
      cropOffset: options.cropOffset || sourceAsset.cropOffset || { x: 0, y: 0 },
      createdAt: new Date().toISOString(),
    };

    return await this.saveBackgroundAsset(adaptedAsset);
  }
}
