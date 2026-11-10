import { Router } from 'express';
import { CharacterGenerationService } from '../services/character-studio/character-generation.service.js';
import {
  buildCharacterReferencePrompt,
  buildCharacterTurnaroundPrompt,
  buildCharacterExpressionPrompt,
  buildCharacterPosePrompt,
  PROMPT_STYLE_MODIFIERS,
} from '../services/character-studio/prompt-templates.js';
import {
  getCharacterById,
  updateCharacter,
} from '../services/database/database.service.js';

export const characterStudioRouter = Router();
const characterGenService = new CharacterGenerationService();

// GET prompt templates and presets
characterStudioRouter.get('/templates', (_req, res) => {
  res.json({
    styles: PROMPT_STYLE_MODIFIERS,
    samples: {
      reference: buildCharacterReferencePrompt({
        name: 'Milo',
        age: '8-10',
        species: 'Human',
        visualDescription: 'short wavy dark brown hair, big expressive brown eyes, friendly smile',
        clothing: 'yellow hoodie, blue shorts, white sneakers, blue backpack',
        artStyle: '2d_cartoon',
        transparentBackground: true,
      }),
      turnaround: buildCharacterTurnaroundPrompt({
        name: 'Milo',
        visualDescription: 'short wavy dark brown hair, yellow hoodie',
        artStyle: '2d_cartoon',
      }),
      expression: buildCharacterExpressionPrompt({
        name: 'Milo',
        visualDescription: 'short wavy dark brown hair, yellow hoodie',
        artStyle: '2d_cartoon',
      }),
      pose: buildCharacterPosePrompt({
        name: 'Milo',
        visualDescription: 'short wavy dark brown hair, yellow hoodie',
        artStyle: '2d_cartoon',
      }),
    },
  });
});

// POST generate character asset
characterStudioRouter.post('/generate', async (req, res) => {
  try {
    const { characterId, type, character, provider, width, height } = req.body;

    if (!type || !character || !character.name) {
      return res.status(400).json({ message: 'type and character.name are required' });
    }

    const result = await characterGenService.generateCharacterAsset({
      characterId,
      type,
      character,
      provider: provider || 'pollinations',
      width,
      height,
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

// POST sync references to character record
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

    const existingCanonical = typeof character.canonicalAppearance === 'object' && character.canonicalAppearance !== null
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
