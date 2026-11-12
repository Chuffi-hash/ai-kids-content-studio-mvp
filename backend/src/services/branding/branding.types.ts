/**
 * Channel Identity & Branding Overlay Types.
 * Configures project-level channel logo, secondary badge, position presets,
 * format-specific safe-area positioning, and timing.
 */

export type BrandingPosition =
  | 'top-left'
  | 'top-right'
  | 'bottom-left'
  | 'bottom-right'
  | 'custom';

export type AspectRatioKey = '16:9' | '9:16' | '1:1' | '4:5';

export interface BrandingLayoutPreset {
  position?: BrandingPosition;
  customX?: number;
  customY?: number;
  width?: number;
  height?: number;
  padding?: number;
  opacity?: number;
}

export interface ChannelBrandingConfig {
  id?: string;
  storyId?: string;
  channelName?: string;
  logoUrl?: string;
  secondaryLogoUrl?: string;
  subscribeBadgeUrl?: string;
  socialHandle?: string;
  enabled: boolean;
  position: BrandingPosition;
  customX?: number;
  customY?: number;
  width?: number;
  height?: number;
  opacity: number;          // 0.0 - 1.0
  padding: number;          // distance from edge in px
  showBackgroundContainer?: boolean;
  containerBgColor?: string;
  borderRadius?: number;
  showShadow?: boolean;
  startTimeMs?: number;
  endTimeMs?: number;
  alwaysVisible?: boolean;  // entire-video visibility
  formatPresets?: Partial<Record<AspectRatioKey, BrandingLayoutPreset>>;
  safeAreaMargin?: number;
  createdAt?: string;
  updatedAt?: string;
}

export const DEFAULT_BRANDING_CONFIG: ChannelBrandingConfig = {
  enabled: false,
  position: 'top-right',
  width: 140,
  height: 50,
  opacity: 0.9,
  padding: 24,
  showBackgroundContainer: false,
  containerBgColor: 'rgba(15, 23, 42, 0.65)',
  borderRadius: 8,
  showShadow: true,
  alwaysVisible: true,
  safeAreaMargin: 20,
  formatPresets: {
    '16:9': {
      position: 'top-right',
      width: 140,
      height: 50,
      padding: 28,
      opacity: 0.9,
    },
    '9:16': {
      position: 'top-right',
      width: 110,
      height: 42,
      padding: 36, // avoid phone notch / status bar
      opacity: 0.9,
    },
    '1:1': {
      position: 'top-right',
      width: 120,
      height: 45,
      padding: 24,
      opacity: 0.9,
    },
    '4:5': {
      position: 'top-right',
      width: 120,
      height: 45,
      padding: 26,
      opacity: 0.9,
    },
  },
};
