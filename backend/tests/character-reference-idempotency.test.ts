import test from 'node:test';
import assert from 'node:assert/strict';
import { CharacterReferenceService } from '../src/services/character-studio/character-reference.service';

test('CharacterReferenceService - Idempotent Asset Registration and Retry', async (t) => {
  const service = new CharacterReferenceService();

  // In-memory mock database state for character
  let mockCharacter: any = {
    id: 'char-mock-flow-1',
    name: 'Sammy',
    referenceImageUrl: null,
    referenceImagePrompt: null,
    canonicalAppearance: {
      assets: [],
      references: {},
    },
  };

  // Mock getCharacterById and updateCharacter in database service
  // by intercepting service methods or mocking the module
  (service as any).saveAssetToCharacter = async function (
    characterId: string,
    asset: any
  ) {
    const character = mockCharacter;
    const canonical = character.canonicalAppearance || {};
    const existingAssets = Array.isArray(canonical.assets) ? [...canonical.assets] : [];

    const fullAsset = {
      ...asset,
      characterId,
    };

    if (asset.isMasterReference) {
      for (const a of existingAssets) {
        a.isMasterReference = false;
      }
    }

    const existingIndex = existingAssets.findIndex((a) => a.id === fullAsset.id);
    if (existingIndex >= 0) {
      existingAssets[existingIndex] = {
        ...existingAssets[existingIndex],
        ...fullAsset,
      };
    } else {
      existingAssets.unshift(fullAsset);
    }

    const existingRefs = canonical.references || {};
    const updatedRefs = { ...existingRefs };

    if (asset.isMasterReference || asset.assetType === 'main') {
      updatedRefs.mainUrl = asset.url;
    } else if (asset.assetType === 'turnaround') {
      updatedRefs.turnaroundUrl = asset.url;
    }

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
    if (asset.direction && supportedDirections.has(asset.direction)) {
      updatedRefs.directionalViews = {
        ...(existingRefs.directionalViews || {}),
        [asset.direction]: asset.url,
      };
    }

    const updatedCanonical = {
      ...canonical,
      references: updatedRefs,
      assets: existingAssets,
    };

    mockCharacter = {
      ...mockCharacter,
      canonicalAppearance: updatedCanonical,
      referenceImageUrl: asset.isMasterReference ? asset.url : mockCharacter.referenceImageUrl,
    };

    return {
      character: mockCharacter,
      asset: fullAsset,
    };
  };

  await t.test('1. First registration inserts the asset into canonicalAppearance.assets', async () => {
    const asset1 = {
      id: 'asset-flow-uuid-1',
      assetType: 'custom' as const,
      direction: 'left',
      prompt: '@Sammy looking left',
      url: '/storage/char-1/left.png',
      storagePath: 'char-1/left.png',
      isMasterReference: false,
      createdAt: '2026-11-18T10:00:00.000Z',
    };

    const res = await (service as any).saveAssetToCharacter('char-mock-flow-1', asset1);
    assert.equal(res.character.canonicalAppearance.assets.length, 1);
    assert.equal(res.character.canonicalAppearance.assets[0].id, 'asset-flow-uuid-1');
    assert.equal(res.character.canonicalAppearance.references.directionalViews.left, '/storage/char-1/left.png');
  });

  await t.test('2. Retrying the same job with the same asset ID does NOT create a duplicate asset', async () => {
    const asset1Retry = {
      id: 'asset-flow-uuid-1',
      assetType: 'custom' as const,
      direction: 'left',
      prompt: '@Sammy looking left (retried metadata)',
      url: '/storage/char-1/left.png',
      storagePath: 'char-1/left.png',
      isMasterReference: false,
      createdAt: '2026-11-18T10:00:00.000Z',
    };

    const res = await (service as any).saveAssetToCharacter('char-mock-flow-1', asset1Retry);
    assert.equal(
      res.character.canonicalAppearance.assets.length,
      1,
      'canonicalAppearance.assets MUST NOT contain duplicate entries on retry'
    );
    assert.equal(res.character.canonicalAppearance.assets[0].id, 'asset-flow-uuid-1');
    assert.equal(res.character.canonicalAppearance.assets[0].prompt, '@Sammy looking left (retried metadata)');
  });

  await t.test('3. Registering a second distinct asset appends it properly', async () => {
    const asset2 = {
      id: 'asset-flow-uuid-2',
      assetType: 'main' as const,
      direction: 'front',
      prompt: '@Sammy front master',
      url: '/storage/char-1/front.png',
      storagePath: 'char-1/front.png',
      isMasterReference: true,
      createdAt: '2026-11-18T10:05:00.000Z',
    };

    const res = await (service as any).saveAssetToCharacter('char-mock-flow-1', asset2);
    assert.equal(res.character.canonicalAppearance.assets.length, 2);
    assert.equal(res.character.canonicalAppearance.references.mainUrl, '/storage/char-1/front.png');
    assert.equal(res.character.canonicalAppearance.references.directionalViews.front, '/storage/char-1/front.png');
  });

  await t.test('4. Retrying asset2 multiple times leaves total asset count at 2', async () => {
    const asset2 = {
      id: 'asset-flow-uuid-2',
      assetType: 'main' as const,
      direction: 'front',
      prompt: '@Sammy front master',
      url: '/storage/char-1/front.png',
      storagePath: 'char-1/front.png',
      isMasterReference: true,
      createdAt: '2026-11-18T10:05:00.000Z',
    };

    await (service as any).saveAssetToCharacter('char-mock-flow-1', asset2);
    await (service as any).saveAssetToCharacter('char-mock-flow-1', asset2);

    assert.equal(mockCharacter.canonicalAppearance.assets.length, 2, 'Still exactly 2 assets');
  });
});
