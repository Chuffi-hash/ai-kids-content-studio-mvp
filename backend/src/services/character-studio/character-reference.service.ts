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
    };

    // If marked as master reference, demote any previous master flag
    if (asset.isMasterReference) {
      for (const a of existingAssets) {
        a.isMasterReference = false;
      }
    }

    // Prepend or add asset
    existingAssets.unshift(fullAsset);

    // Prepare updated canonicalAppearance object
    const existingRefs = canonical.references || {};
    const updatedRefs = {
      ...existingRefs,
    };

    if (asset.isMasterReference || asset.assetType === 'main') {
      updatedRefs.mainUrl = asset.url;
    } else if (asset.assetType === 'turnaround') {
      updatedRefs.turnaroundUrl = asset.url;
    } else if (asset.assetType === 'expression') {
      updatedRefs.expressionUrl = asset.url;
    } else if (asset.assetType === 'pose') {
      updatedRefs.poseUrl = asset.url;
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

    const updatedCanonical = {
      ...canonical,
      assets: remaining,
    };

    const updatePayload: any = {
      canonicalAppearance: updatedCanonical,
    };

    // If master reference was forcefully deleted, clear referenceImageUrl or fallback to remaining asset
    if (target.isMasterReference) {
      const nextMaster = remaining[0];
      if (nextMaster) {
        nextMaster.isMasterReference = true;
        updatePayload.referenceImageUrl = nextMaster.url;
        updatePayload.referenceImagePrompt = nextMaster.prompt;
      } else {
        updatePayload.referenceImageUrl = null;
        updatePayload.referenceImagePrompt = null;
      }
    }

    const updated = await updateCharacter(characterId, updatePayload);

    return {
      character: updated,
      deletedAssetId: assetId,
    };
  }
}
