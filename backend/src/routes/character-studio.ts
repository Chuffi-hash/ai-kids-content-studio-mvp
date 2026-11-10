import { Router } from 'express';
import { randomUUID } from 'crypto';
import { CharacterGenerationService } from '../services/character-studio/character-generation.service.js';
import {
  CharacterPromptBuilderService,
  DIRECTION_DESCRIPTIONS,
  ACTION_DESCRIPTIONS,
  EXPRESSION_DESCRIPTIONS,
  FRAMING_DESCRIPTIONS,
  ART_STYLE_DESCRIPTIONS,
  DEFAULT_NEGATIVE_PROMPT,
} from '../services/character-studio/character-prompt-builder.service.js';
import { CharacterReferenceService } from '../services/character-studio/character-reference.service.js';
import {
  CharacterGenerationPrompt,
  GenerationCategory,
} from '../services/character-studio/character-studio.types.js';
import {
  createCharacter,
  getCharacterById,
  updateCharacter,
} from '../services/database/database.service.js';

export const characterStudioRouter = Router();
const characterGenService = new CharacterGenerationService();
const promptBuilderService = new CharacterPromptBuilderService();
const referenceService = new CharacterReferenceService();

// GET capabilities & presets
characterStudioRouter.get('/capabilities', (_req, res) => {
  res.json({
    providers: [
      characterGenService.getProviderCapabilities('gemini'),
      characterGenService.getProviderCapabilities('pollinations'),
    ],
    directions: Object.keys(DIRECTION_DESCRIPTIONS).map((key) => ({
      key,
      label: key.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
      description: DIRECTION_DESCRIPTIONS[key as keyof typeof DIRECTION_DESCRIPTIONS],
    })),
    actions: Object.keys(ACTION_DESCRIPTIONS).map((key) => ({
      key,
      label: key.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
      description: ACTION_DESCRIPTIONS[key as keyof typeof ACTION_DESCRIPTIONS],
    })),
    expressions: Object.keys(EXPRESSION_DESCRIPTIONS).map((key) => ({
      key,
      label: key.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
      description: EXPRESSION_DESCRIPTIONS[key as keyof typeof EXPRESSION_DESCRIPTIONS],
    })),
    framings: Object.keys(FRAMING_DESCRIPTIONS).map((key) => ({
      key,
      label: key.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
      description: FRAMING_DESCRIPTIONS[key as keyof typeof FRAMING_DESCRIPTIONS],
    })),
    styles: Object.keys(ART_STYLE_DESCRIPTIONS).map((key) => ({
      key,
      label: key.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
      description: ART_STYLE_DESCRIPTIONS[key],
    })),
    defaultNegativePrompt: DEFAULT_NEGATIVE_PROMPT,
  });
});

// GET prompt templates and presets (backward compatibility)
characterStudioRouter.get('/templates', (_req, res) => {
  res.json({
    styles: ART_STYLE_DESCRIPTIONS,
    directions: DIRECTION_DESCRIPTIONS,
    actions: ACTION_DESCRIPTIONS,
    expressions: EXPRESSION_DESCRIPTIONS,
    framings: FRAMING_DESCRIPTIONS,
    defaultNegativePrompt: DEFAULT_NEGATIVE_PROMPT,
  });
});

// POST build prompt from structured inputs
characterStudioRouter.post('/build-prompt', (req, res) => {
  try {
    const promptInput: CharacterGenerationPrompt = req.body;
    if (!promptInput.characterName) {
      return res.status(400).json({ message: 'characterName is required' });
    }
    const built = promptBuilderService.buildPrompt(promptInput);
    res.json({
      success: true,
      ...built,
    });
  } catch (err: any) {
    console.error('[CharacterStudio] build-prompt failed:', err);
    res.status(500).json({ message: err.message || 'Failed to construct character prompt' });
  }
});

