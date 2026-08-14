import { Router } from "express";
import { generateStory } from "../services/story.service.js";
import { generateScenes } from "../services/scene.service.js";
import {
  getStoryByStoryId,
  getScenesByStoryId,
  getImagesBySceneId,
  createScene,
  createImage,
  getSceneBySceneId,
  createStory,
  createCharacter,
  linkStoryCharacter,
  getAllStories,
} from "../services/database/database.service.js";
import { ImageGenerationService } from "../services/image-generation/image-generation.service.js";
import { getImageGenerationProvider } from "../services/image-generation/provider.factory.js";
import { LocalStorageService } from "../services/storage/local-storage.service.js";
import { buildSceneImagePrompt } from "../services/image-generation/prompt-builder.js";
import { randomUUID } from "crypto";

export const contentRouter = Router();

contentRouter.get("/modules", (_req, res) => {
  res.json([
    "Story Generator",
    "Character Manager",
    "Scene Generator",
    "Voice Generator",
    "Video Generator",
    "Thumbnail Generator",
    "YouTube Publisher",
  ]);
});

contentRouter.get("/stories", async (_req, res) => {
  try {
    const stories = await getAllStories();
    return res.json(stories);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Failed to fetch stories" });
  }
});

contentRouter.post("/story/generate", async (req, res) => {
  try {
    const { topic, ageGroup, lesson, audience, genre, visualStyle } = req.body;

    if (!topic || !ageGroup) {
      return res.status(400).json({
        message: "topic and ageGroup are required",
      });
    }

    const story = await generateStory({
      topic,
      ageGroup,
      lesson,
      audience,
      genre,
      visualStyle,
    });

    // Persist the story
    const storyId = `story-${randomUUID()}`;
    await createStory({
      id: story.id,
      storyId,
      title: story.title,
      logline: story.logline,
      lesson: story.lesson,
      audience: audience || null,
      genre: genre || null,
      visualStyle: visualStyle || null,
    });

    // Create/reuse characters and link them to the story
    for (const character of story.characters) {
      const characterRecord = await createCharacter({
        id: randomUUID(),
        name: character.name,
        species: character.species,
        personality: character.personality,
        visualDescription: character.description,
        distinctiveFeatures: character.description.split(',')[0] || '',
      });

      await linkStoryCharacter({
        id: randomUUID(),
        storyId,
        characterId: characterRecord.id,
      });
    }

    return res.json({ ...story, storyId });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Failed to generate story" });
  }
});

contentRouter.post("/story/:storyId/scenes/generate", async (req, res) => {
  try {
    const { story, characters, sceneCount } = req.body;

    if (!story || !characters) {
      return res.status(400).json({
        message: "story and characters are required",
      });
    }

    const scenes = await generateScenes({
      story,
      characters,
      sceneCount,
    });

    return res.json({
      scenes,
    });
  } catch (error) {
    console.error(error);

    return res.status(500).json({
      message: "Failed to generate scenes",
    });
  }
});

