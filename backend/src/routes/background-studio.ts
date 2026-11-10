import { Router } from 'express';
import { BackgroundStudioService } from '../services/background-studio/background-studio.service.js';
import {
  buildSceneBackgroundPrompt,
  PROMPT_STYLE_MODIFIERS,
} from '../services/character-studio/prompt-templates.js';

export const backgroundStudioRouter = Router();
const backgroundStudioService = new BackgroundStudioService();

// GET all reusable background assets
backgroundStudioRouter.get('/', async (_req, res) => {
  try {
    const backgrounds = await backgroundStudioService.getAllBackgrounds();
    res.json(backgrounds);
  } catch (err: any) {
    console.error('[BackgroundStudio] Fetch failed:', err);
    res.status(500).json({ message: 'Failed to fetch backgrounds' });
  }
});

// GET prompt templates
backgroundStudioRouter.get('/templates', (_req, res) => {
  res.json({
    styles: PROMPT_STYLE_MODIFIERS,
    environmentPresets: [
      { id: 'forest', name: 'Lush Storybook Forest', description: 'a vibrant sunny forest path with giant ancient trees, blooming wildflowers, mossy rocks, and soft sunbeams' },
      { id: 'village', name: 'Cheerful Storybook Village', description: 'a quaint friendly village square with colorful stone houses, cobblestone paths, and flower boxes' },
      { id: 'cottage', name: 'Cozy Cottage Room', description: 'a warm cozy cottage room with a stone fireplace, bookshelf, wooden floor, and sunlit window' },
      { id: 'meadow', name: 'Sunny Rolling Meadow', description: 'rolling bright green hills under a clear blue sky with fluffy white clouds and colorful butterflies' },
      { id: 'castle', name: 'Fairytale Kingdom Castle', description: 'a magical castle courtyard with tall banners, marble archways, and distant mountains' },
      { id: 'ocean', name: 'Gentle Sandy Beach', description: 'a sparkling turquoise ocean beach with golden sand, seashells, and palm trees' },
      { id: 'mountains', name: 'Snowy Mountain Valley', description: 'majestic snow-capped mountain peaks rising over a lush alpine valley with a clear stream' },
      { id: 'space', name: 'Playful Space Orbit', description: 'a colorful playful space background with friendly glowing stars, gentle nebulae, and soft planets' },
    ],
    samplePrompt: buildSceneBackgroundPrompt({
      environmentType: 'lush green forest',
      details: 'a dirt path through large trees, flowers, sunlight, and a clear sky',
      artStyle: 'storybook_illustrated',
    }),
  });
});

// POST generate background
backgroundStudioRouter.post('/generate', async (req, res) => {
  try {
    const { name, environmentType, details, mood, artStyle, aspectRatio, provider } = req.body;

    if (!environmentType) {
      return res.status(400).json({ message: 'environmentType is required' });
    }

    const asset = await backgroundStudioService.generateBackground({
      name,
      environmentType,
      details,
      mood,
      artStyle,
      aspectRatio,
      provider,
    });

    res.json({
      success: true,
      asset,
    });
  } catch (err: any) {
    console.error('[BackgroundStudio] Generation failed:', err);
    res.status(500).json({ message: err.message || 'Background generation failed' });
  }
});

// POST import from Google Flow
backgroundStudioRouter.post('/import-flow', async (req, res) => {
  try {
    const { name, environmentType, imageBufferOrBase64, filename, notes, aspectRatio } = req.body;

    if (!imageBufferOrBase64) {
      return res.status(400).json({ message: 'imageBufferOrBase64 is required' });
    }

    const asset = await backgroundStudioService.importFromGoogleFlow({
      name,
      environmentType,
      imageBufferOrBase64,
      filename,
      notes,
      aspectRatio,
    });

    res.json({
      success: true,
      asset,
    });
  } catch (err: any) {
    console.error('[BackgroundStudio] Google Flow import failed:', err);
    res.status(500).json({ message: err.message || 'Background import failed' });
  }
});

// POST upload background
backgroundStudioRouter.post('/upload', async (req, res) => {
  try {
    const { name, environmentType, base64Data, filename, aspectRatio } = req.body;

    if (!base64Data) {
      return res.status(400).json({ message: 'base64Data is required' });
    }

    const asset = await backgroundStudioService.uploadBackground({
      name,
      environmentType,
      base64Data,
      filename,
      aspectRatio,
    });

    res.json({
      success: true,
      asset,
    });
  } catch (err: any) {
    console.error('[BackgroundStudio] Upload failed:', err);
    res.status(500).json({ message: err.message || 'Background upload failed' });
  }
});
