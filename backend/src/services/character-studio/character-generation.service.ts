import fs from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';
import {
  CharacterAssetRecord,
  CharacterProviderType,
  CharacterReferenceAssets,
} from './character-studio.types.js';
import {
  buildCharacterReferencePrompt,
  buildCharacterTurnaroundPrompt,
  buildCharacterExpressionPrompt,
  buildCharacterPosePrompt,
  CharacterPromptOptions,
} from './prompt-templates.js';
import { PollinationsImageProvider } from '../image-generation/providers/pollinations-image.provider.js';
import { buildRigFromAppearance } from '../animation/templates/custom-character-rig.js';
import { getVectorRig } from '../animation/templates/default-characters.js';

export interface GenerateAssetResult {
  url: string;
  storagePath: string;
  prompt: string;
  provider: CharacterProviderType;
}

export class CharacterGenerationService {
  private storageDir: string;
  private pollinationsProvider: PollinationsImageProvider;

  constructor(options?: { storageDir?: string }) {
    this.storageDir = options?.storageDir || process.env.STORAGE_DIR || './storage';
    this.pollinationsProvider = new PollinationsImageProvider();
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
  private async saveCharacterFile(
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
   * Generates a character asset using the specified provider.
   */
  public async generateCharacterAsset(options: {
    characterId?: string;
    type: 'main' | 'turnaround' | 'expression' | 'pose';
    character: CharacterPromptOptions;
    provider?: CharacterProviderType;
    width?: number;
    height?: number;
  }): Promise<GenerateAssetResult> {
    const { type, character, provider = 'pollinations' } = options;
    const charId = options.characterId || `char-${Date.now()}-${randomUUID().slice(0, 6)}`;

    let prompt = '';
    switch (type) {
      case 'main':
        prompt = buildCharacterReferencePrompt(character);
        break;
      case 'turnaround':
        prompt = buildCharacterTurnaroundPrompt(character);
        break;
      case 'expression':
        prompt = buildCharacterExpressionPrompt(character);
        break;
      case 'pose':
        prompt = buildCharacterPosePrompt(character);
        break;
    }

    // Provider Execution
    if (provider === 'gemini') {
      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) {
        console.warn('[CharacterStudio] GEMINI_API_KEY not configured, falling back to Pollinations provider.');
      } else {
        // Optional Gemini/Imagen endpoint
        try {
          const res = await this.generateWithGemini(prompt, apiKey);
          const saved = await this.saveCharacterFile(charId, `${type}-${Date.now()}.png`, res);
          return {
            url: saved.url,
            storagePath: saved.filePath,
            prompt,
            provider: 'gemini',
          };
        } catch (geminiErr) {
          console.warn('[CharacterStudio] Gemini generation error, falling back to Pollinations:', geminiErr);
        }
      }
    }

    // Default high-quality Pollinations Flux generator
    const w = options.width || (type === 'turnaround' || type === 'pose' ? 1024 : 768);
    const h = options.height || (type === 'turnaround' || type === 'pose' ? 512 : 768);

    const generated = await this.pollinationsProvider.generateImage({
      prompt,
      width: w,
      height: h,
    });

    const ext = generated.mimeType.includes('png') ? 'png' : 'jpg';
    const saved = await this.saveCharacterFile(charId, `${type}-${Date.now()}.${ext}`, generated.imageBuffer);

    return {
      url: saved.url,
      storagePath: saved.filePath,
      prompt,
      provider: 'pollinations',
    };
  }

  /**
   * Imports manual Google Flow image assets (reference, turnaround, expression, or pose sheets).
   */
  public async importFromGoogleFlow(options: {
    characterId?: string;
    characterName: string;
    assetType: 'main' | 'turnaround' | 'expression' | 'pose';
    imageBufferOrBase64: Buffer | string;
    filename?: string;
    notes?: string;
  }): Promise<GenerateAssetResult> {
    const charId = options.characterId || `flow-${Date.now()}-${randomUUID().slice(0, 6)}`;
    let buffer: Buffer;

    if (typeof options.imageBufferOrBase64 === 'string') {
      const cleanBase64 = options.imageBufferOrBase64.replace(/^data:image\/\w+;base64,/, '');
      buffer = Buffer.from(cleanBase64, 'base64');
    } else {
      buffer = options.imageBufferOrBase64;
    }

    if (buffer.length === 0) {
      throw new Error('GoogleFlowImportProvider: empty image data supplied');
    }

    const safeFilename = options.filename
      ? `${options.assetType}-${path.basename(options.filename)}`
      : `${options.assetType}-flow-${Date.now()}.png`;

    const saved = await this.saveCharacterFile(charId, safeFilename, buffer);

    return {
      url: saved.url,
      storagePath: saved.filePath,
      prompt: options.notes || `Imported from Google Flow: ${options.assetType} for ${options.characterName}`,
      provider: 'google_flow',
    };
  }

  /**
   * Direct upload handler for character references and transparent PNGs.
   */
  public async uploadCharacterAsset(options: {
    characterId: string;
    assetType: 'main' | 'transparent' | 'turnaround' | 'expression' | 'pose';
    base64Data: string;
    filename?: string;
  }): Promise<GenerateAssetResult> {
    const { characterId, assetType, base64Data, filename } = options;
    const cleanBase64 = base64Data.replace(/^data:image\/\w+;base64,/, '');
    const buffer = Buffer.from(cleanBase64, 'base64');

    const ext = base64Data.startsWith('data:image/webp') ? 'webp' : 'png';
    const targetFilename = filename || `${assetType}-${Date.now()}.${ext}`;

    const saved = await this.saveCharacterFile(characterId, targetFilename, buffer);

    return {
      url: saved.url,
      storagePath: saved.filePath,
      prompt: `Uploaded ${assetType} asset`,
      provider: 'upload',
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
   * Optional Gemini REST implementation.
   */
  private async generateWithGemini(prompt: string, apiKey: string): Promise<Buffer> {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/imagen-3.0-generate-002:predict?key=${apiKey}`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        instances: [{ prompt }],
        parameters: { sampleCount: 1, aspectRatio: '1:1' },
      }),
    });

    if (!res.ok) {
      throw new Error(`Gemini Imagen API error: ${res.status} ${res.statusText}`);
    }

    const data = (await res.json()) as any;
    const b64 = data.predictions?.[0]?.bytesBase64Encoded;
    if (!b64) throw new Error('No image returned from Gemini Imagen');
    return Buffer.from(b64, 'base64');
  }
}
