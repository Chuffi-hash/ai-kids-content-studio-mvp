import { Router } from 'express';
import { ImageGenerationService } from '../services/production/image-generation/image-generation.service.js';
import { VideoGenerationService } from '../services/production/video-generation/video-generation.service.js';
import { getImageGenerationProvider, getVideoGenerationProvider } from '../services/production/production-provider.factory.js';
import { CharacterService } from '../services/production/characters/character.service.js';
import { CharacterPromptService } from '../services/production/characters/character-prompt.service.js';
import { LocalStorageService } from '../services/storage/local-storage.service.js';
import { createScene, createImage, createStory, getSceneBySceneId, updateScene, createSceneVersion, getImagesBySceneId, getStoryByStoryId, getScenesByStoryId } from '../services/database/database.service.js';
import { VideoAssemblyService } from '../services/video-assembly/video-assembly.service.js';
import { AudioGenerationService } from '../services/audio-generation/audio-generation.service.js';
import { RemotionManifestAdapter } from '../services/video-assembly/remotion-manifest.adapter.js';
import { randomUUID } from 'crypto';

export const productionRouter = Router();

const storageService = new LocalStorageService();
const imageGenerationService = new ImageGenerationService(getImageGenerationProvider(), storageService);
const videoGenerationService = new VideoGenerationService(getVideoGenerationProvider());
const videoAssemblyService = new VideoAssemblyService();
const audioGenerationService = new AudioGenerationService();
const characterService = new CharacterService();
const characterPromptService = new CharacterPromptService(characterService);

