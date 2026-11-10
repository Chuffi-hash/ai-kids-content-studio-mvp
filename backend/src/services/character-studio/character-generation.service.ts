import fs from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';
import {
  CharacterProviderType,
  CharacterGenerationPrompt,
  GenerateAssetResult,
  ProviderCapabilities,
} from './character-studio.types.js';
import { CharacterPromptBuilderService } from './character-prompt-builder.service.js';
import { PollinationsImageProvider } from '../image-generation/providers/pollinations-image.provider.js';
import { buildRigFromAppearance } from '../animation/templates/custom-character-rig.js';
import { getVectorRig } from '../animation/templates/default-characters.js';

export class CharacterGenerationService {
  private storageDir: string;
  private pollinationsProvider: PollinationsImageProvider;
  private promptBuilder: CharacterPromptBuilderService;

  constructor(options?: { storageDir?: string }) {
    this.storageDir = options?.storageDir || process.env.STORAGE_DIR || './storage';
    this.pollinationsProvider = new PollinationsImageProvider();
    this.promptBuilder = new CharacterPromptBuilderService();
  }

  /**
   * Returns provider capabilities and limitations.
   */
  public getProviderCapabilities(provider: string): ProviderCapabilities {
    if (provider === 'gemini') {
      return {
        provider: 'gemini',
        model: 'imagen-3.0-generate-002',
        supportsReferenceImage: false,
        supportsNegativePrompt: true,
        supportsCustomAspectRatio: true,
        notes:
          'Official Google Imagen 3 diffusion model. High-fidelity character illustrations using canonical appearance prompt injection. Direct image-to-image conditioning is not supported on this endpoint.',
      };
    }

    return {
      provider: 'pollinations',
      model: process.env.POLLINATIONS_MODEL || 'flux',
      supportsReferenceImage: false,
      supportsNegativePrompt: false,
      supportsCustomAspectRatio: true,
      notes:
        'Pollinations Flux text-to-image generator. Fast, vibrant cartoon and storybook illustrations with prompt-based identity consistency.',
    };
  }

  /**
   * Resolves storage URL for the browser.
   */
  private toPublicUrl(relPath: string): string {
    const clean = relPath.replace(/\\/g, '/').replace(/^\/?storage\/?/, '');
    const origin = process.env.BACKEND_URL || 'http://localhost:5001';
    return `${origin}/storage/${clean}`;
  }

  /**
   * Saves a buffer to local storage under `storage/characters/<characterId>/`.
   */
  public async saveCharacterFile(
    characterId: string,
    filename: string,
    buffer: Buffer
  ): Promise<{ url: string; filePath: string }> {
    const charDir = path.resolve(process.cwd(), this.storageDir, 'characters', characterId);
    await fs.promises.mkdir(charDir, { recursive: true });
    const filePath = path.join(charDir, filename);
    await fs.promises.writeFile(filePath, buffer);
    const rel = path.relative(path.resolve(process.cwd(), this.storageDir), filePath);
    return {
      url: this.toPublicUrl(rel),
      filePath,
    };
  }

  /**
   * Generates a character asset using the specified provider with NO silent fallback.
   */
  public async generateCharacterAsset(options: {
    characterId?: string;
    promptData: CharacterGenerationPrompt;
    provider?: 'gemini' | 'pollinations';
    width?: number;
    height?: number;
    aspectRatio?: '1:1' | '9:16' | '16:9' | '4:3' | '3:4';
  }): Promise<GenerateAssetResult> {
    const { promptData, provider = 'pollinations', aspectRatio = '1:1' } = options;
    const charId = options.characterId || `char-${Date.now()}-${randomUUID().slice(0, 6)}`;
    const assetId = `asset-${Date.now()}-${randomUUID().slice(0, 6)}`;

    // Build the final combined prompt and negative prompt
    const { prompt, negativePrompt } = this.promptBuilder.buildPrompt(promptData);

    let imageBuffer: Buffer;
    let actualModel = '';

    if (provider === 'gemini') {
      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) {
        throw new Error(
          'Gemini API key is not configured. Please set GEMINI_API_KEY in your environment, or choose Pollinations provider.'
        );
      }

      actualModel = 'imagen-3.0-generate-002';
      // Execute Gemini without silent fallback
      try {
        imageBuffer = await this.generateWithGemini({
          prompt,
          negativePrompt,
          aspectRatio,
          apiKey,
        });
      } catch (err: any) {
        console.error('[CharacterStudio] Gemini generation error:', err);
        throw new Error(`Gemini Image Generation Error: ${err.message || 'Request failed'}`);
      }
    } else {
      // Pollinations Provider
      actualModel = process.env.POLLINATIONS_MODEL || 'flux';
      const w = options.width || (promptData.generationType === 'turnaround' || promptData.generationType === 'pose' ? 1024 : 768);
      const h = options.height || (promptData.generationType === 'turnaround' || promptData.generationType === 'pose' ? 512 : 768);

      try {
        const generated = await this.pollinationsProvider.generateImage({
          prompt,
          width: w,
          height: h,
        });
        imageBuffer = generated.imageBuffer;
      } catch (err: any) {
        console.error('[CharacterStudio] Pollinations generation error:', err);
        throw new Error(`Pollinations Image Generation Error: ${err.message || 'Request failed'}`);
      }
    }