// POST generate character asset (Strict provider execution, NO silent fallback)
characterStudioRouter.post('/generate', async (req, res) => {
  try {
    const {
      characterId,
      promptData,
      character,
      type,
      provider,
      width,
      height,
      aspectRatio,
    } = req.body;

    let normalizedPromptData: CharacterGenerationPrompt;

    if (promptData) {
      normalizedPromptData = promptData;
    } else if (character && character.name) {
      // Backward compatibility with older payload shape
      normalizedPromptData = {
        characterId,
        characterName: character.name,
        characterDescription: character.visualDescription || '',
        species: character.species,
        age: character.age,
        gender: character.gender,
        clothingInstructions: character.clothing,
        artStyle: character.artStyle || '2d_cartoon',
        generationType: (type as GenerationCategory) || 'main',
      };
    } else {
      return res.status(400).json({
        message: 'Valid promptData or character object with name is required',
      });
    }

    const result = await characterGenService.generateCharacterAsset({
      characterId,
      promptData: normalizedPromptData,
      provider: provider === 'gemini' ? 'gemini' : 'pollinations',
      width,
      height,
      aspectRatio,
    });

    res.json({
      success: true,
      result,
    });
  } catch (err: any) {
    console.error('[CharacterStudio] Generation failed:', err);
    res.status(500).json({ message: err.message || 'Character asset generation failed' });
  }
});

// POST create character directly from studio
characterStudioRouter.post('/characters', async (req, res) => {
  try {
    const {
      name,
      species,
      personality,
      visualDescription,
      distinctiveFeatures,
      clothing,
      artStyle,
      masterReferenceUrl,
      masterPrompt,
    } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({ message: 'Character name is required' });
    }

    const id = `char-${Date.now()}-${randomUUID().slice(0, 6)}`;
    const trimmedName = name.trim();

    const initialCanonical: any = {
      clothing: clothing || '',
      artStyle: artStyle || '2d_cartoon',
      references: {
        mainUrl: masterReferenceUrl || null,
      },
      assets: masterReferenceUrl
        ? [
            {
              id: `asset-${Date.now()}-${randomUUID().slice(0, 6)}`,
              characterId: id,
              assetType: 'main',
              prompt: masterPrompt || `Initial canonical design for ${trimmedName}`,
              provider: 'studio',
              model: 'canonical_master',
              url: masterReferenceUrl,
              isMasterReference: true,
              createdAt: new Date().toISOString(),
            },
          ]
        : [],
    };

    const newChar = await createCharacter({
      id,
      name: trimmedName,
      species: species || 'Human',
      personality: personality || 'Friendly and adventurous',
      visualDescription: visualDescription || `${trimmedName} the character`,
      distinctiveFeatures: distinctiveFeatures || clothing || '',
      canonicalAppearance: initialCanonical,
      referenceImageUrl: masterReferenceUrl || null,
      referenceImagePrompt: masterPrompt || null,
    });

    res.status(201).json({
      success: true,
      character: newChar,
    });
  } catch (err: any) {
    console.error('[CharacterStudio] Character creation failed:', err);
    res.status(500).json({ message: err.message || 'Failed to create character' });
  }
});

// GET all asset variations for a character
characterStudioRouter.get('/characters/:id/assets', async (req, res) => {
  try {
    const { id } = req.params;
    const assets = await referenceService.getCharacterAssets(id);
    res.json({
      success: true,
      assets,
    });
  } catch (err: any) {
    console.error('[CharacterStudio] Fetch assets failed:', err);
    res.status(404).json({ message: err.message || 'Character not found' });
  }
});

// POST save generated asset to character
characterStudioRouter.post('/characters/:id/assets', async (req, res) => {
  try {
    const { id } = req.params;
    const asset = req.body;

    if (!asset || !asset.url) {
      return res.status(400).json({ message: 'Valid asset with url is required' });
    }

    const assetId = asset.id || `asset-${Date.now()}-${randomUUID().slice(0, 6)}`;
    const saved = await referenceService.saveAssetToCharacter(id, {
      ...asset,
      id: assetId,
      createdAt: asset.createdAt || new Date().toISOString(),
    });

    res.json({
      success: true,
      character: saved.character,
      asset: saved.asset,
    });
  } catch (err: any) {
    console.error('[CharacterStudio] Save asset failed:', err);
    res.status(500).json({ message: err.message || 'Failed to save character asset' });
  }
});

