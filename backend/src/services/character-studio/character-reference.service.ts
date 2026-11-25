import {
  CharacterAssetRecord,
  GenerationCategory,
  BodyPoseAction,
} from './character-studio.types.js';
import {
  getCharacterById,
  updateCharacter,
} from '../database/database.service.js';

export type MappedAnimationAction = 'idle' | 'walk' | 'wave' | 'jump' | 'point';

export class CharacterReferenceService {
  /**
   * Maps a generated body pose action to the native vector animation rig action.
   */
  public mapActionToRigAction(action?: string): MappedAnimationAction {
    if (!action) return 'idle';
    const normalized = action.toLowerCase().trim();

    if (normalized.includes('walk') || normalized.includes('run') || normalized.includes('fly') || normalized.includes('fall')) {
      return 'walk';
    }
    if (normalized.includes('wav') || normalized.includes('danc')) {
      return 'wave';
    }
    if (normalized.includes('jump')) {
      return 'jump';
    }
    if (normalized.includes('point')) {
      return 'point';
    }
    return 'idle';
  }

  /**
   * Retrieves all asset variations stored for a character.
   */
  public async getCharacterAssets(characterId: string): Promise<CharacterAssetRecord[]> {
    const character = await getCharacterById(characterId);
    if (!character) {
      throw new Error(`Character ${characterId} not found`);
    }

    const canonical =
      typeof character.canonicalAppearance === 'object' && character.canonicalAppearance !== null
        ? (character.canonicalAppearance as any)
        : {};

    const assets: CharacterAssetRecord[] = Array.isArray(canonical.assets) ? canonical.assets : [];

    // If master reference exists on the character record but not yet in assets array, synthesize it
    if (character.referenceImageUrl && !assets.some((a) => a.url === character.referenceImageUrl)) {
      assets.unshift({
        id: `master-${characterId}`,
        characterId,
        assetType: 'main',
        prompt: character.referenceImagePrompt || 'Master Reference Image',
        provider: 'native',
        model: 'canonical',
        url: character.referenceImageUrl,
        isMasterReference: true,
        createdAt: character.createdAt.toISOString(),
      });
    }

    return assets;
  }

