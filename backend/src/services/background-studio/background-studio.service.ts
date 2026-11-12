import fs from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';
import { BackgroundAsset, BackgroundProviderType } from './background-studio.types.js';
import { buildSceneBackgroundPrompt, BackgroundPromptOptions } from '../character-studio/prompt-templates.js';
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
    artStyle?: '2d_cartoon' | '3d_pixar' | 'storybook_illustrated';
    aspectRatio?: '16:9' | '9:16' | '1:1' | '4:5';
    provider?: BackgroundProviderType;
  }): Promise<BackgroundAsset> {
    await this.ensureStorage();
    const {
      name,
      environmentType,
      details,
      mood,
      artStyle = 'storybook_illustrated',
      aspectRatio = '16:9',
      provider = 'pollinations',
    } = options;

    const prompt = buildSceneBackgroundPrompt({
      environmentType,
      details,
      mood,
      artStyle,
      aspectRatio,
    });

    // Determine target dimensions based on aspect ratio (Full 1080p standards)
    let width = 1920;
    let height = 1080;
    if (aspectRatio === '9:16') {
      width = 1080;
      height = 1920;
    } else if (aspectRatio === '1:1') {
      width = 1080;
      height = 1080;
    } else if (aspectRatio === '4:5') {
      width = 1080;
      height = 1350;
    }

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
    const asset: BackgroundAsset = {
      id: assetId,
      name: name || `${environmentType.charAt(0).toUpperCase() + environmentType.slice(1)} Background`,
      environmentType,
      description: details || `Storybook illustrated environment: ${environmentType}`,
      prompt,
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
      tags: [environmentType, artStyle, aspectRatio],
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
      tags: ['uploaded', environmentType, aspectRatio],
      createdAt: new Date().toISOString(),
    };

    return await this.saveBackgroundAsset(asset);
  }
}
