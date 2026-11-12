import { ProviderCapabilitiesService } from '../image-generation/provider-capabilities.js';

export type CommercialUseStatus =
  | 'verified_commercial'       // Verified for commercial use under recorded terms
  | 'personal_use_only'         // Personal use only
  | 'attribution_required'      // Attribution required
  | 'restricted'                // Restricted
  | 'unknown_needs_review';     // Unknown / needs review

export type AssetType =
  | 'background'
  | 'character_raster'
  | 'character_rig'
  | 'branding_logo'
  | 'overlay';

export interface AssetProvenanceRecord {
  assetId: string;
  assetType: AssetType;
  name?: string;
  provider: string;
  model: string;
  generatedAt: string;
  originalPrompt: string;
  generatedPrompt?: string;
  referenceImageIds?: string[];
  originalDimensions: { width: number; height: number };
  processedDimensions?: { width: number; height: number };
  stylePreset?: string;
  aspectRatio: string;
  watermarkStatus: 'watermark_free' | 'watermarked_by_provider' | 'attribution_watermark';
  commercialUseStatus: CommercialUseStatus;
  commercialUseDetails: string;
  attributionRequirements?: string;
  rightsVerificationStatus: 'verified' | 'unverified' | 'flagged';
  termsUrl: string;
  copyrightNotice?: string;
}

export interface PublishingRightsSummary {
  eligibleForCommercialUse: boolean;
  totalAssets: number;
  verifiedCommercialCount: number;
  attributionRequiredCount: number;
  restrictedCount: number;
  needsReviewCount: number;
  watermarkFreeCount: number;
  attributions: string[];
  warnings: string[];
  recommendation: string;
  verifiedAt: string;
}

export class AssetRightsService {
  /**
   * Constructs an asset provenance and rights record from generation data.
   */
  public static createProvenanceRecord(params: {
    assetId: string;
    assetType: AssetType;
    name?: string;
    provider: string;
    model?: string;
    originalPrompt: string;
    generatedPrompt?: string;
    referenceImageIds?: string[];
    dimensions: { width: number; height: number };
    stylePreset?: string;
    aspectRatio?: string;
    customCommercialStatus?: CommercialUseStatus;
    customAttribution?: string;
  }): AssetProvenanceRecord {
    const caps = ProviderCapabilitiesService.getCapability(params.provider);
    const commercialStatus = params.customCommercialStatus || caps.commercialUseStatus;
    const watermarkStatus = caps.watermarkFree ? 'watermark_free' : 'watermarked_by_provider';
    const rightsVerification = (commercialStatus === 'verified_commercial') ? 'verified' : 'unverified';

    return {
      assetId: params.assetId,
      assetType: params.assetType,
      name: params.name,
      provider: params.provider,
      model: params.model || caps.defaultModel,
      generatedAt: new Date().toISOString(),
      originalPrompt: params.originalPrompt,
      generatedPrompt: params.generatedPrompt,
      referenceImageIds: params.referenceImageIds || [],
      originalDimensions: params.dimensions,
      processedDimensions: params.dimensions,
      stylePreset: params.stylePreset || 'storybook_illustrated',
      aspectRatio: params.aspectRatio || '16:9',
      watermarkStatus,
      commercialUseStatus: commercialStatus,
      commercialUseDetails: caps.commercialUseDetails,
      attributionRequirements: params.customAttribution || caps.attributionRequirements,
      rightsVerificationStatus: rightsVerification,
      termsUrl: caps.termsUrl,
      copyrightNotice: 'Output generated using AI assistance. Verify commercial publishing rights and applicable jurisdiction rules.',
    };
  }

  /**
   * Generates a pre-publishing rights audit for all assets within a story/video project.
   */
  public static generatePublishingRightsSummary(
    assets: AssetProvenanceRecord[]
  ): PublishingRightsSummary {
    const totalAssets = assets.length;
    let verifiedCommercialCount = 0;
    let attributionRequiredCount = 0;
    let restrictedCount = 0;
    let needsReviewCount = 0;
    let watermarkFreeCount = 0;
    const attributions: string[] = [];
    const warnings: string[] = [];

    for (const a of assets) {
      if (a.watermarkStatus === 'watermark_free') {
        watermarkFreeCount++;
      }
      if (a.commercialUseStatus === 'verified_commercial') {
        verifiedCommercialCount++;
      } else if (a.commercialUseStatus === 'attribution_required') {
        attributionRequiredCount++;
        if (a.attributionRequirements) {
          attributions.push(`${a.name || a.assetId}: ${a.attributionRequirements}`);
        }
      } else if (a.commercialUseStatus === 'restricted') {
        restrictedCount++;
        warnings.push(`Asset ${a.name || a.assetId} (${a.provider}) is flagged as restricted for commercial use.`);
      } else {
        needsReviewCount++;
        warnings.push(`Asset ${a.name || a.assetId} (${a.provider}) requires license verification.`);
      }
    }

    const eligibleForCommercialUse = restrictedCount === 0 && needsReviewCount === 0;
    let recommendation = 'All media assets have verified commercial licenses under recorded provider terms.';
    if (!eligibleForCommercialUse) {
      recommendation = 'Some media assets require commercial rights review or replacement prior to monetization.';
    } else if (attributionRequiredCount > 0) {
      recommendation = 'Commercial use is permitted provided required attributions are displayed in the video credits or description.';
    }

    return {
      eligibleForCommercialUse,
      totalAssets,
      verifiedCommercialCount,
      attributionRequiredCount,
      restrictedCount,
      needsReviewCount,
      watermarkFreeCount,
      attributions: Array.from(new Set(attributions)),
      warnings,
      recommendation,
      verifiedAt: new Date().toISOString(),
    };
  }
}