  /**
   * Saves a newly generated asset record against a character.
   */
  public async saveAssetToCharacter(
    characterId: string,
    asset: Omit<CharacterAssetRecord, 'characterId'>
  ): Promise<{ character: any; asset: CharacterAssetRecord }> {
    const character = await getCharacterById(characterId);
    if (!character) {
      throw new Error(`Character ${characterId} not found`);
    }

    const canonical =
      typeof character.canonicalAppearance === 'object' && character.canonicalAppearance !== null
        ? (character.canonicalAppearance as any)
        : {};

    const existingAssets: CharacterAssetRecord[] = Array.isArray(canonical.assets)
      ? [...canonical.assets]
      : [];

    const fullAsset: CharacterAssetRecord = {
      ...asset,
      characterId,
      // Saved files still need visual identity/orientation review unless a
      // separate validator explicitly marked them as validated.
      validationStatus: asset.validationStatus || 'needs_review',
    };

    // If marked as master reference, demote any previous master flag
    if (asset.isMasterReference) {
      for (const a of existingAssets) {
        a.isMasterReference = false;
      }
    }

    // Prepend or update existing asset by ID (idempotent registration)
    const existingIndex = existingAssets.findIndex((a) => a.id === fullAsset.id);
    if (existingIndex >= 0) {
      existingAssets[existingIndex] = {
        ...existingAssets[existingIndex],
        ...fullAsset,
      };
    } else {
      existingAssets.unshift(fullAsset);
    }

    // Prepare updated canonicalAppearance object
    const existingRefs = canonical.references || {};
    const updatedRefs = {
      ...existingRefs,
    };

    const isMasterAsset = Boolean(asset.isMasterReference || asset.assetType === 'main');
    if (isMasterAsset) {
      updatedRefs.mainUrl = asset.url;
    } else if (asset.assetType === 'turnaround') {
      updatedRefs.turnaroundUrl = asset.url;
    } else if (asset.assetType === 'expression') {
      updatedRefs.expressionUrl = asset.url;
    } else if (asset.assetType === 'pose') {
      updatedRefs.poseUrl = asset.url;
    }

    const directionAliases: Record<string, string> = {
      three_quarter_left: 'front-left',
      front_three_quarter_left: 'front-left',
      three_quarter_right: 'front-right',
      front_three_quarter_right: 'front-right',
      left_profile: 'left',
      right_profile: 'right',
      back_three_quarter_left: 'back-left',
      back_three_quarter_right: 'back-right',
      front_view: 'front',
      back_view: 'back',
    };
    const rawDir = String(asset.direction || '').trim().toLowerCase();
    const normalizedDirection = directionAliases[rawDir] || rawDir;
    if (normalizedDirection) {
      fullAsset.direction = normalizedDirection;
    }

    // Keep individually imported Google Flow views discoverable without requiring
    // a full turnaround sheet. Only authored view keys are registered here.
    const supportedDirections = new Set([
      'front',
      'front-left',
      'front-right',
      'left',
      'right',
      'back-left',
      'back-right',
      'back',
    ]);
    if (normalizedDirection && supportedDirections.has(normalizedDirection)) {
      const directionalViews = {
        ...(existingRefs.directionalViews || {}),
      };
      const directionalViewMetadata = {
        ...(existingRefs.directionalViewMetadata || {}),
      };

      if (!isMasterAsset) {
        // Only non-master assets may occupy a directional slot. A canonical
        // front reference is the identity anchor, not a generated turntable view.
        directionalViews[normalizedDirection] = fullAsset.url;
        directionalViewMetadata[normalizedDirection] = {
          assetId: fullAsset.id,
          direction: normalizedDirection,
          url: fullAsset.url,
          jobId: fullAsset.jobId || null,
          sourceCanonicalReferenceId: fullAsset.sourceCanonicalReferenceId || null,
          validationStatus: fullAsset.validationStatus || 'needs_review',
          validationDetails: fullAsset.validationDetails || null,
          updatedAt: fullAsset.createdAt,
        };
      } else {
        // Repair legacy data where a previous master image was accidentally
        // recorded as the directional front view. Preserve a genuine separate
        // front-turnaround asset if one already exists.
        const existingUrl = directionalViews[normalizedDirection];
        const existingMeta = directionalViewMetadata[normalizedDirection] || {};
        const mappedAsset = existingAssets.find(
          (candidate) =>
            candidate.direction === normalizedDirection &&
            ((existingMeta.assetId && candidate.id === existingMeta.assetId) ||
              (existingUrl && candidate.url === existingUrl)),
        );
        if (mappedAsset && (mappedAsset.assetType === 'main' || mappedAsset.isMasterReference)) {
          const replacement = existingAssets.find(
            (candidate) =>
              candidate.direction === normalizedDirection &&
              candidate.url &&
              candidate.assetType !== 'main' &&
              !candidate.isMasterReference,
          );
          if (replacement) {
            directionalViews[normalizedDirection] = replacement.url;
            directionalViewMetadata[normalizedDirection] = {
              assetId: replacement.id,
              direction: normalizedDirection,
              url: replacement.url,
              jobId: replacement.jobId || null,
              sourceCanonicalReferenceId: replacement.sourceCanonicalReferenceId || null,
              validationStatus: replacement.validationStatus || 'needs_review',
              validationDetails: replacement.validationDetails || null,
              updatedAt: replacement.createdAt,
            };
          } else {
            delete directionalViews[normalizedDirection];
            delete directionalViewMetadata[normalizedDirection];
          }
        }
      }

      updatedRefs.directionalViews = directionalViews;
      updatedRefs.directionalViewMetadata = directionalViewMetadata;
    }

    const updatedCanonical = {
      ...canonical,
      references: updatedRefs,
      assets: existingAssets,
    };

    const updatePayload: any = {
      canonicalAppearance: updatedCanonical,
    };

    if (asset.isMasterReference || (!character.referenceImageUrl && asset.assetType === 'main')) {
      updatePayload.referenceImageUrl = asset.url;
      updatePayload.referenceImagePrompt = asset.prompt;
    }

    const updatedCharacter = await updateCharacter(characterId, updatePayload);

    return {
      character: updatedCharacter,
      asset: fullAsset,
    };
  }

