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

contentRouter.post("/story/generate", async (req, res) => {
  try {
    const { topic, ageGroup, lesson } = req.body;

    if (!topic || !ageGroup) {
      return res.status(400).json({
        message: "topic and ageGroup are required",
      });
    }

    const story = await generateStory({
      topic,
      ageGroup,
      lesson,
    });

    return res.json(story);
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

    const story = getStoryByStoryId(storyId);
    if (!story) {
      return res.status(404).json({ message: "Story not found" });
    }

    const scenes = getScenesByStoryId(storyId);

    const scenesWithImages = scenes.map((scene: any) => {
      const images = getImagesBySceneId(scene.scene_id);
      const latestImage = images.length > 0 ? images[0] : null;
      return {
        id: scene.id,
        sceneId: scene.scene_id,
        storyId: scene.story_id,
        title: scene.title,
        number: scene.number,
        narration: scene.narration,
        image: latestImage
          ? {
              id: latestImage.id,
              sceneId: latestImage.scene_id,
              provider: latestImage.provider,
              model: latestImage.model,
              prompt: latestImage.prompt,
              storageKey: latestImage.storage_key,
              imageUrl: latestImage.image_url,
              width: latestImage.width,
              height: latestImage.height,
              status: latestImage.status,
            }
          : null,
      };
    });

    return res.json({
      id: story.id,
      storyId: story.story_id,
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

contentRouter.get("/scenes/:sceneId/image", (req, res) => {
  const images = getImagesBySceneId(req.params.sceneId);
  const latestImage = images[0];

  if (!latestImage) {
    return res.status(404).json({ success: false, message: "No saved image for this scene" });
  }

  return res.json({
    success: true,
    image: {
      id: latestImage.id,
      sceneId: latestImage.scene_id,
      url: latestImage.image_url,
      mimeType: latestImage.mime_type,
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
    const scene = getSceneBySceneId(sceneId);
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
      createScene({
        id: randomUUID(),
        sceneId,
        storyId: storyId || "default-story",
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
    createImage({
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