    const filename = `${promptData.generationType}-${Date.now()}-${randomUUID().slice(0, 4)}.png`;
    const saved = await this.saveCharacterFile(charId, filename, imageBuffer);

    return {
      assetId,
      url: saved.url,
      storagePath: saved.filePath,
      prompt,
      negativePrompt,
      provider,
      model: actualModel,
      generationType: promptData.generationType,
      isMasterReference: promptData.generationType === 'main',
      referenceImageUrl: promptData.referenceImageUrl,
    };
  }

  /**
   * Imports an asset exported from Google Flow.
   */
  public async importFromGoogleFlow(options: {
    characterId?: string;
    characterName: string;
    assetType: 'main' | 'turnaround' | 'expression' | 'pose' | 'custom';
    imageBufferOrBase64: string | Buffer;
    filename?: string;
    notes?: string;
  }): Promise<GenerateAssetResult> {
    const { characterName, assetType, imageBufferOrBase64, filename } = options;
    const characterId = options.characterId || `char-${Date.now()}-${randomUUID().slice(0, 6)}`;
    const assetId = `asset-flow-${Date.now()}-${randomUUID().slice(0, 6)}`;

    let buffer: Buffer;
    if (typeof imageBufferOrBase64 === 'string') {
      const b64 = imageBufferOrBase64.replace(/^data:image\/\w+;base64,/, '');
      buffer = Buffer.from(b64, 'base64');
    } else {
      buffer = imageBufferOrBase64;
    }

    const ext = filename?.split('.').pop() || 'png';
    const targetFilename = filename || `${assetType}-flow-${Date.now()}.${ext}`;

    const saved = await this.saveCharacterFile(characterId, targetFilename, buffer);

    return {
      assetId,
      url: saved.url,
      storagePath: saved.filePath,
      prompt: `Imported Google Flow ${assetType} for ${characterName}`,
      provider: 'google_flow',
      model: 'google_flow_import',
      generationType: assetType,
      isMasterReference: assetType === 'main',
    };
  }

  /**
   * Uploads an external character image asset.
   */
  public async uploadCharacterAsset(options: {
    characterId: string;
    assetType: 'main' | 'turnaround' | 'expression' | 'pose' | 'custom';
    base64Data: string;
    filename?: string;
  }): Promise<GenerateAssetResult> {
    const { characterId, assetType, base64Data, filename } = options;
    const assetId = `asset-upload-${Date.now()}-${randomUUID().slice(0, 6)}`;

    const b64 = base64Data.replace(/^data:image\/\w+;base64,/, '');
    const buffer = Buffer.from(b64, 'base64');

    const ext = filename?.split('.').pop() || 'png';
    const targetFilename = filename || `${assetType}-${Date.now()}.${ext}`;

    const saved = await this.saveCharacterFile(characterId, targetFilename, buffer);

    return {
      assetId,
      url: saved.url,
      storagePath: saved.filePath,
      prompt: `Uploaded ${assetType} asset`,
      provider: 'upload',
      model: 'user_upload',
      generationType: assetType,
      isMasterReference: assetType === 'main',
    };
  }

  /**
   * Generates a native vector rig definition for consistent, lightweight 2D character animation.
   */
  public generateNativeVectorRig(characterId: string, name: string, appearance?: any) {
    if (appearance) {
      return buildRigFromAppearance(characterId, name, appearance);
    }
    return getVectorRig(characterId);
  }

  /**
   * Calls Google Generative Language API for Imagen 3.
   */
  private async generateWithGemini(options: {
    prompt: string;
    negativePrompt?: string;
    aspectRatio?: '1:1' | '9:16' | '16:9' | '4:3' | '3:4';
    apiKey: string;
  }): Promise<Buffer> {
    const { prompt, negativePrompt, aspectRatio = '1:1', apiKey } = options;
    const url = `https://generativelanguage.googleapis.com/v1beta/models/imagen-3.0-generate-002:predict?key=${apiKey}`;

    const parameters: any = {
      sampleCount: 1,
      aspectRatio,
      outputMimeType: 'image/png',
    };

    if (negativePrompt && negativePrompt.trim().length > 0) {
      parameters.negativePrompt = negativePrompt.trim();
    }

    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        instances: [{ prompt }],
        parameters,
      }),
      signal: AbortSignal.timeout(60000),
    });

    if (!res.ok) {
      const errBody = await res.text();
      let errorDetail = errBody;
      try {
        const parsed = JSON.parse(errBody);
        errorDetail = parsed.error?.message || errBody;
      } catch {
        // use raw text
      }
      throw new Error(`HTTP ${res.status}: ${errorDetail}`);
    }

    const data = (await res.json()) as any;
    const b64 = data.predictions?.[0]?.bytesBase64Encoded;
    if (!b64) {
      throw new Error('Gemini Imagen API returned successful status but no image predictions');
    }

    return Buffer.from(b64, 'base64');
  }
}