  /**
   * Sets or replaces the master reference image for a character.
   */
  public async setMasterReference(
    characterId: string,
    assetId: string
  ): Promise<{ character: any; masterAsset: CharacterAssetRecord }> {
    const character = await getCharacterById(characterId);
    if (!character) {
      throw new Error(`Character ${characterId} not found`);
    }

    const canonical =
      typeof character.canonicalAppearance === 'object' && character.canonicalAppearance !== null
        ? (character.canonicalAppearance as any)
        : {};

    const assets: CharacterAssetRecord[] = Array.isArray(canonical.assets)
      ? [...canonical.assets]
      : [];

    const target = assets.find((a) => a.id === assetId);
    if (!target) {
      throw new Error(`Asset ${assetId} not found on character ${characterId}`);
    }

    // Demote all other assets and mark target as master
    for (const a of assets) {
      a.isMasterReference = a.id === assetId;
    }

    const updatedCanonical = {
      ...canonical,
      references: {
        ...(canonical.references || {}),
        mainUrl: target.url,
      },
      assets,
    };

    const updated = await updateCharacter(characterId, {
      referenceImageUrl: target.url,
      referenceImagePrompt: target.prompt,
      canonicalAppearance: updatedCanonical,
    });

    return {
      character: updated,
      masterAsset: target,
    };
  }

  /**
   * Safely deletes an individual asset variation with protection for the master reference.
   */
  public async deleteAsset(
    characterId: string,
    assetId: string,
    force: boolean = false
  ): Promise<{ character: any; deletedAssetId: string }> {
    const character = await getCharacterById(characterId);
    if (!character) {
      throw new Error(`Character ${characterId} not found`);
    }

    const canonical =
      typeof character.canonicalAppearance === 'object' && character.canonicalAppearance !== null
        ? (character.canonicalAppearance as any)
        : {};

    const assets: CharacterAssetRecord[] = Array.isArray(canonical.assets)
      ? [...canonical.assets]
      : [];

    const target = assets.find((a) => a.id === assetId);
    if (!target) {
      throw new Error(`Asset ${assetId} not found on character ${characterId}`);
    }

    if (target.isMasterReference && !force) {
      throw new Error(
        `Asset ${assetId} is currently the master visual reference. Reassign another master reference first or set force=true.`
      );
    }

    const remaining = assets.filter((a) => a.id !== assetId);

    const existingRefs = canonical.references || {};
    const updatedDirectionalViews = { ...(existingRefs.directionalViews || {}) };
    const updatedDirectionalMeta = { ...(existingRefs.directionalViewMetadata || {}) };

    // Remove a directional pointer only when it still points to the deleted file.
    // If another asset for the same direction remains, use the newest remaining one.
    if (target.direction && updatedDirectionalViews[target.direction] === target.url) {
      const replacement = remaining.find((asset) => asset.direction === target.direction);
      if (replacement) {
        updatedDirectionalViews[target.direction] = replacement.url;
        updatedDirectionalMeta[target.direction] = {
          assetId: replacement.id,
          direction: target.direction,
          url: replacement.url,
          jobId: replacement.jobId || null,
          sourceCanonicalReferenceId: replacement.sourceCanonicalReferenceId || null,
          validationStatus: replacement.validationStatus || 'needs_review',
          validationDetails: replacement.validationDetails || null,
          updatedAt: replacement.createdAt,
        };
      } else {
        delete updatedDirectionalViews[target.direction];
        delete updatedDirectionalMeta[target.direction];
      }
    }

    const updatedRefs: Record<string, any> = {
      ...existingRefs,
      directionalViews: updatedDirectionalViews,
      directionalViewMetadata: updatedDirectionalMeta,
    };

    const updatePayload: any = {};

    // If master reference was forcefully deleted, clear referenceImageUrl & mainUrl or fallback to remaining asset
    if (target.isMasterReference) {
      const nextMaster = remaining[0];
      if (nextMaster) {
        nextMaster.isMasterReference = true;
        updatedRefs.mainUrl = nextMaster.url;
        updatePayload.referenceImageUrl = nextMaster.url;
        updatePayload.referenceImagePrompt = nextMaster.prompt;
      } else {
        delete updatedRefs.mainUrl;
        updatePayload.referenceImageUrl = null;
        updatePayload.referenceImagePrompt = null;
      }
    }

    const updatedCanonical = {
      ...canonical,
      references: updatedRefs,
      assets: remaining,
    };
    updatePayload.canonicalAppearance = updatedCanonical;

    const updated = await updateCharacter(characterId, updatePayload);

    return {
      character: updated,
      deletedAssetId: assetId,
    };
  }
}