// -------------------------------------------------------------
// Image generation route
// -------------------------------------------------------------
productionRouter.post('/scenes/:sceneId/image', async (req, res) => {
  const { sceneId } = req.params;
  const { sceneNumber, sceneDescription, sceneTitle, sceneNarration, characters = [], artStyle, camera, lighting, composition, storyId, storyTitle, storyLogline, storyLesson } = req.body;

  const provider = process.env.IMAGE_PROVIDER || 'pollinations';
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
      height: 576,
    });

    // Create or update story record in database if provided
    if (storyId && storyTitle && storyLogline && storyLesson) {
      await createStory({
        id: randomUUID(),
        storyId,
        title: storyTitle,
        logline: storyLogline,
        lesson: storyLesson,
      });
    }

    // Create or update scene record in database
    const existingScene = await getSceneBySceneId(sceneId);
    if (!existingScene) {
      await createScene({
        id: randomUUID(),
        sceneId,
        storyId: storyId || 'default-story',
        title: sceneTitle,
        number: sceneNumber,
        narration: sceneNarration,
        imageUrl: result.url,
        visualPrompt: prompt,
        generationStatus: 'completed',
      });
    } else {
      await updateScene(sceneId, {
        imageUrl: result.url,
        visualPrompt: prompt,
        generationStatus: 'completed',
      });
    }

    // Create image record in database
    const imageId = randomUUID();
    const storageKey = result.url.replace('/storage/', '');
    const model = process.env.HF_IMAGE_MODEL || 'black-forest-labs/FLUX.1-schnell';

    await createImage({
      id: imageId,
      sceneId,
      provider,
      model,
      prompt,
      storageKey,
      imageUrl: result.url,
      width: 1024,
      height: 576,
      status: 'completed',
    });

    // Record version
    await createSceneVersion({
      id: randomUUID(),
      sceneId,
      prompt,
      imageUrl: result.url,
      cameraDirection: camera,
      narration: sceneNarration,
    });

    console.log(`[Production] Image generation completed for scene ${sceneId}, URL: ${result.url}`);

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
        height: 576,
        status: 'completed',
      },
    });
  } catch (error) {
    console.error(`[Production] Image generation failed for scene ${sceneId}:`, error);

    let errorMessage = 'Failed to generate image';
    if (error instanceof Error) {
      if (isDevelopment) {
        errorMessage = error.message;
      }
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

// -------------------------------------------------------------
// Real Video Clip Generation for a scene (Workflow 1: AI Video, Workflow 2: FFmpeg Motion)
// -------------------------------------------------------------
productionRouter.post('/scenes/:sceneId/video', async (req, res) => {
  try {
    const { sceneId } = req.params;
    let { imageUrl, duration, workflow = 'ffmpeg', prompt } = req.body;

    const scene = await getSceneBySceneId(sceneId);
    if (!scene) {
      return res.status(404).json({ message: `Scene not found: ${sceneId}` });
    }

    // If imageUrl not passed in body, retrieve from scene or image records
    if (!imageUrl) {
      if (scene.imageUrl) {
        imageUrl = scene.imageUrl;
      } else {
        const images = await getImagesBySceneId(scene.sceneId);
        if (images.length > 0 && images[0].imageUrl) {
          imageUrl = images[0].imageUrl;
        }
      }
    }

    // Workflow 2 (FFmpeg Motion) requires an image
    if (workflow === 'ffmpeg' && !imageUrl) {
      return res.status(400).json({
        message: 'No image found for this scene. Generate or assign a scene image first to render a motion clip, or select AI Video.',
        code: 'MISSING_SOURCE_IMAGE',
      });
    }

    // Determine clip duration
    let clipDuration = duration;
    if (!clipDuration || typeof clipDuration !== 'number') {
      if (scene.endMs > scene.startMs) {
        clipDuration = (scene.endMs - scene.startMs) / 1000;
      } else if (scene.estimatedDurationMs) {
        clipDuration = scene.estimatedDurationMs / 1000;
      } else {
        clipDuration = 4;
      }
    }
    clipDuration = Math.max(1.5, Math.min(60, clipDuration));

    console.log(`[Production] Generating scene video clip for ${scene.sceneId} (${workflow}), duration: ${clipDuration}s, image: ${imageUrl || 'none'}`);

    const provider = getVideoGenerationProvider(workflow);
    const service = new VideoGenerationService(provider);

    const result = await service.generateSceneVideo({
      imageUrl,
      prompt: prompt || scene.visualPrompt || scene.title,
      duration: clipDuration,
      audioUrl: scene.audioUrl || undefined,
      cameraDirection: scene.cameraDirection || undefined,
      workflow,
    });

    // Update scene record with generated video URL while strictly preserving the imageUrl
    await updateScene(scene.sceneId, {
      videoUrl: result.url,
      generationStatus: 'completed',
    });

    await createSceneVersion({
      id: randomUUID(),
      sceneId: scene.sceneId,
      videoUrl: result.url,
      imageUrl: scene.imageUrl,
      prompt: scene.visualPrompt,
      narration: scene.narration,
      cameraDirection: scene.cameraDirection,
      durationMs: Math.round(clipDuration * 1000),
    });

    return res.json({
      success: true,
      sceneId: scene.sceneId,
      video: {
        status: 'completed',
        url: result.url,
        duration: result.duration || clipDuration,
        motionType: result.motionType || (workflow === 'ai' ? 'ai-motion' : 'ken-burns'),
        provider: result.provider || workflow,
      },
    });
  } catch (error: any) {
    console.error(`[Production] Video generation failed for scene ${req.params.sceneId}:`, error);
    return res.status(500).json({
      message: error.message || 'Failed to generate video clip',
    });
  }
});

// -------------------------------------------------------------
// Voice / Narration Generation for a scene
// -------------------------------------------------------------
productionRouter.post('/scenes/:sceneId/voice', async (req, res) => {
  try {
    const { sceneId } = req.params;
    const { narration, lang, provider, voice, speed, effect } = req.body;

    const scene = await getSceneBySceneId(sceneId);
    if (!scene) {
      return res.status(404).json({ message: 'Scene not found' });
    }

    const textToSpeak = narration || scene.narration;
    if (!textToSpeak || textToSpeak.trim().length === 0) {
      return res.status(400).json({ message: 'Scene has no narration text to speak' });
    }

    const result = await audioGenerationService.generateNarrationAudio({
      sceneId,
      narration: textToSpeak,
      lang: lang || 'en',
      provider,
      voice,
      speed: speed ? parseFloat(speed) : undefined,
      effect,
    });

    return res.json({
      success: true,
      sceneId,
      audioUrl: result.audioUrl,
      durationMs: result.durationMs,
      provider: result.provider,
      voice: result.voice,
      effect: result.effect,
    });
  } catch (error: any) {
    console.error(`[Production] Voice generation failed for scene ${req.params.sceneId}:`, error);
    return res.status(500).json({ message: error.message || 'Failed to generate voice narration' });
  }
});


/**
 * Returns a browser-ready Remotion composition manifest for the editor Player.
 * This is a read-only preview endpoint; it does not create or mutate story data.
 */
productionRouter.get('/story/:storyId/remotion-preview', async (req, res) => {
  try {
    const { storyId } = req.params;
    const story = await getStoryByStoryId(storyId);
    if (!story) return res.status(404).json({ message: 'Story not found' });
    const scenes = await getScenesByStoryId(storyId, false);
    if (!scenes?.length) return res.status(400).json({ message: 'This story has no scenes to preview' });

    const format = String(req.query.format || '16:9');
    const resolution = String(req.query.resolution || '720p');
    const fps = Number(req.query.fps || 30);
    const templateId = String(req.query.templateId || 'kids-story');
    const subtitleTheme = req.query.subtitleTheme ? String(req.query.subtitleTheme) : undefined;
    if (!['16:9', '9:16', '1:1', '4:5'].includes(format)) {
      return res.status(400).json({ message: 'Unsupported preview aspect ratio' });
    }
    if (!['720p', '1080p'].includes(resolution) || !Number.isInteger(fps) || fps < 1 || fps > 60) {
      return res.status(400).json({ message: 'Invalid preview resolution or FPS' });
    }
    if (!['kids-story', 'moral-story', 'educational', 'nursery-learning', 'intro-outro'].includes(templateId)) {
      return res.status(400).json({ message: 'Unsupported video template' });
    }
    if (subtitleTheme && !['classic', 'karaoke', 'speech-bubble', 'minimal'].includes(subtitleTheme)) {
      return res.status(400).json({ message: 'Unsupported subtitle theme' });
    }

    const serverOrigin = process.env.BACKEND_URL || `${req.protocol}://${req.get('host') || 'localhost:5001'}`;
    const adapter = new RemotionManifestAdapter({
      serverOrigin,
    });
    const manifest = await adapter.buildManifest(story, scenes, {
      format: format as any,
      resolution: resolution as any,
      fps,
      templateId,
      subtitleTheme: subtitleTheme as any,
      embedBase64Images: true,
      excludeSilentAudio: true,
    });
    return res.json({ success: true, manifest });
  } catch (error: any) {
    console.error('[Production] Remotion preview manifest failed:', error);
    return res.status(500).json({ message: error?.message || 'Failed to prepare Remotion preview' });
  }
});

// -------------------------------------------------------------
// Video Assembly & Export Pipeline
// -------------------------------------------------------------
productionRouter.post('/story/:storyId/export', async (req, res) => {
  try {
    const { storyId } = req.params;
    const {
      resolution = '720p',
      fps = 30,
      backgroundMusic,
      musicVolume,
      format = '16:9',
      selectedSceneIds,
      targetDurationSec,
      renderer = 'ffmpeg',
      templateId = 'kids-story',
      subtitleTheme,
    } = req.body;
    if (renderer !== 'ffmpeg' && renderer !== 'remotion') {
      return res.status(400).json({ message: 'renderer must be either "ffmpeg" or "remotion"' });
    }
    if (!['720p', '1080p'].includes(resolution)) {
      return res.status(400).json({ message: 'resolution must be 720p or 1080p' });
    }
    if (!Number.isInteger(fps) || fps < 1 || fps > 60) {
      return res.status(400).json({ message: 'fps must be an integer between 1 and 60' });
    }
    if (!['16:9', '9:16', '1:1', '4:5', 'custom'].includes(format)) {
      return res.status(400).json({ message: 'Unsupported export format' });
    }
    if (!['kids-story', 'moral-story', 'educational', 'nursery-learning', 'intro-outro'].includes(templateId)) {
      return res.status(400).json({ message: 'Unsupported video template' });
    }
    if (subtitleTheme !== undefined && !['classic', 'karaoke', 'speech-bubble', 'minimal'].includes(subtitleTheme)) {
      return res.status(400).json({ message: 'Unsupported subtitle theme' });
    }
    if (renderer === 'remotion' && format === 'custom') {
      return res.status(400).json({ message: 'Remotion currently supports 16:9, 9:16, 1:1 and 4:5 formats' });
    }

    const idempotencyKey = req.body.idempotencyKey || (req.query.idempotencyKey as string) || req.get('Idempotency-Key');

    const job = videoAssemblyService.startExportJob({
      storyId,
      resolution,
      fps,
      backgroundMusic,
      musicVolume,
      format,
      selectedSceneIds,
      targetDurationSec,
      renderer,
      templateId,
      subtitleTheme,
      idempotencyKey,
    });

    return res.json({
      success: true,
      job,
    });
  } catch (error: any) {
    console.error(`[Production] Failed to start export job for story ${req.params.storyId}:`, error);
    return res.status(500).json({ message: error.message || 'Failed to start export job' });
  }
});


/**
 * Queue multiple aspect-ratio exports from the same editable story.
 * Format-specific character/overlay positions are read from animationData.formatVariants.
 */
productionRouter.post('/story/:storyId/export-variations', async (req, res) => {
  try {
    const { storyId } = req.params;
    const formats: string[] = Array.isArray(req.body.formats) ? Array.from(new Set<string>(req.body.formats.map((f: unknown) => String(f)))) : [];
    if (!formats.length || formats.some((format: string) => !['16:9', '9:16', '1:1', '4:5'].includes(format))) {
      return res.status(400).json({ message: 'formats must contain one or more of 16:9, 9:16, 1:1, 4:5' });
    }
    const resolution = req.body.resolution || '720p';
    const fps = req.body.fps || 30;
    if (!['720p', '1080p'].includes(resolution) || !Number.isInteger(fps) || fps < 1 || fps > 60) {
      return res.status(400).json({ message: 'Invalid resolution or FPS' });
    }
    const renderer = req.body.renderer || 'remotion';
    if (renderer !== 'remotion' && renderer !== 'ffmpeg') {
      return res.status(400).json({ message: 'renderer must be remotion or ffmpeg' });
    }
    const jobs = (formats as Array<'16:9' | '9:16' | '1:1' | '4:5'>).map((format) =>
      videoAssemblyService.startExportJob({
        storyId,
        resolution,
        fps,
        format,
        renderer,
        backgroundMusic: req.body.backgroundMusic,
        musicVolume: req.body.musicVolume,
        templateId: req.body.templateId || 'kids-story',
        subtitleTheme: req.body.subtitleTheme || 'speech-bubble',
      })
    );
    return res.status(202).json({ success: true, jobs });
  } catch (error: any) {
    console.error('[Production] Failed to queue video variations:', error);
    return res.status(500).json({ message: error?.message || 'Failed to queue video variations' });
  }
});

productionRouter.get('/export/:jobId', (req, res) => {
  const { jobId } = req.params;
  const job = videoAssemblyService.getJob(jobId);

  if (!job) {
    return res.status(404).json({ message: 'Export job not found' });
  }

  return res.json(job);
});

productionRouter.post('/export/:jobId/cancel', async (req, res) => {
  const { jobId } = req.params;
  const job = videoAssemblyService.getJob(jobId);
  if (!job) {
    return res.status(404).json({ message: 'Export job not found' });
  }
  const cancelled = await videoAssemblyService.cancelExportJob(jobId);
  if (!cancelled) {
    return res.status(400).json({
      message: `Cannot cancel export job in status "${job.status}"`,
      job,
    });
  }
  return res.json({
    success: true,
    message: 'Export job cancelled successfully',
    job: videoAssemblyService.getJob(jobId),
  });
});

productionRouter.delete('/export/:jobId', async (req, res) => {
  const { jobId } = req.params;
  const job = videoAssemblyService.getJob(jobId);
  if (!job) {
    return res.status(404).json({ message: 'Export job not found' });
  }
  const cancelled = await videoAssemblyService.cancelExportJob(jobId);
  return res.json({
    success: true,
    message: cancelled ? 'Export job cancelled' : 'Export job removed',
    job: videoAssemblyService.getJob(jobId),
  });
});