contentRouter.get("/story/:storyId", async (req, res) => {
  try {
    const { storyId } = req.params;

    const story = await getStoryByStoryId(storyId);
    if (!story) {
      return res.status(404).json({ message: "Story not found" });
    }

    const scenes = await getScenesByStoryId(storyId);

    const scenesWithImages = await Promise.all(scenes.map(async (scene: any) => {
      const images = await getImagesBySceneId(scene.sceneId);
      const latestImage = images.length > 0 ? images[0] : null;
      return {
        id: scene.id,
        sceneId: scene.sceneId,
        storyId: scene.storyId,
        title: scene.title,
        number: scene.number,
        narration: scene.narration,
        image: latestImage
          ? {
              id: latestImage.id,
              sceneId: latestImage.sceneId,
              provider: latestImage.provider,
              model: latestImage.model,
              prompt: latestImage.prompt,
              storageKey: latestImage.storageKey,
              imageUrl: latestImage.imageUrl,
              width: latestImage.width,
              height: latestImage.height,
              status: latestImage.status,
            }
          : null,
      };
    }));

    return res.json({
      id: story.id,
      storyId: story.storyId,
      title: story.title,
      logline: story.logline,
      lesson: story.lesson,
      scenes: scenesWithImages,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Failed to fetch story" });
  }
});

function getExtensionFromMimeType(mimeType: string): string {
  switch (mimeType) {
    case "image/jpeg":
    case "image/jpg":
      return "jpg";
    case "image/gif":
      return "gif";
    case "image/webp":
      return "webp";
    case "image/png":
    default:
      return "png";
  }
}

// Initialize services
const imageGenerationProvider = getImageGenerationProvider();
const imageGenerationService = new ImageGenerationService(
  imageGenerationProvider,
);
const storageService = new LocalStorageService();
const providerType = process.env.IMAGE_PROVIDER || "mock";

contentRouter.get("/scenes/:sceneId/image", async (req, res) => {
  const images = await getImagesBySceneId(req.params.sceneId);
  const latestImage = images[0];

  if (!latestImage) {
    return res.status(404).json({ success: false, message: "No saved image for this scene" });
  }

  return res.json({
    success: true,
    image: {
      id: latestImage.id,
      sceneId: latestImage.sceneId,
      url: latestImage.imageUrl,
      width: latestImage.width,
      height: latestImage.height,
    },
  });
});

contentRouter.post("/scenes/:sceneId/image", async (req, res) => {
  const { sceneId } = req.params;
  const { description, title, characters = [], storyId } = req.body;

  console.log(`[Content] Starting image generation for scene ${sceneId}`);
  console.log(`[Content] Using image provider: ${providerType}`);

  try {
    // Validate sceneId
    if (
      !sceneId ||
      typeof sceneId !== "string" ||
      sceneId.trim().length === 0
    ) {
      return res.status(400).json({
        success: false,
        message: "Invalid sceneId",
      });
    }

    // Find the scene; fall back to request body if not persisted yet
    const scene = await getSceneBySceneId(sceneId);
    const sceneDescription = scene
      ? scene.narration || scene.title
      : description;
    const sceneTitle = scene ? scene.title : title || `Scene ${sceneId}`;

    if (!sceneDescription) {
      return res.status(400).json({
        success: false,
        message: "description is required",
      });
    }

    // Persist the scene if it doesn't exist yet (frontend scenes live in state)
    if (!scene) {
      // Ensure the story exists first
      const targetStoryId = storyId || "default-story";
      const existingStory = await getStoryByStoryId(targetStoryId);
      if (!existingStory) {
        await createStory({
          id: randomUUID(),
          storyId: targetStoryId,
          title: "Default Story",
          logline: "Default story for scenes",
          lesson: "Default lesson",
        });
      }

      await createScene({
        id: randomUUID(),
        sceneId,
        storyId: targetStoryId,
        title: sceneTitle,
        number: 0,
        narration: description,
      });
    }

    // Build image prompt from the scene's existing data
    const prompt = buildSceneImagePrompt(
      {
        description: sceneDescription,
        title: sceneTitle,
        narration: scene ? scene.narration : description,
      },
      characters,
    );

    console.log(`[Content] Generated prompt for scene ${sceneId}`);

    // Generate image (16:9 aspect ratio - 1024x576)
    const { imageBuffer, mimeType } =
      await imageGenerationService.generateSceneImage({
        prompt,
        width: 1024,
        height: 576,
      });

    console.log(
      `[Content] Image generated for scene ${sceneId}, size: ${imageBuffer.length} bytes, mimeType: ${mimeType}`,
    );

    // Save image to local storage with extension matching the actual MIME type
    const timestamp = Date.now();
    const extension = getExtensionFromMimeType(mimeType);
    const filename = `scene-${sceneId}-${timestamp}.${extension}`;
    const { url } = await storageService.saveFile(
      imageBuffer,
      filename,
      mimeType,
    );

    console.log(
      `[Content] Image saved to disk: ${filename}, mimeType: ${mimeType}, browserURL: ${url}`,
    );

    // Create image record in database
    const imageId = randomUUID();
    await createImage({
      id: imageId,
      sceneId,
      provider: providerType,
      model: "default",
      prompt,
      storageKey: filename,
      imageUrl: url,
      width: 1024,
      height: 576,
      status: "completed",
    });

    console.log(
      `[Content] Image metadata saved to database with ID: ${imageId}`,
    );

    return res.json({
      success: true,
      image: {
        id: imageId,
        sceneId,
        provider: providerType,
        filePath: url,
        url,
        mimeType,
        width: 1024,
        height: 576,
      },
    });
  } catch (error) {
    console.error(`[Content] Image generation failed for scene ${sceneId}`);
    console.error(error);

    return res.status(500).json({
      success: false,
      message: "Failed to generate image",
    });
  }
});
