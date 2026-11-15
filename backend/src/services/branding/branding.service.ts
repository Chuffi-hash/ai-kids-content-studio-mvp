import fs from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';
import {
  ChannelBrandingConfig,
  DEFAULT_BRANDING_CONFIG,
  AspectRatioKey,
  BrandingPosition,
} from './branding.types.js';

export interface CalculatedBrandingPlacement {
  x: number;
  y: number;
  width: number;
  height: number;
  opacity: number;
  borderRadius: number;
  showBackground: boolean;
  backgroundColor: string;
  showShadow: boolean;
  visible: boolean;
}

import {
  calculateResolvedBrandingPlacement,
  AspectRatioFormat,
} from './sharedCompositionCoordinates';

export class BrandingService {
  private storageDir: string;
  private brandingDir: string;
  private brandingConfigFile: string;

  constructor(options?: { storageDir?: string }) {
    this.storageDir = options?.storageDir || process.env.STORAGE_DIR || './storage';
    this.brandingDir = path.resolve(process.cwd(), this.storageDir, 'branding');
    this.brandingConfigFile = path.join(this.brandingDir, 'channel-branding.json');
  }

  private async ensureStorage(): Promise<void> {
    await fs.promises.mkdir(this.brandingDir, { recursive: true });
    if (!fs.existsSync(this.brandingConfigFile)) {
      await fs.promises.writeFile(
        this.brandingConfigFile,
        JSON.stringify(DEFAULT_BRANDING_CONFIG, null, 2),
        'utf8'
      );
    }
  }

  private toPublicUrl(relPath: string): string {
    const clean = relPath.replace(/\\/g, '/').replace(/^\/?storage\/?/, '');
    const origin = process.env.BACKEND_URL || 'http://localhost:5001';
    return `${origin}/storage/${clean}`;
  }

  /**
   * Retrieves global default or story-specific channel branding configuration.
   */
  public async getBrandingConfig(storyId?: string): Promise<ChannelBrandingConfig> {
    await this.ensureStorage();
    if (storyId) {
      const storyFile = path.join(this.brandingDir, `branding-${storyId}.json`);
      if (fs.existsSync(storyFile)) {
        try {
          const raw = await fs.promises.readFile(storyFile, 'utf8');
          return { ...DEFAULT_BRANDING_CONFIG, ...JSON.parse(raw) };
        } catch {
          // Fall back to default
        }
      }
    }

    try {
      const raw = await fs.promises.readFile(this.brandingConfigFile, 'utf8');
      return { ...DEFAULT_BRANDING_CONFIG, ...JSON.parse(raw) };
    } catch {
      return { ...DEFAULT_BRANDING_CONFIG };
    }
  }

  /**
   * Saves channel branding configuration.
   */
  public async saveBrandingConfig(
    config: Partial<ChannelBrandingConfig>,
    storyId?: string
  ): Promise<ChannelBrandingConfig> {
    await this.ensureStorage();
    const existing = await this.getBrandingConfig(storyId);
    const updated: ChannelBrandingConfig = {
      ...existing,
      ...config,
      updatedAt: new Date().toISOString(),
    };

    const targetFile = storyId
      ? path.join(this.brandingDir, `branding-${storyId}.json`)
      : this.brandingConfigFile;

    await fs.promises.writeFile(targetFile, JSON.stringify(updated, null, 2), 'utf8');
    return updated;
  }

  /**
   * Uploads and validates a channel branding image asset (logo, secondary logo, badge).
   * Validates PNG, SVG, and WebP format and preserves transparency.
   */
  public async uploadBrandingAsset(options: {
    buffer: Buffer;
    originalFilename: string;
    mimeType: string;
    assetType?: 'logo' | 'secondary_logo' | 'subscribe_badge';
    storyId?: string;
  }): Promise<{ url: string; storagePath: string; mimeType: string; filename: string }> {
    await this.ensureStorage();
    const { buffer, originalFilename, mimeType, assetType = 'logo' } = options;

    // Validate size (max 5MB)
    const MAX_SIZE = 5 * 1024 * 1024;
    if (buffer.length > MAX_SIZE) {
      throw new Error('Branding image size exceeds maximum permitted limit of 5MB.');
    }

    // Validate image format
    const ext = (path.extname(originalFilename).toLowerCase().replace('.', '') || 'png');
    const allowedExts = ['png', 'svg', 'webp', 'jpg', 'jpeg'];
    const isMimeAllowed =
      mimeType.includes('png') ||
      mimeType.includes('svg') ||
      mimeType.includes('webp') ||
      mimeType.includes('jpeg') ||
      mimeType.includes('jpg');

    if (!allowedExts.includes(ext) && !isMimeAllowed) {
      throw new Error('Invalid branding asset format. Only PNG, SVG, WebP, or JPEG formats are supported.');
    }

    const safeFilename = `${assetType}-${Date.now()}-${randomUUID().slice(0, 6)}.${ext}`;
    const filePath = path.join(this.brandingDir, safeFilename);

    await fs.promises.writeFile(filePath, buffer);

    const rel = path.relative(path.resolve(process.cwd(), this.storageDir), filePath);
    return {
      url: this.toPublicUrl(rel),
      storagePath: filePath,
      mimeType,
      filename: safeFilename,
    };
  }

  /**
   * Computes exact pixel placement for a branding overlay given active format and dimensions.
   * Ensures the logo never overlaps captions or character action safe areas.
   */
  public static calculatePlacement(
    config: ChannelBrandingConfig,
    format: AspectRatioKey,
    viewportWidth: number,
    viewportHeight: number,
    currentMediaTimeMs = 0
  ): CalculatedBrandingPlacement {
    const resolved = calculateResolvedBrandingPlacement({
      branding: config as any,
      format: format as AspectRatioFormat,
      containerWidth: viewportWidth,
      containerHeight: viewportHeight,
      currentTimeMs: currentMediaTimeMs,
    });

    return {
      x: resolved.x,
      y: resolved.y,
      width: resolved.width,
      height: resolved.height,
      opacity: resolved.opacity,
      borderRadius: resolved.borderRadius,
      showBackground: resolved.showBackground,
      backgroundColor: resolved.backgroundColor,
      showShadow: resolved.showShadow,
      visible: resolved.visible,
    };
  }
}