// PUT set master reference image
characterStudioRouter.put('/characters/:id/master-reference', async (req, res) => {
  try {
    const { id } = req.params;
    const { assetId } = req.body;

    if (!assetId) {
      return res.status(400).json({ message: 'assetId is required' });
    }

    const result = await referenceService.setMasterReference(id, assetId);
    res.json({
      success: true,
      character: result.character,
      masterAsset: result.masterAsset,
    });
  } catch (err: any) {
    console.error('[CharacterStudio] Set master reference failed:', err);
    res.status(500).json({ message: err.message || 'Failed to update master reference' });
  }
});

// DELETE individual asset variation
characterStudioRouter.delete('/characters/:id/assets/:assetId', async (req, res) => {
  try {
    const { id, assetId } = req.params;
    const force = req.query.force === 'true';

    const result = await referenceService.deleteAsset(id, assetId, force);
    res.json({
      success: true,
      deletedAssetId: result.deletedAssetId,
      character: result.character,
    });
  } catch (err: any) {
    console.error('[CharacterStudio] Delete asset failed:', err);
    res.status(400).json({ message: err.message || 'Failed to delete asset' });
  }
});

// POST import from Google Flow
characterStudioRouter.post('/import-flow', async (req, res) => {
  try {
    const { characterId, characterName, assetType, imageBufferOrBase64, filename, notes } = req.body;

    if (!characterName || !assetType || !imageBufferOrBase64) {
      return res.status(400).json({ message: 'characterName, assetType, and imageBufferOrBase64 are required' });
    }

    const result = await characterGenService.importFromGoogleFlow({
      characterId,
      characterName,
      assetType,
      imageBufferOrBase64,
      filename,
      notes,
    });

    res.json({
      success: true,
      result,
    });
  } catch (err: any) {
    console.error('[CharacterStudio] Google Flow import failed:', err);
    res.status(500).json({ message: err.message || 'Google Flow asset import failed' });
  }
});

// POST upload character asset
characterStudioRouter.post('/upload', async (req, res) => {
  try {
    const { characterId, assetType, base64Data, filename } = req.body;

    if (!characterId || !assetType || !base64Data) {
      return res.status(400).json({ message: 'characterId, assetType, and base64Data are required' });
    }

    const result = await characterGenService.uploadCharacterAsset({
      characterId,
      assetType,
      base64Data,
      filename,
    });

    res.json({
      success: true,
      result,
    });
  } catch (err: any) {
    console.error('[CharacterStudio] Upload failed:', err);
    res.status(500).json({ message: err.message || 'Upload failed' });
  }
});

// POST sync references to character record (backward compatibility)
characterStudioRouter.post('/sync-to-character/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { references, canonicalAppearance } = req.body;

    let character: any;
    try {
      character = await getCharacterById(id);
    } catch {
      character = null;
    }

    if (!character) {
      return res.status(404).json({ message: 'Character not found' });
    }

    const existingCanonical =
      typeof character.canonicalAppearance === 'object' && character.canonicalAppearance !== null
        ? character.canonicalAppearance
        : {};

    const updatedCanonical = {
      ...existingCanonical,
      ...(canonicalAppearance || {}),
      references: {
        ...(existingCanonical.references || {}),
        ...(references || {}),
      },
    };

    const updated = await updateCharacter(id, {
      canonicalAppearance: updatedCanonical,
      referenceImageUrl: references?.mainUrl || character.referenceImageUrl,
    });

    res.json({
      success: true,
      character: updated,
    });
  } catch (err: any) {
    console.error('[CharacterStudio] Sync failed:', err);
    res.status(500).json({ message: err.message || 'Failed to sync character references' });
  }
});
