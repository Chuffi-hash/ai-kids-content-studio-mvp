/**
 * Shared Video Composition Coordinate & Branding Placement Engine.
 *
 * Provides a unified, resolution-independent coordinate system (0.0 to 1.0 normalized)
 * used identically by:
 * 1. Simple Editor 2D Canvas & Preview
 * 2. Remotion Player Preview
 * 3. Final Remotion MP4 Exporter
 */

export interface NormalizedPosition {
  x: number; // 0.0 to 1.0 across composition width
  y: number; // 0.0 to 1.0 down composition height
}

export interface CompositionSize {
  width: number;
  height: number;
}

export type AspectRatioFormat = '16:9' | '9:16' | '1:1' | '4:5';
export type ResolutionTier = '720p' | '1080p';
export type BrandingPosition = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right' | 'custom';

export interface BrandingLayoutPreset {
  position?: BrandingPosition;
  normalizedX?: number;
  normalizedY?: number;
  customX?: number;
  customY?: number;
  width?: number;
  height?: number;
  padding?: number;
  opacity?: number;
}

export interface SharedChannelBrandingConfig {
  id?: string;
  storyId?: string;
  channelName?: string;
  showChannelName?: boolean;
  logoUrl?: string;
  secondaryLogoUrl?: string;
  subscribeBadgeUrl?: string;
  socialHandle?: string;
  showSocialHandle?: boolean;
  enabled: boolean;
  position: BrandingPosition;
  normalizedX?: number;
  normalizedY?: number;
  customX?: number;
  customY?: number;
  width?: number;
  height?: number;
  opacity: number;
  padding: number;
  showBackgroundContainer?: boolean;
  containerBgColor?: string;
  borderRadius?: number;
  showShadow?: boolean;
  startTimeMs?: number;
  endTimeMs?: number;
  alwaysVisible?: boolean;
  formatPresets?: Partial<Record<AspectRatioFormat, BrandingLayoutPreset>>;
  safeAreaMargin?: number;
}

export interface ResolvedBrandingPlacement {
  visible: boolean;
  x: number; // Absolute left in pixels within container
  y: number; // Absolute top in pixels within container
  width: number; // Rendered width in pixels
  height: number; // Rendered height in pixels
  opacity: number;
  showBackground: boolean;
  backgroundColor: string;
  borderRadius: number;
  showShadow: boolean;
  showChannelName: boolean;
  channelName?: string;
  showSocialHandle: boolean;
  socialHandle?: string;
}

/**
 * Returns canonical composition resolution for each aspect ratio and tier.
 */
export function getCompositionDimensions(
  format: AspectRatioFormat = '16:9',
  tier: ResolutionTier = '1080p'
): CompositionSize {
  if (tier === '1080p') {
    switch (format) {
      case '9:16':
        return { width: 1080, height: 1920 };
      case '1:1':
        return { width: 1080, height: 1080 };
      case '4:5':
        return { width: 1080, height: 1350 };
      case '16:9':
      default:
        return { width: 1920, height: 1080 };
    }
  } else {
    switch (format) {
      case '9:16':
        return { width: 720, height: 1280 };
      case '1:1':
        return { width: 720, height: 720 };
      case '4:5':
        return { width: 720, height: 900 };
      case '16:9':
      default:
        return { width: 1280, height: 720 };
    }
  }
}

/**
 * Converts screen/pointer coordinates into normalized composition space [0.0, 1.0].
 */
export function screenToComposition(
  screenX: number,
  screenY: number,
  containerWidth: number,
  containerHeight: number
): NormalizedPosition {
  const safeW = Math.max(1, containerWidth);
  const safeH = Math.max(1, containerHeight);
  return {
    x: Math.max(0, Math.min(1, screenX / safeW)),
    y: Math.max(0, Math.min(1, screenY / safeH)),
  };
}

/**
 * Converts normalized composition coordinates into pixel coordinates within a given container.
 */
export function compositionToScreen(
  normPos: NormalizedPosition,
  containerWidth: number,
  containerHeight: number
): { x: number; y: number } {
  return {
    x: Math.round(normPos.x * containerWidth),
    y: Math.round(normPos.y * containerHeight),
  };
}

/**
 * Computes exact pixel placement for Channel Branding Overlay.
 *
 * Guarantees identical output across:
 * - Editor Preview (scaled container)
 * - Remotion Composition (1920x1080 or 1280x720)
 * - Exported MP4
 */
