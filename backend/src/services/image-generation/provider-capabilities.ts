/**
 * Image Generation Provider Capabilities & Rights Matrix.
 * Tracks supported aspect ratios, dimensions, reference image support,
 * watermark-free output status, commercial use licensing, and usage restrictions.
 */

export interface ProviderCapabilityRecord {
  providerId: 'gemini' | 'pollinations' | 'comfyui' | 'mock' | 'hosted';
  name: string;
  defaultModel: string;
  supportedAspectRatios: Array<'16:9' | '9:16' | '1:1' | '4:5' | 'custom'>;
  supportedDimensions: Array<{ width: number; height: number; label: string }>;
  supportsTransparentBackground: boolean;
  supportsReferenceImage: boolean;
  supportsNegativePrompt: boolean;
  watermarkFree: boolean;
  watermarkDetails: string;
  commercialUseStatus: 'verified_commercial' | 'personal_use_only' | 'attribution_required' | 'restricted' | 'unknown_needs_review';
  commercialUseDetails: string;
  attributionRequirements?: string;
  planRestrictions?: string;
  usageRestrictions?: string;
  termsUrl: string;
  lastVerifiedDate: string;
}

export type WatermarkCategory =
  | 'provider_watermark'      // Brand logo added by the AI provider (e.g. DALL-E corner glyph)
  | 'channel_branding'        // User's own channel identity, logo, or handle
  | 'copyright_attribution'   // Legal credit required by licenses (e.g. Creative Commons)
  | 'embedded_metadata';      // Imperceptible digital watermarks (e.g. Google SynthID, C2PA)

export const PROVIDER_CAPABILITIES: Record<string, ProviderCapabilityRecord> = {
  gemini: {
    providerId: 'gemini',
    name: 'Google Gemini (Imagen & Nano Banana)',
    defaultModel: 'gemini-2.5-flash-image',
    supportedAspectRatios: ['16:9', '9:16', '1:1', '4:5'],
    supportedDimensions: [
      { width: 1920, height: 1080, label: '1080p Landscape (16:9)' },
      { width: 1080, height: 1920, label: '1080p Vertical Reel (9:16)' },
      { width: 1080, height: 1080, label: '1080p Square (1:1)' },
      { width: 1080, height: 1350, label: '1080p Portrait (4:5)' },
    ],
    supportsTransparentBackground: true,
    supportsReferenceImage: true,
    supportsNegativePrompt: true,
    watermarkFree: true,
    watermarkDetails: 'No visible visible watermarks are rendered onto the output frame. Google embeds an imperceptible cryptographic SynthID digital signature at the pixel frequency level for authenticity verification.',
    commercialUseStatus: 'verified_commercial',
    commercialUseDetails: 'Under Google Cloud and Google AI Studio commercial API terms, customer owns the output content and may use generated assets for commercial media production.',
    attributionRequirements: 'None required by Google Generative AI API terms.',
    planRestrictions: 'Requires valid Google AI API key with adequate quota.',
    termsUrl: 'https://ai.google.dev/terms',
    lastVerifiedDate: '2026-11-12',
  },
  pollinations: {
    providerId: 'pollinations',
    name: 'Pollinations AI (Flux / SDXL)',
    defaultModel: 'flux',
    supportedAspectRatios: ['16:9', '9:16', '1:1', '4:5'],
    supportedDimensions: [
      { width: 1920, height: 1080, label: '1080p Landscape (16:9)' },
      { width: 1080, height: 1920, label: '1080p Vertical Reel (9:16)' },
      { width: 1080, height: 1080, label: '1080p Square (1:1)' },
      { width: 1080, height: 1350, label: '1080p Portrait (4:5)' },
    ],
    supportsTransparentBackground: false,
    supportsReferenceImage: false,
    supportsNegativePrompt: false,
    watermarkFree: true,
    watermarkDetails: 'Visible watermarks are suppressed via the official `nologo=true` API parameter. Clean raster output.',
    commercialUseStatus: 'verified_commercial',
    commercialUseDetails: 'Under Flux / Stable Diffusion open-weights commercial licenses, generated outputs may be used in commercial projects.',
    attributionRequirements: 'Optional community credit encouraged for free tier.',
    planRestrictions: 'Rate limited under heavy community traffic; fallback retries active.',
    termsUrl: 'https://pollinations.ai/terms',
    lastVerifiedDate: '2026-11-12',
  },
  comfyui: {
    providerId: 'comfyui',
    name: 'ComfyUI (Local / Self-Hosted)',
    defaultModel: 'sdxl_base',
    supportedAspectRatios: ['16:9', '9:16', '1:1', '4:5', 'custom'],
    supportedDimensions: [
      { width: 1920, height: 1080, label: 'Custom 1080p Landscape' },
      { width: 1080, height: 1920, label: 'Custom 1080p Vertical' },
      { width: 1080, height: 1080, label: 'Custom 1080p Square' },
      { width: 1080, height: 1350, label: 'Custom 1080p Portrait' },
    ],
    supportsTransparentBackground: true,
    supportsReferenceImage: true,
    supportsNegativePrompt: true,
    watermarkFree: true,
    watermarkDetails: 'Self-hosted local inference produces 100% watermark-free images.',
    commercialUseStatus: 'unknown_needs_review',
    commercialUseDetails: 'Depends on the specific local checkpoint loaded (e.g. SDXL allows commercial use, whereas some fine-tunes require commercial licenses).',
    termsUrl: 'https://github.com/comfyanonymous/ComfyUI',
    lastVerifiedDate: '2026-11-12',
  },
  mock: {
    providerId: 'mock',
    name: 'Mock Test Provider',
    defaultModel: 'mock-svg-renderer',
    supportedAspectRatios: ['16:9', '9:16', '1:1', '4:5'],
    supportedDimensions: [
      { width: 1920, height: 1080, label: '1080p Landscape' },
      { width: 1080, height: 1920, label: '1080p Vertical' },
      { width: 1080, height: 1080, label: '1080p Square' },
      { width: 1080, height: 1350, label: '1080p Portrait' },
    ],
    supportsTransparentBackground: true,
    supportsReferenceImage: true,
    supportsNegativePrompt: true,
    watermarkFree: true,
    watermarkDetails: 'Synthetic offline test vectors without external watermarks.',
    commercialUseStatus: 'verified_commercial',
    commercialUseDetails: 'Test asset only.',
    termsUrl: 'local://test',
    lastVerifiedDate: '2026-11-12',
  },
};

export class ProviderCapabilitiesService {
  public static getCapability(providerId?: string): ProviderCapabilityRecord {
    if (!providerId) return PROVIDER_CAPABILITIES.gemini;
    const clean = providerId.toLowerCase().trim();
    return PROVIDER_CAPABILITIES[clean] || PROVIDER_CAPABILITIES.gemini;
  }

  public static getAllCapabilities(): ProviderCapabilityRecord[] {
    return Object.values(PROVIDER_CAPABILITIES);
  }
}
