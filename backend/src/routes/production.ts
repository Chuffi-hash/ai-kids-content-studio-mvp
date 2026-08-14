import { Router } from 'express';
import { ImageGenerationService } from '../services/production/image-generation/image-generation.service.js';
import { VideoGenerationService } from '../services/production/video-generation/video-generation.service.js';
import { getImageGenerationProvider, getVideoGenerationProvider } from '../services/production/production-provider.factory.js';
import { CharacterService } from '../services/production/characters/character.service.js';
import { CharacterPromptService } from '../services/production/characters/character-prompt.service.js';
import { LocalStorageService } from '../services/storage/local-storage.service.js';
import { createScene, createImage, createStory, getSceneBySceneId } from '../services/database/database.service.js';
import { randomUUID } from 'crypto';

export const productionRouter = Router();

const storageService = new LocalStorageService();
const imageGenerationService = new ImageGenerationService(getImageGenerationProvider(), storageService);
const videoGenerationService = new VideoGenerationService(getVideoGenerationProvider());
const characterService = new CharacterService();
const characterPromptService = new CharacterPromptService(characterService);

// Simple in-memory storage for scene image URLs
const sceneImageStorage = new Map<string, string>();

productionRouter.post('/scenes/:sceneId/image', async (req, res) => {
  const { sceneId } = req.params;
  const { sceneNumber, sceneDescription, sceneTitle, sceneNarration, characters = [], artStyle, camera, lighting, composition, storyId, storyTitle, storyLogline, storyLesson } = req.body;

  const provider = process.env.IMAGE_PROVIDER || 'mock';
  const isDevelopment = process.env.NODE_ENV !== 'production';

  console.log(`[Production] Starting image generation for scene ${sceneId}, provider: ${provider}`);

  try {
    if (!sceneNumber || !sceneDescription || !sceneTitle) {
      console.error(`[Production] Missing required fields for scene ${sceneId}`);
      return res.status(400).json({
        success: false,
        sceneId,
        image: {
          status: 'failed',
          error: 'sceneNumber, sceneDescription, and sceneTitle are required',
        },
      });
    }

    // Build prompt using CharacterPromptService
    const scene = {
      sceneNumber,
      description: sceneDescription,
      characters,
    };

    const prompt = characterPromptService.generateScenePrompt({
      scene,
      artStyle,
      camera,
      lighting,
      composition,
    });

    console.log(`[Production] Generated prompt for scene ${sceneId}: "${prompt.substring(0, 100)}..."`);
    console.log(`[Production] Calling ImageGenerationService with provider: ${provider}`);

    const result = await imageGenerationService.generateSceneImage({
      prompt,
      width: 1024,
      height: 1024,
    });

    // Create or update story record in database if provided
    if (storyId && storyTitle && storyLogline && storyLesson) {
      createStory({
        id: randomUUID(),
        storyId,
        title: storyTitle,
        logline: storyLogline,
        lesson: storyLesson,
      });
    }

    // Create or update scene record in database
    const existingScene = getSceneBySceneId(sceneId);
    if (!existingScene) {
      createScene({
        id: randomUUID(),
        sceneId,
        storyId: storyId || 'default-story',
        title: sceneTitle,
        number: sceneNumber,
        narration: sceneNarration,
      });
    }

    // Create image record in database
    const imageId = randomUUID();
    const storageKey = result.url.replace('/storage/', '');
    const model = process.env.HF_IMAGE_MODEL || 'black-forest-labs/FLUX.1-schnell';

    createImage({
      id: imageId,
      sceneId,
      provider,
      model,
      prompt,
      storageKey,
      imageUrl: result.url,
      width: 1024,
      height: 1024,
      status: 'completed',
    });

    console.log(`[Production] Image generation completed for scene ${sceneId}, URL: ${result.url}`);
    console.log(`[Production] Image metadata saved to database with ID: ${imageId}`);

    return res.json({
      success: true,
      sceneId,
      image: {
        id: imageId,
        sceneId,
        provider,
        model,
        prompt,
        storageKey,
        imageUrl: result.url,
        width: 1024,
        height: 1024,
        status: 'completed',
      },
    });
  } catch (error) {
    console.error(`[Production] Image generation failed for scene ${sceneId}`);
    console.error(`[Production] sceneId=${sceneId}`);
    console.error(`[Production] provider=${provider}`);

    let errorMessage = 'Failed to generate image';

    if (error instanceof Error) {
      console.error(`[Production] Error name: ${error.name}`);
      console.error(`[Production] Error message: ${error.message}`);

      // In development mode, return the actual error message for debugging
      if (isDevelopment) {
        errorMessage = error.message;
      }
    } else {
      console.error(`[Production] Unknown error type:`, error);
    }

    return res.status(500).json({
      success: false,
      sceneId,
      image: {
        status: 'failed',
        error: errorMessage,
      },
    });
  }
});

productionRouter.post('/scenes/:sceneId/video', async (req, res) => {
  try {
    const { sceneId } = req.params;
    const { imageUrl } = req.body;

    if (!imageUrl) {
      return res.status(400).json({
        message: 'imageUrl is required',
      });
    }

    const result = await videoGenerationService.generateSceneVideo({
      imageUrl,
      duration: 5,
    });

    return res.json({
      success: true,
      sceneId,
      video: {
        status: 'completed',
        url: result.url,
      },
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({
      message: 'Failed to generate video',
    });
  }
});