export function calculateResolvedBrandingPlacement(options: {
  branding?: SharedChannelBrandingConfig | null;
  format: AspectRatioFormat;
  containerWidth: number;
  containerHeight: number;
  currentTimeMs?: number;
}): ResolvedBrandingPlacement {
  const { branding, format, containerWidth, containerHeight, currentTimeMs = 0 } = options;

  const hiddenResult: ResolvedBrandingPlacement = {
    visible: false,
    x: 0,
    y: 0,
    width: 0,
    height: 0,
    opacity: 0,
    showBackground: false,
    backgroundColor: 'transparent',
    borderRadius: 8,
    showShadow: false,
    showChannelName: false,
    showSocialHandle: false,
  };

  if (!branding || !branding.enabled || !branding.logoUrl) {
    return hiddenResult;
  }

  // Timing check
  const isTimeVisible =
    branding.alwaysVisible === true
      ? true
      : (currentTimeMs >= (branding.startTimeMs || 0) &&
         currentTimeMs <= (branding.endTimeMs || Infinity));

  if (!isTimeVisible) {
    return hiddenResult;
  }

  const preset = branding.formatPresets?.[format] || {};
  const pos: BrandingPosition = preset.position || branding.position || 'bottom-right';
  const basePadding = preset.padding ?? branding.padding ?? 24;
  const baseWidth = preset.width ?? branding.width ?? 140;
  const baseHeight = preset.height ?? branding.height ?? 50;
  const opacity = preset.opacity ?? branding.opacity ?? 0.9;

  // Reference base width for proportional scaling
  const refBaseWidth = format === '16:9' ? 1280 : 720;
  const scale = containerWidth / refBaseWidth;

  const targetWidth = Math.round(baseWidth * scale);
  const targetHeight = Math.round(baseHeight * scale);
  const padX = Math.round(basePadding * scale);
  const padY = Math.round(basePadding * scale);

  let x = 0;
  let y = 0;

  switch (pos) {
    case 'top-left':
      x = padX;
      y = padY;
      break;

    case 'top-right':
      x = containerWidth - targetWidth - padX;
      y = padY;
      break;

    case 'bottom-left':
      x = padX;
      y = containerHeight - targetHeight - padY;
      break;

    case 'bottom-right':
    default:
      x = containerWidth - targetWidth - padX;
      y = containerHeight - targetHeight - padY;
      break;

    case 'custom': {
      // 1. Normalized coordinates have highest precision across any resolution
      const normX = preset.normalizedX ?? branding.normalizedX;
      const normY = preset.normalizedY ?? branding.normalizedY;

      if (typeof normX === 'number' && typeof normY === 'number') {
        x = Math.round(normX * containerWidth);
        y = Math.round(normY * containerHeight);
      } else {
        // 2. Backward compatibility with legacy customX/customY
        const rawX = preset.customX ?? branding.customX;
        const rawY = preset.customY ?? branding.customY;

        if (typeof rawX === 'number' && typeof rawY === 'number') {
          if (rawX <= 1.0 && rawY <= 1.0) {
            // Already fractional
            x = Math.round(rawX * containerWidth);
            y = Math.round(rawY * containerHeight);
          } else {
            // Legacy px offset: map relative to refBase dimensions
            const refBaseHeight = format === '16:9' ? 720 : (format === '9:16' ? 1280 : (format === '1:1' ? 720 : 900));
            const inferredNormX = Math.min(1 - targetWidth / containerWidth, Math.max(0, rawX / refBaseWidth));
            const inferredNormY = Math.min(1 - targetHeight / containerHeight, Math.max(0, rawY / refBaseHeight));
            x = Math.round(inferredNormX * containerWidth);
            y = Math.round(inferredNormY * containerHeight);
          }
        } else {
          // Fall back to bottom-right
          x = containerWidth - targetWidth - padX;
          y = containerHeight - targetHeight - padY;
        }
      }
      break;
    }
  }

  // Bounds safety clamp
  x = Math.max(0, Math.min(containerWidth - targetWidth, x));
  y = Math.max(0, Math.min(containerHeight - targetHeight, y));

  // Explicit opt-in for text overlays to prevent unexpected "test" strings
  const showChannelName = Boolean(branding.showChannelName && branding.channelName && branding.channelName.trim().length > 0);
  const showSocialHandle = Boolean(branding.showSocialHandle && branding.socialHandle && branding.socialHandle.trim().length > 0);

  return {
    visible: true,
    x,
    y,
    width: targetWidth,
    height: targetHeight,
    opacity,
    showBackground: Boolean(branding.showBackgroundContainer),
    backgroundColor: branding.containerBgColor || 'rgba(15, 23, 42, 0.65)',
    borderRadius: branding.borderRadius ?? 8,
    showShadow: branding.showShadow ?? true,
    showChannelName,
    channelName: showChannelName ? branding.channelName : undefined,
    showSocialHandle,
    socialHandle: showSocialHandle ? branding.socialHandle : undefined,
  };
}
