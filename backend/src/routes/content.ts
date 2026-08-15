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
  getCharacterById,
  getCharactersByStoryId,
  linkStoryCharacter,
  getAllStories,
  deleteStory,
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
    const {
      topic,
      ageGroup,
      lesson,
      audience,
      genre,
      visualStyle,
      characterIds,
    } = req.body;

    if (!topic) {
      return res.status(400).json({
        message: "topic is required",
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
      topic: topic || null,
      ageGroup: ageGroup || null,
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
        distinctiveFeatures: character.description.split(",")[0] || "",
      });

      await linkStoryCharacter({
        id: randomUUID(),
        storyId,
        characterId: characterRecord.id,
      });
    }

    // Link any user-selected library characters to the story
    if (Array.isArray(characterIds) && characterIds.length > 0) {
      for (const characterId of characterIds) {
        const character = await getCharacterById(characterId);
        if (!character) continue;

        await linkStoryCharacter({
          id: randomUUID(),
          storyId,
          characterId: character.id,
        });
      }
    }

    return res.json({ ...story, storyId });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Failed to generate story" });
  }
});

contentRouter.post("/story/:storyId/scenes/generate", async (req, res) => {
  try {
    const { storyId } = req.params;

    // Fetch the story to get title/logline/lesson
    const story = await getStoryByStoryId(storyId);
    if (!story) {
      return res.status(404).json({ message: "Story not found" });
    }

    // Fetch characters linked to this story through StoryCharacter
    const linkedCharacters = await getCharactersByStoryId(storyId);

    if (!linkedCharacters || linkedCharacters.length === 0) {
      return res.status(400).json({
        message:
          "No characters linked to this story. Please add characters first.",
      });
    }

    // Transform character data for the scene generation service
    // getCharactersByStoryId returns Character objects directly
    const charactersForService = linkedCharacters.map((c) => ({
      name: c.name,
      species: c.species,
      personality: c.personality,
      description: c.visualDescription,
    }));

    const scenes = await generateScenes({
      story: {
        title: story.title,
        logline: story.logline,
        lesson: story.lesson,
      },
      characters: charactersForService,
      sceneCount: 5,
    });

    // Save scenes to PostgreSQL immediately (do not wait for image generation)
    const savedScenes = await Promise.all(
      scenes.map((scene) => {
        const sceneData = {
          id: randomUUID(),
          sceneId: scene.sceneNumber
            ? `scene-${scene.sceneNumber}`
            : `scene-${Date.now()}`,
          storyId,
          title: `Scene ${scene.sceneNumber}`,
          number: scene.sceneNumber ?? 0,
          narration: scene.narration,
        };
        return createScene(sceneData);
      }),
    );

    return res.json({
      scenes: savedScenes,
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
    const characters = await getCharactersByStoryId(storyId);

    const scenesWithImages = await Promise.all(
      scenes.map(async (scene: any) => {
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
      }),
    );

    return res.json({
      id: story.id,
      storyId: story.storyId,
      title: story.title,
      logline: story.logline,
      lesson: story.lesson,
      topic: story.topic,
      ageGroup: story.ageGroup,
      audience: story.audience,
      genre: story.genre,
      visualStyle: story.visualStyle,
      characters: characters.map((character) => ({
        id: character.id,
        name: character.name,
        species: character.species,
        personality: character.personality,
        description: character.visualDescription,
      })),
      scenes: scenesWithImages,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Failed to fetch story" });
  }
});

contentRouter.put("/story/:storyId", async (req, res) => {
  try {
    const { storyId } = req.params;
    const {
      topic,
      audience,
      genre,
      visualStyle,
      lesson,
      characterIds,
    } = req.body;

    if (!topic) {
      return res.status(400).json({
        message: "topic is required",
      });
    }

    // Fetch existing story to get ageGroup for backward compatibility
    const existingStory = await getStoryByStoryId(storyId);
    if (!existingStory) {
      return res.status(404).json({ message: "Story not found" });
    }

    // Regenerate story with new parameters
    const story = await generateStory({
      topic,
      ageGroup: existingStory.ageGroup || undefined,
      lesson,
      audience,
      genre,
      visualStyle,
    });

    // Update story in database
    await createStory({
      id: story.id,
      storyId,
      title: story.title,
      logline: story.logline,
      lesson: story.lesson,
      topic: topic || null,
      ageGroup: existingStory.ageGroup || null,
      audience: audience || null,
      genre: genre || null,
      visualStyle: visualStyle || null,
    });

    // Handle character associations
    // First, remove existing StoryCharacter links for this story
    // (Note: This would require a deleteStoryCharacter function, for now we'll just add new ones)
    // For MVP, we'll add new character links without removing old ones to avoid complexity
    
    // Link user-selected library characters to the story
    if (Array.isArray(characterIds) && characterIds.length > 0) {
      for (const characterId of characterIds) {
        const character = await getCharacterById(characterId);
        if (!character) continue;

        await linkStoryCharacter({
          id: randomUUID(),
          storyId,
          characterId: character.id,
        });
      }
    }

    return res.json({ ...story, storyId });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Failed to regenerate story" });
  }
});

contentRouter.delete("/story/:storyId", async (req, res) => {
  try {
    const { storyId } = req.params;

    await deleteStory(storyId);

    return res.json({ success: true });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Failed to delete story" });
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
    return res
      .status(404)
      .json({ success: false, message: "No saved image for this scene" });
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
