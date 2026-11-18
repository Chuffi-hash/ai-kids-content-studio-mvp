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

export function verifyImageMagicBytes(buffer: Buffer, expectedFormat: string): boolean {
  if (buffer.length < 4) return false;

  if (expectedFormat === 'png') {
    return buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47;
  }
  if (expectedFormat === 'jpg' || expectedFormat === 'jpeg') {
    return buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
  }
  if (expectedFormat === 'webp') {
    if (buffer.length < 12) return false;
    const riff = buffer.toString('ascii', 0, 4);
    const webp = buffer.toString('ascii', 8, 12);
    return riff === 'RIFF' && webp === 'WEBP';
  }
  if (expectedFormat === 'svg') {
    const head = buffer.toString('utf8', 0, Math.min(buffer.length, 1024)).trim().toLowerCase();
    return head.includes('<svg') || (head.includes('<?xml') && head.includes('<svg'));
  }
  return false;
}

export function sanitizeSvg(svgContent: string): string {
  // Strip <script>...</script>
  let clean = svgContent.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
  // Strip dangerous event handler attributes
  clean = clean.replace(/\s*on[a-zA-Z]+\s*=\s*(?:'[^']*'|"[^"]*"|[^\s>]+)/gi, '');
  // Strip javascript: uris
  clean = clean.replace(/href\s*=\s*["']?javascript:[^"'>\s]+/gi, 'href=""');
  clean = clean.replace(/xlink:href\s*=\s*["']?javascript:[^"'>\s]+/gi, 'xlink:href=""');
  // Strip embedded objects
  clean = clean.replace(/<object\b[^<]*(?:(?!<\/object>)<[^<]*)*<\/object>/gi, '');
  clean = clean.replace(/<embed\b[^>]*>/gi, '');
  clean = clean.replace(/<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi, '');
  clean = clean.replace(/<foreignObject\b[^<]*(?:(?!<\/foreignObject>)<[^<]*)*<\/foreignObject>/gi, '');
  return clean;
}

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
    const { buffer, originalFilename, mimeType, assetType = 'logo', storyId } = options;

    // 1. Path traversal / storyId validation
    if (storyId && !/^[a-zA-Z0-9_-]+$/.test(storyId)) {
      throw new Error('Invalid storyId: contains illegal characters or path traversal sequences.');
    }

    // 2. AssetType whitelist
    const allowedAssetTypes = ['logo', 'secondary_logo', 'subscribe_badge'];
    if (!allowedAssetTypes.includes(assetType)) {
      throw new Error(`Invalid assetType "${assetType}". Allowed types: ${allowedAssetTypes.join(', ')}`);
    }

    // 3. Validate size (max 5MB)
    const MAX_SIZE = 5 * 1024 * 1024;
    if (buffer.length > MAX_SIZE) {
      throw new Error('Branding image size exceeds maximum permitted limit of 5MB.');
    }

    // 4. Validate image extension & MIME match
    const ext = (path.extname(originalFilename).toLowerCase().replace('.', '') || 'png');
    const allowedExts = ['png', 'svg', 'webp', 'jpg', 'jpeg'];
    if (!allowedExts.includes(ext)) {
      throw new Error(`Invalid file extension ".${ext}". Only PNG, SVG, WebP, or JPEG formats are supported.`);
    }

    const mimeLower = (mimeType || '').toLowerCase();
    const validMimeMap: Record<string, string[]> = {
      png: ['image/png'],
      jpg: ['image/jpeg', 'image/jpg'],
      jpeg: ['image/jpeg', 'image/jpg'],
      webp: ['image/webp'],
      svg: ['image/svg+xml', 'image/svg'],
    };

    const validMimes = validMimeMap[ext] || [];
    if (!validMimes.some((m) => mimeLower.includes(m))) {
      throw new Error(`MIME type "${mimeType}" does not match file extension ".${ext}".`);
    }

    // 5. File magic byte signature verification
    if (!verifyImageMagicBytes(buffer, ext)) {
      throw new Error(`File contents do not match the expected image signature for ".${ext}".`);
    }

    // 6. SVG sanitization (strip scripts, handlers, embed objects)
    let finalBuffer = buffer;
    if (ext === 'svg') {
      const rawSvg = buffer.toString('utf8');
      const cleanSvg = sanitizeSvg(rawSvg);
      finalBuffer = Buffer.from(cleanSvg, 'utf8');
    }

    // 7. Storage directory containment check
    const safeFilename = `${assetType}-${Date.now()}-${randomUUID().slice(0, 6)}.${ext}`;
    const resolvedBrandingDir = path.resolve(this.brandingDir);
    const filePath = path.resolve(resolvedBrandingDir, safeFilename);

    if (!filePath.startsWith(resolvedBrandingDir)) {
      throw new Error('Storage path containment violation: Attempted directory traversal.');
    }

    await fs.promises.writeFile(filePath, finalBuffer);

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
