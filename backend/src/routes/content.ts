import { Router } from "express";
import fs from "fs";
import path from "path";
import { generateStory } from "../services/story.service.js";
import { generateScenes } from "../services/scene.service.js";
import { StoryGenerationService } from "../services/story-generation/story-generation.service.js";
import { StoryImporterService } from "../services/story-generation/story-importer.service.js";
import {
  getStoryByStoryId,
  getScenesByStoryId,
  getImagesBySceneId,
  createScene,
  createImage,
  getSceneBySceneId,
  createStory,
  createCharacter,
  getCharacterByName,
  getCharacterById,
  getCharactersByStoryId,
  linkStoryCharacter,
  getAllStories,
  deleteStory,
  updateScene,
  deleteScene,
  restoreScene,
  updateCharacter,
  updateStoryMetadata,
  batchUpdateSceneTimelines,
  createSceneVersion,
  getSceneVersions,
  restoreSceneVersion,
  unlinkStoryCharacter,
  setStoryCharacters,
} from "../services/database/database.service.js";
import { ImageGenerationService } from "../services/image-generation/image-generation.service.js";
import { getImageGenerationProvider } from "../services/image-generation/provider.factory.js";
import { LocalStorageService } from "../services/storage/local-storage.service.js";
import { buildSceneImagePrompt } from "../services/image-generation/prompt-builder.js";
import { AudioGenerationService } from "../services/audio-generation/audio-generation.service.js";
import { suggestEmotionForText } from "../services/audio-generation/emotion-suggester.service.js";
import { estimateSpeechDurationMs, formatTimeMs } from "../services/timing/timing.service.js";
import { randomUUID } from "crypto";

export const contentRouter = Router();
const audioGenerationService = new AudioGenerationService();

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
      newCharacters,
      desiredDurationSeconds,
      targetDuration,
      language,
      title,
      sceneCount,
      tone,
      contentRestrictions,
      idempotencyKey,
    } = req.body;

    if (!topic || typeof topic !== "string" || !topic.trim()) {
      return res.status(400).json({
        message: "topic is required",
      });
    }

    const duration = desiredDurationSeconds || targetDuration || 60;

    const result = await StoryGenerationService.generateAndPersistStory({
      topic: topic.trim(),
      ageGroup: ageGroup || audience || "4-7 years",
      desiredDurationSeconds: duration,
      language: language || "Hindi",
      title,
      genre: genre || "Adventure",
      lesson,
      characterIds: Array.isArray(characterIds) ? characterIds : [],
      newCharacters: Array.isArray(newCharacters) ? newCharacters : [],
      sceneCount: typeof sceneCount === "number" ? sceneCount : undefined,
      tone,
      contentRestrictions,
      idempotencyKey,
      visualStyle,
      audience,
    });

    return res.json({
      id: result.story.id,
      storyId: result.storyId,
      title: result.story.title,
      logline: result.story.logline,
      lesson: result.story.lesson,
      topic: result.story.topic,
      ageGroup: result.story.ageGroup,
      audience: result.story.audience,
      genre: result.story.genre,
      visualStyle: result.story.visualStyle,
      targetDuration: result.story.targetDuration,
      characters: result.characters,
      scenes: result.scenes,
    });
  } catch (error: any) {
    console.error("[Content] Error generating structured story:", error);
    return res.status(500).json({ message: error?.message || "Failed to generate story" });
  }
});

// Import or Write Story Route (instant parsing, no paid AI required)
contentRouter.post("/story/import", async (req, res) => {
  try {
    const { rawText, title, language, genre, visualStyle, topic, ageGroup, format } = req.body;
    if (!rawText || typeof rawText !== "string" || !rawText.trim()) {
      return res.status(400).json({ message: "rawText (script or markdown) is required" });
    }

    const result = await StoryImporterService.importAndPersistStory({
      rawText: rawText.trim(),
      title,
      language: language || "Hindi",
      genre: genre || "Educational",
      visualStyle: visualStyle || "Storybook",
      topic,
      ageGroup,
      format,
    });

    return res.json({
      id: result.story.id,
      storyId: result.storyId,
      title: result.story.title,
      logline: result.story.logline,
      lesson: result.story.lesson,
      topic: result.story.topic,
      ageGroup: result.story.ageGroup,
      audience: result.story.audience,
      genre: result.story.genre,
      visualStyle: result.story.visualStyle,
      targetDuration: result.story.targetDuration,
      characters: result.characters,
      scenes: result.scenes,
    });
  } catch (error: any) {
    console.error("[Content] Error importing story:", error);
    return res.status(500).json({ message: error?.message || "Failed to import story" });
  }
});

// Parse unstructured script into draft storyboard scenes for user review
contentRouter.post("/story/parse-script", async (req, res) => {
  try {
    const { rawText, language, title, targetDuration, storyId } = req.body;
    if (!rawText || typeof rawText !== "string" || !rawText.trim()) {
      return res.status(400).json({ message: "rawText (script or markdown) is required" });
    }

    const draftResult = StoryImporterService.parseScriptForDraft(rawText.trim(), {
      language: language || "Hindi",
      defaultTitle: title,
      targetDuration: typeof targetDuration === "number" ? targetDuration : undefined,
    });

    return res.json(draftResult);
  } catch (error: any) {
    console.error("[Content] Failed to parse story script:", error);
    return res.status(500).json({ message: error?.message || "Failed to parse script" });
  }
});

// Generate structured draft storyboard for user review (Create Story with AI flow)
contentRouter.post("/story/generate-draft", async (req, res) => {
  try {
    const {
      topic,
      ageGroup,
      lesson,
      audience,
      genre,
      visualStyle,
      characterIds,
      newCharacters,
      desiredDurationSeconds,
      targetDuration,
      language,
      title,
      sceneCount,
      tone,
      contentRestrictions,
    } = req.body;

    if (!topic || typeof topic !== "string" || !topic.trim()) {
      return res.status(400).json({ message: "topic is required" });
    }

    const duration = desiredDurationSeconds || targetDuration || 60;
    const draftResult = await StoryGenerationService.generateDraftStory({
      topic: topic.trim(),
      ageGroup: ageGroup || audience || "4-7 years",
      desiredDurationSeconds: duration,
      language: language || "Hindi",
      title,
      genre: genre || "Adventure",
      lesson,
      characterIds: Array.isArray(characterIds) ? characterIds : [],
      newCharacters: Array.isArray(newCharacters) ? newCharacters : [],
      sceneCount: typeof sceneCount === "number" ? sceneCount : undefined,
      tone,
      contentRestrictions,
      visualStyle,
      audience,
    });

    return res.json(draftResult);
  } catch (error: any) {
    console.error("[Content] Failed to generate draft story:", error);
    return res.status(500).json({ message: error?.message || "Failed to generate draft story" });
  }
});

// Create new story and scenes from reviewed/edited draft storyboard (both AI and Import flows)
contentRouter.post("/story/create-from-draft", async (req, res) => {
  try {
    const {
      title,
      targetDurationSeconds,
      language,
      logline,
      lesson,
      genre,
      visualStyle,
      audience,
      topic,
      characters,
      scenes,
    } = req.body;

    if (!Array.isArray(scenes) || scenes.length === 0) {
      return res.status(400).json({ message: "scenes array cannot be empty" });
    }

    const result = await StoryImporterService.createStoryFromDraft({
      title: title || "Untitled Story",
      targetDurationSeconds: typeof targetDurationSeconds === "number" ? targetDurationSeconds : 60,
      language: language || "Hindi",
      logline,
      lesson,
      genre,
      visualStyle,
      audience,
      topic,
      characters,
      scenes,
    });

    return res.json({
      success: true,
      storyId: result.storyId,
      story: result.story,
      scenes: result.scenes,
    });
  } catch (error: any) {
    console.error("[Content] Failed to create story from draft:", error);
    return res.status(500).json({ message: error?.message || "Failed to create story from draft" });
  }
});

// Commit reviewed/edited draft storyboard scenes into existing story without auto-generating media
contentRouter.post("/story/:storyId/scenes/import-draft", async (req, res) => {
  try {
    const { storyId } = req.params;
    const { scenes, importMode = "replace", updateStoryMetadata, title, targetDurationSeconds, language } = req.body;

    if (!Array.isArray(scenes) || scenes.length === 0) {
      return res.status(400).json({ message: "scenes array cannot be empty" });
    }

    const savedScenes = await StoryImporterService.importDraftScenesToStory({
      storyId,
      scenes,
      importMode: importMode === "append" ? "append" : "replace",
      updateStoryMetadata: Boolean(updateStoryMetadata),
      title,
      targetDurationSeconds,
      language: language || "Hindi",
    });

    return res.json({
      success: true,
      scenes: savedScenes,
    });
  } catch (error: any) {
    console.error("[Content] Failed to import draft scenes:", error);
    return res.status(500).json({ message: error?.message || "Failed to import draft scenes" });
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
    // Include canonical appearance and reference image if available
    const charactersForService = linkedCharacters.map((c) => ({
      name: c.name,
      species: c.species,
      personality: c.personality,
      description: c.visualDescription,
      canonicalAppearance: c.canonicalAppearance,
      referenceImageUrl: c.referenceImageUrl,
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

    // Save scenes to PostgreSQL immediately with realistic calculated timings
    let runningTimeMs = 0;
    const savedScenes = await Promise.all(
      scenes.map((scene, index) => {
        const estimatedDurationMs = estimateSpeechDurationMs(scene.narration);
        const startMs = runningTimeMs;
        const endMs = startMs + estimatedDurationMs;
        runningTimeMs = endMs;

        const sceneData = {
          id: randomUUID(),
          sceneId: `${storyId}-scene-${scene.sceneNumber}`,
          storyId,
          title: `Scene ${scene.sceneNumber}`,
          number: scene.sceneNumber ?? index + 1,
          order: index + 1,
          startMs,
          endMs,
          narration: scene.narration,
          visualPrompt: scene.description,
          cameraDirection: "Eye level wide establishing shot",
          characterIds: JSON.stringify(linkedCharacters.map((c) => c.id)),
          estimatedDurationMs,
          generationStatus: "draft",
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
    const includeDeleted = req.query.includeDeleted === 'true';

    const story = await getStoryByStoryId(storyId);
    if (!story) {
      return res.status(404).json({ message: "Story not found" });
    }

    const scenes = await getScenesByStoryId(storyId, includeDeleted);
    const characters = await getCharactersByStoryId(storyId);

    const scenesWithImages = await Promise.all(
      scenes.map(async (scene: any) => {
        const images = await getImagesBySceneId(scene.sceneId);
        const latestImage = images.length > 0 ? images[0] : null;

        // Parse characterIds if stored as JSON string
        let parsedCharacterIds: string[] = [];
        if (scene.characterIds) {
          try {
            parsedCharacterIds = JSON.parse(scene.characterIds);
          } catch {
            parsedCharacterIds = [scene.characterIds];
          }
        }

        return {
          id: scene.id,
          sceneId: scene.sceneId,
          storyId: scene.storyId,
          title: scene.title,
          number: scene.number,
          order: scene.order ?? scene.number,
          startMs: scene.startMs ?? 0,
          endMs: scene.endMs ?? 0,
          narration: scene.narration,
          visualPrompt: scene.visualPrompt || null,
          cameraDirection: scene.cameraDirection || "Eye level wide establishing shot",
          characterIds: parsedCharacterIds,
          imageUrl: scene.imageUrl || (latestImage ? latestImage.imageUrl : null),
          videoUrl: scene.videoUrl || null,
          audioUrl: scene.audioUrl || null,
          generationStatus: scene.generationStatus || "draft",
          estimatedDurationMs: scene.estimatedDurationMs || 0,
          actualAudioDurationMs: scene.actualAudioDurationMs || null,
          generationError: scene.generationError || null,
          animationData: scene.animationData || null,
          versions: scene.versions || [],
          deletedAt: scene.deletedAt || null,
          createdAt: scene.createdAt,
          updatedAt: scene.updatedAt,
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
      targetDuration: story.targetDuration || null,
      characters: characters.map((character) => ({
        id: character.id,
        name: character.name,
        species: character.species,
        personality: character.personality,
        description: character.visualDescription,
        referenceImageUrl: character.referenceImageUrl,
        canonicalAppearance: character.canonicalAppearance,
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
      ageGroup,
      genre,
      visualStyle,
      lesson,
      characterIds,
      newCharacters,
      desiredDurationSeconds,
      targetDuration,
      language,
      title,
      sceneCount,
      tone,
      contentRestrictions,
    } = req.body;

    if (!topic || typeof topic !== "string" || !topic.trim()) {
      return res.status(400).json({
        message: "topic is required",
      });
    }

    const existingStory = await getStoryByStoryId(storyId);
    if (!existingStory) {
      return res.status(404).json({ message: "Story not found" });
    }

    const duration = desiredDurationSeconds || targetDuration || existingStory.targetDuration || 60;

    const result = await StoryGenerationService.regenerateStory(storyId, {
      topic: topic.trim(),
      ageGroup: ageGroup || audience || existingStory.ageGroup || "4-7 years",
      desiredDurationSeconds: duration,
      language: language || "Hindi",
      title: title || existingStory.title,
      genre: genre || existingStory.genre || "Adventure",
      lesson: lesson || existingStory.lesson,
      characterIds: Array.isArray(characterIds) ? characterIds : [],
      newCharacters: Array.isArray(newCharacters) ? newCharacters : [],
      sceneCount: typeof sceneCount === "number" ? sceneCount : undefined,
      tone,
      contentRestrictions,
      visualStyle: visualStyle || existingStory.visualStyle || undefined,
      audience: audience || existingStory.audience || undefined,
    });

    return res.json({
      id: result.story.id,
      storyId: result.storyId,
      title: result.story.title,
      logline: result.story.logline,
      lesson: result.story.lesson,
      topic: result.story.topic,
      ageGroup: result.story.ageGroup,
      audience: result.story.audience,
      genre: result.story.genre,
      visualStyle: result.story.visualStyle,
      targetDuration: result.story.targetDuration,
      characters: result.characters,
      scenes: result.scenes,
    });
  } catch (error: any) {
    console.error("[Content] Failed to regenerate story:", error);
    return res.status(500).json({ message: error?.message || "Failed to regenerate story" });
  }
});

contentRouter.post("/scenes/:sceneId/regenerate", async (req, res) => {
  try {
    const { sceneId } = req.params;
    const { prompt } = req.body || {};

    const updatedScene = await StoryGenerationService.regenerateSingleScene(sceneId, prompt);
    return res.json(updatedScene);
  } catch (error: any) {
    console.error("[Content] Failed to regenerate scene:", error);
    return res.status(500).json({ message: error?.message || "Failed to regenerate scene" });
  }
});

contentRouter.delete(["/story/:storyId", "/stories/:storyId"], async (req, res) => {
  try {
    const rawStoryId = req.params.storyId;
    const storyId = Array.isArray(rawStoryId) ? rawStoryId[0] : rawStoryId;

    if (!storyId) {
      return res.status(400).json({ message: "storyId parameter is required" });
    }

    await deleteStory(storyId);

    return res.json({ success: true });
  } catch (error: any) {
    console.error("[Content] Error deleting story:", error);
    return res.status(500).json({ message: error?.message || "Failed to delete story" });
  }
});

// Update story metadata (title, logline, lesson, targetDuration, etc.) without regenerating
contentRouter.patch("/story/:storyId", async (req, res) => {
  try {
    const { storyId } = req.params;
    const { title, logline, lesson, targetDuration, topic, ageGroup, audience, genre, visualStyle } = req.body;

    const existingStory = await getStoryByStoryId(storyId);
    if (!existingStory) {
      return res.status(404).json({ message: "Story not found" });
    }

    const updated = await updateStoryMetadata(storyId, {
      title,
      logline,
      lesson,
      targetDuration: targetDuration !== undefined ? targetDuration : undefined,
      topic,
      ageGroup,
      audience,
      genre,
      visualStyle,
    });

    return res.json(updated);
  } catch (error: any) {
    console.error("[Content] Failed to update story metadata:", error);
    return res.status(500).json({ message: error.message || "Failed to update story metadata" });
  }
});

// GET characters linked to story
contentRouter.get("/story/:storyId/characters", async (req, res) => {
  try {
    const { storyId } = req.params;
    const characters = await getCharactersByStoryId(storyId);
    return res.json(characters);
  } catch (error: any) {
    console.error("[Content] Failed to fetch story characters:", error);
    return res.status(500).json({ message: error.message || "Failed to fetch story characters" });
  }
});

// POST link character to story
contentRouter.post("/story/:storyId/characters", async (req, res) => {
  try {
    const { storyId } = req.params;
    const { characterId } = req.body;
    if (!characterId) {
      return res.status(400).json({ message: "characterId is required" });
    }
    const character = await getCharacterById(characterId);
    if (!character) {
      return res.status(404).json({ message: "Character not found" });
    }
    await linkStoryCharacter({
      id: randomUUID(),
      storyId,
      characterId,
    });
    const updatedCharacters = await getCharactersByStoryId(storyId);
    return res.status(201).json(updatedCharacters);
  } catch (error: any) {
    console.error("[Content] Failed to link character to story:", error);
    return res.status(500).json({ message: error.message || "Failed to link character to story" });
  }
});

// PUT update all characters linked to story
contentRouter.put("/story/:storyId/characters", async (req, res) => {
  try {
    const { storyId } = req.params;
    const { characterIds } = req.body;
    if (!Array.isArray(characterIds)) {
      return res.status(400).json({ message: "characterIds must be an array" });
    }
    await setStoryCharacters(storyId, characterIds);
    const updatedCharacters = await getCharactersByStoryId(storyId);
    return res.json(updatedCharacters);
  } catch (error: any) {
    console.error("[Content] Failed to set story characters:", error);
    return res.status(500).json({ message: error.message || "Failed to set story characters" });
  }
});

// DELETE unlink character from story
contentRouter.delete("/story/:storyId/characters/:characterId", async (req, res) => {
  try {
    const { storyId, characterId } = req.params;
    await unlinkStoryCharacter(storyId, characterId);
    const updatedCharacters = await getCharactersByStoryId(storyId);
    return res.json(updatedCharacters);
  } catch (error: any) {
    console.error("[Content] Failed to unlink character from story:", error);
    return res.status(500).json({ message: error.message || "Failed to unlink character from story" });
  }
});

// Create a new scene in a story
contentRouter.post("/story/:storyId/scenes", async (req, res) => {
  try {
    const { storyId } = req.params;
    const { title, narration, visualPrompt, cameraDirection, durationMs = 5000 } = req.body;

    const story = await getStoryByStoryId(storyId);
    if (!story) return res.status(404).json({ message: "Story not found" });

    const existingScenes = await getScenesByStoryId(storyId, false);
    const lastScene = existingScenes[existingScenes.length - 1];

    const nextNumber = (lastScene?.number ?? 0) + 1;
    const nextOrder = (lastScene?.order ?? 0) + 1;
    const startMs = lastScene?.endMs ?? 0;
    const endMs = startMs + Math.max(1500, durationMs);
    const sceneId = `${storyId}-scene-${randomUUID().slice(0, 8)}`;

    const newScene = await createScene({
      id: randomUUID(),
      sceneId,
      storyId,
      title: title || `Scene ${nextNumber}`,
      number: nextNumber,
      order: nextOrder,
      startMs,
      endMs,
      narration: narration || "",
      visualPrompt: visualPrompt || null,
      cameraDirection: cameraDirection || "Eye level wide establishing shot",
      estimatedDurationMs: durationMs,
      generationStatus: "draft",
    });

    return res.status(201).json(newScene);
  } catch (error: any) {
    console.error("[Content] Failed to create scene:", error);
    return res.status(500).json({ message: error.message || "Failed to create scene" });
  }
});

// Batch update scene timeline timings and orders
contentRouter.put("/story/:storyId/scenes/timeline", async (req, res) => {
  try {
    const { storyId } = req.params;
    const { scenes } = req.body;

    if (!Array.isArray(scenes)) {
      return res.status(400).json({ message: "scenes array is required" });
    }

    await batchUpdateSceneTimelines(storyId, scenes);
    return res.json({ success: true, count: scenes.length });
  } catch (error: any) {
    console.error("[Content] Failed to update timeline:", error);
    return res.status(500).json({ message: error.message || "Failed to update timeline" });
  }
});

const handleSceneUpdate = async (req: any, res: any) => {
  try {
    const { sceneId } = req.params;
    const {
      title,
      narration,
      number,
      order,
      startMs,
      endMs,
      visualPrompt,
      cameraDirection,
      characterIds,
      imageUrl,
      videoUrl,
      audioUrl,
      generationStatus,
      estimatedDurationMs,
      actualAudioDurationMs,
      generationError,
      animationData,
      dialogue,
      characterActions,
    } = req.body;

    let finalAnimationData = animationData;
    if (dialogue !== undefined || characterActions !== undefined) {
      const currentScene = await getSceneBySceneId(sceneId);
      const existingAnim = ((finalAnimationData !== undefined ? finalAnimationData : currentScene?.animationData) || {}) as any;
      finalAnimationData = {
        ...existingAnim,
        ...(dialogue !== undefined ? { dialogue } : {}),
        ...(characterActions !== undefined ? { characterActions } : {}),
      };
    }

    const updatedScene = await updateScene(sceneId, {
      title,
      narration,
      number,
      order,
      startMs,
      endMs,
      visualPrompt,
      cameraDirection,
      characterIds: Array.isArray(characterIds) ? JSON.stringify(characterIds) : characterIds,
      imageUrl,
      videoUrl,
      audioUrl,
      generationStatus,
      estimatedDurationMs,
      actualAudioDurationMs,
      generationError,
      animationData: finalAnimationData !== undefined ? finalAnimationData : undefined,
    });

    return res.json(updatedScene);
  } catch (error: any) {
    console.error("[Content] Failed to update scene:", error);
    return res.status(500).json({ message: error.message || "Failed to update scene" });
  }
};

contentRouter.put("/scenes/:sceneId", handleSceneUpdate);
contentRouter.patch("/scenes/:sceneId", handleSceneUpdate);

// Duplicate a scene
contentRouter.post("/scenes/:sceneId/duplicate", async (req, res) => {
  try {
    const { sceneId } = req.params;
    const scene = await getSceneBySceneId(sceneId);
    if (!scene) return res.status(404).json({ message: "Scene not found" });

    const allScenes = await getScenesByStoryId(scene.storyId, false);
    const sceneDuration = scene.endMs - scene.startMs > 0 ? scene.endMs - scene.startMs : (scene.estimatedDurationMs || 5000);
    const newSceneId = `${scene.storyId}-scene-${randomUUID().slice(0, 8)}`;

    const duplicatedScene = await createScene({
      id: randomUUID(),
      sceneId: newSceneId,
      storyId: scene.storyId,
      title: `${scene.title} (Copy)`,
      number: scene.number + 1,
      order: scene.order + 1,
      startMs: scene.endMs,
      endMs: scene.endMs + sceneDuration,
      narration: scene.narration,
      visualPrompt: scene.visualPrompt,
      cameraDirection: scene.cameraDirection,
      characterIds: scene.characterIds,
      imageUrl: scene.imageUrl,
      videoUrl: scene.videoUrl,
      audioUrl: scene.audioUrl,
      estimatedDurationMs: sceneDuration,
      actualAudioDurationMs: scene.actualAudioDurationMs,
      generationStatus: scene.generationStatus,
      animationData: (scene as any).animationData || null,
    });

    // Ripple subsequent scenes
    const subsequent = allScenes.filter((s) => s.order > scene.order && s.sceneId !== sceneId);
    if (subsequent.length > 0) {
      const updates = subsequent.map((s) => ({
        sceneId: s.sceneId,
        order: s.order + 1,
        startMs: s.startMs + sceneDuration,
        endMs: s.endMs + sceneDuration,
        estimatedDurationMs: s.estimatedDurationMs,
        actualAudioDurationMs: s.actualAudioDurationMs,
      }));
      await batchUpdateSceneTimelines(scene.storyId, updates);
    }

    return res.status(201).json(duplicatedScene);
  } catch (error: any) {
    console.error("[Content] Failed to duplicate scene:", error);
    return res.status(500).json({ message: error.message || "Failed to duplicate scene" });
  }
});

// Split a scene at playhead position splitMs
contentRouter.post("/scenes/:sceneId/split", async (req, res) => {
  try {
    const { sceneId } = req.params;
    const { splitMs } = req.body;

    if (!splitMs || typeof splitMs !== "number") {
      return res.status(400).json({ message: "Valid splitMs (number) is required" });
    }

    const scene = await getSceneBySceneId(sceneId);
    if (!scene) return res.status(404).json({ message: "Scene not found" });

    if (splitMs <= scene.startMs + 500 || splitMs >= scene.endMs - 500) {
      return res.status(400).json({
        message: `Split position must be at least 500ms away from scene edges (${scene.startMs + 500}ms - ${scene.endMs - 500}ms)`,
      });
    }

    const originalEndMs = scene.endMs;
    // Update Scene A
    await updateScene(sceneId, {
      endMs: splitMs,
      estimatedDurationMs: splitMs - scene.startMs,
    });

    // Create Scene B
    const newSceneId = `${scene.storyId}-scene-${randomUUID().slice(0, 8)}`;
    const newScene = await createScene({
      id: randomUUID(),
      sceneId: newSceneId,
      storyId: scene.storyId,
      title: `${scene.title} (Part 2)`,
      number: scene.number + 1,
      order: scene.order + 1,
      startMs: splitMs,
      endMs: originalEndMs,
      narration: "",
      visualPrompt: scene.visualPrompt,
      cameraDirection: scene.cameraDirection,
      characterIds: scene.characterIds,
      imageUrl: scene.imageUrl,
      estimatedDurationMs: originalEndMs - splitMs,
      generationStatus: "draft",
    });

    // Increment orders of all subsequent scenes
    const allScenes = await getScenesByStoryId(scene.storyId, false);
    const subsequent = allScenes.filter((s) => s.order > scene.order && s.sceneId !== sceneId && s.sceneId !== newSceneId);
    if (subsequent.length > 0) {
      const updates = subsequent.map((s) => ({
        sceneId: s.sceneId,
        order: s.order + 1,
        startMs: s.startMs,
        endMs: s.endMs,
        estimatedDurationMs: s.estimatedDurationMs,
        actualAudioDurationMs: s.actualAudioDurationMs,
      }));
      await batchUpdateSceneTimelines(scene.storyId, updates);
    }

    return res.json({ success: true, sceneAId: sceneId, sceneB: newScene });
  } catch (error: any) {
    console.error("[Content] Failed to split scene:", error);
    return res.status(500).json({ message: error.message || "Failed to split scene" });
  }
});

// Merge scene with next adjacent scene
contentRouter.post("/scenes/:sceneId/merge", async (req, res) => {
  try {
    const { sceneId } = req.params;
    const { targetSceneId } = req.body;

    const sceneA = await getSceneBySceneId(sceneId);
    if (!sceneA) return res.status(404).json({ message: "First scene not found" });

    let sceneB;
    if (targetSceneId) {
      sceneB = await getSceneBySceneId(targetSceneId);
    } else {
      const allScenes = await getScenesByStoryId(sceneA.storyId, false);
      const nextIndex = allScenes.findIndex((s) => s.sceneId === sceneId) + 1;
      sceneB = allScenes[nextIndex];
    }

    if (!sceneB) {
      return res.status(400).json({ message: "No adjacent scene found to merge with" });
    }

    // Combine narration and expand duration
    const mergedNarration = [sceneA.narration, sceneB.narration].filter(Boolean).join(" ");
    const mergedEndMs = Math.max(sceneA.endMs, sceneB.endMs);
    const mergedDuration = mergedEndMs - sceneA.startMs;

    await updateScene(sceneA.sceneId, {
      narration: mergedNarration,
      endMs: mergedEndMs,
      estimatedDurationMs: mergedDuration,
    });

    // Soft delete Scene B
    await deleteScene(sceneB.sceneId);

    // Reindex remaining scenes
    const remainingScenes = await getScenesByStoryId(sceneA.storyId, false);
    const updates = remainingScenes.map((s, idx) => ({
      sceneId: s.sceneId,
      order: idx + 1,
      startMs: s.startMs,
      endMs: s.endMs,
      estimatedDurationMs: s.estimatedDurationMs,
      actualAudioDurationMs: s.actualAudioDurationMs,
    }));
    await batchUpdateSceneTimelines(sceneA.storyId, updates);

    return res.json({ success: true, mergedSceneId: sceneA.sceneId });
  } catch (error: any) {
    console.error("[Content] Failed to merge scenes:", error);
    return res.status(500).json({ message: error.message || "Failed to merge scenes" });
  }
});

// Scene versioning endpoints
contentRouter.get("/scenes/:sceneId/versions", async (req, res) => {
  try {
    const { sceneId } = req.params;
    const versions = await getSceneVersions(sceneId);
    return res.json(versions);
  } catch (error: any) {
    console.error("[Content] Failed to get scene versions:", error);
    return res.status(500).json({ message: "Failed to get scene versions" });
  }
});

contentRouter.post("/scenes/:sceneId/versions/:versionId/restore", async (req, res) => {
  try {
    const { sceneId, versionId } = req.params;
    const restored = await restoreSceneVersion(sceneId, versionId);
    return res.json({ success: true, scene: restored });
  } catch (error: any) {
    console.error("[Content] Failed to restore scene version:", error);
    return res.status(500).json({ message: error.message || "Failed to restore scene version" });
  }
});

// Get available TTS voices, provider status, and effects
contentRouter.get("/tts/voices", async (_req, res) => {
  try {
    const info = await audioGenerationService.getVoices();
    return res.json(info);
  } catch (err: any) {
    console.error("[Content] Failed to fetch voices catalogue:", err);
    return res.status(500).json({ message: err.message || "Failed to fetch voices" });
  }
});

// Preview voice with sample speech and effect
contentRouter.post("/tts/preview", async (req, res) => {
  try {
    const { voice, provider, speed, effect, sampleText, lang, emotion, emotionIntensity } = req.body;
    const result = await audioGenerationService.previewVoice({
      voice,
      provider,
      speed: speed ? parseFloat(speed) : undefined,
      effect,
      sampleText,
      lang,
      emotion,
      emotionIntensity: emotionIntensity !== undefined ? Number(emotionIntensity) : undefined,
    });
    return res.json({ success: true, ...result });
  } catch (error: any) {
    console.error("[Content] Voice preview failed:", error);
    return res.status(500).json({ message: error.message || "Failed to generate voice preview" });
  }
});

// Suggest speaking emotion and facial expression from text
contentRouter.post("/suggest-emotion", async (req, res) => {
  try {
    const { text } = req.body || {};
    const suggestion = suggestEmotionForText(text || "");
    return res.json({ success: true, suggestion });
  } catch (err: any) {
    return res.status(500).json({ message: err.message || "Failed to suggest emotion" });
  }
});

// Real voice / narration generation endpoint
contentRouter.post("/scenes/:sceneId/voice", async (req, res) => {
  try {
    const { sceneId } = req.params;
    const { narration, lang, provider, voice, speed, effect, emotion, emotionIntensity } = req.body;

    const scene = await getSceneBySceneId(sceneId);
    if (!scene) {
      return res.status(404).json({ message: "Scene not found" });
    }

    const textToSpeak = narration || scene.narration;
    if (!textToSpeak || textToSpeak.trim().length === 0) {
      return res.status(400).json({ message: "Scene has no narration text to speak" });
    }

    const result = await audioGenerationService.generateNarrationAudio({
      sceneId,
      narration: textToSpeak,
      lang: lang || "hi",
      provider,
      voice,
      speed: speed ? parseFloat(speed) : undefined,
      effect,
      emotion,
      emotionIntensity: emotionIntensity !== undefined ? Number(emotionIntensity) : undefined,
    });

    return res.json({
      success: true,
      sceneId,
      audioUrl: result.audioUrl,
      durationMs: result.durationMs,
      provider: result.provider,
      voice: result.voice,
      effect: result.effect,
      emotion: result.emotion,
      emotionIntensity: result.emotionIntensity,
    });
  } catch (error: any) {
    console.error(`[Content] Voice generation failed for scene ${req.params.sceneId}:`, error);
    return res.status(500).json({ message: error.message || "Failed to generate voice narration" });
  }
});

// Delete / remove narration audio from a scene
contentRouter.delete("/scenes/:sceneId/voice", async (req, res) => {
  try {
    const { sceneId } = req.params;
    await audioGenerationService.removeSceneAudio(sceneId);
    return res.json({ success: true, sceneId });
  } catch (error: any) {
    console.error(`[Content] Failed to remove narration audio for scene ${req.params.sceneId}:`, error);
    return res.status(500).json({ message: error.message || "Failed to remove narration audio" });
  }
});

// Generate dialogue audio with Kokoro-82M TTS and lip-sync viseme cues
contentRouter.post("/scenes/:sceneId/dialogue/generate", async (req, res) => {
  try {
    const { sceneId } = req.params;
    const {
      characterId,
      characterInstanceId,
      characterName,
      text,
      voice,
      speakingDirection,
      emotion,
      emotionIntensity,
      facialExpression,
      speed,
      startMs,
      effect,
      volume,
      provider,
      lang,
    } = req.body;

    if (!text || !text.trim()) {
      return res.status(400).json({ message: "Dialogue text is required" });
    }

    const scene = await getSceneBySceneId(sceneId);
    if (!scene) {
      return res.status(404).json({ message: "Scene not found" });
    }

    const dialogue = await audioGenerationService.generateCharacterDialogueAudio({
      sceneId,
      characterId,
      characterInstanceId,
      characterName: characterName || "Character",
      text,
      voice,
      speakingDirection,
      emotion,
      emotionIntensity: emotionIntensity !== undefined ? Number(emotionIntensity) : undefined,
      facialExpression,
      speed: speed ? parseFloat(speed) : undefined,
      startMs: typeof startMs === "number" ? startMs : 0,
      effect,
      volume: volume !== undefined ? parseFloat(volume) : undefined,
      provider,
      lang,
    });

    // Update scene animationData.dialogueLines if animationData exists
    if ((scene as any).animationData) {
      const animData = (scene as any).animationData;
      const existingLines = Array.isArray(animData.dialogueLines) ? [...animData.dialogueLines] : [];
      const lineId = req.body.id || req.body.dialogueId;
      const matchIdx = existingLines.findIndex((l: any) =>
        (lineId && l.id === lineId) ||
        (l.characterName === dialogue.characterName && l.text === dialogue.text)
      );
      if (matchIdx >= 0) {
        existingLines[matchIdx] = {
          ...existingLines[matchIdx],
          ...dialogue,
          id: existingLines[matchIdx].id || dialogue.id,
        };
      } else {
        existingLines.push(dialogue);
      }
      await updateScene(scene.sceneId, {
        animationData: {
          ...animData,
          dialogueLines: existingLines,
        },
      });
    }

    return res.json({
      success: true,
      sceneId,
      dialogue,
    });
  } catch (error: any) {
    console.error(`[Content] Failed to generate dialogue audio for scene ${req.params.sceneId}:`, error);
    return res.status(500).json({ message: error.message || "Failed to generate dialogue audio" });
  }
});

// Batch generate dialogue audio for all dialogue lines in a scene
contentRouter.post("/scenes/:sceneId/dialogue/generate-all", async (req, res) => {
  try {
    const { sceneId } = req.params;
    const { provider, effect, forceRegenerate } = req.body || {};
    const scene = await getSceneBySceneId(sceneId);
    if (!scene) {
      return res.status(404).json({ message: "Scene not found" });
    }

    const dialogueLines = await audioGenerationService.generateAllSceneDialogues(sceneId, {
      provider,
      effect,
      forceRegenerate: Boolean(forceRegenerate),
    });

    return res.json({
      success: true,
      sceneId,
      dialogueLines,
    });
  } catch (error: any) {
    console.error(`[Content] Failed to batch generate dialogue audio for scene ${req.params.sceneId}:`, error);
    return res.status(500).json({ message: error.message || "Failed to batch generate dialogue audio" });
  }
});

// Batch generate dialogue audio for all scenes across an entire story
contentRouter.post("/stories/:storyId/dialogue/generate-all", async (req, res) => {
  try {
    const { storyId } = req.params;
    const { provider, effect, forceRegenerate } = req.body || {};

    const results = await audioGenerationService.generateAllStoryDialogues(storyId, {
      provider,
      effect,
      forceRegenerate: Boolean(forceRegenerate),
    });

    return res.json({
      success: true,
      storyId,
      results,
    });
  } catch (error: any) {
    console.error(`[Content] Failed to batch generate dialogue audio for story ${req.params.storyId}:`, error);
    return res.status(500).json({ message: error.message || "Failed to batch generate story dialogue audio" });
  }
});

// Regenerate dialogue audio for a specific character in a scene
contentRouter.post("/scenes/:sceneId/characters/:characterId/regenerate-dialogue", async (req, res) => {
  try {
    const { sceneId, characterId } = req.params;
    const { provider } = req.body || {};
    const scene = await getSceneBySceneId(sceneId);
    if (!scene) {
      return res.status(404).json({ message: "Scene not found" });
    }

    const dialogueLines = await audioGenerationService.regenerateCharacterDialogueInScene(
      sceneId,
      characterId,
      { provider }
    );

    return res.json({
      success: true,
      sceneId,
      characterId,
      dialogueLines,
    });
  } catch (error: any) {
    console.error(`[Content] Failed to regenerate dialogue audio for character ${req.params.characterId} in scene ${req.params.sceneId}:`, error);
    return res.status(500).json({ message: error.message || "Failed to regenerate character dialogue audio" });
  }
});

// Delete a dialogue line from a scene
contentRouter.delete("/scenes/:sceneId/dialogue/:dialogueId", async (req, res) => {
  try {
    const { sceneId, dialogueId } = req.params;
    const scene = await getSceneBySceneId(sceneId);
    if (!scene) {
      return res.status(404).json({ message: "Scene not found" });
    }

    if ((scene as any).animationData?.dialogueLines) {
      const animData = (scene as any).animationData;
      const filtered = animData.dialogueLines.filter((d: any) => d.id !== dialogueId);
      await updateScene(scene.sceneId, {
        animationData: {
          ...animData,
          dialogueLines: filtered,
        },
      });
    }

    return res.json({ success: true, sceneId, dialogueId });
  } catch (error: any) {
    console.error(`[Content] Failed to delete dialogue line for scene ${req.params.sceneId}:`, error);
    return res.status(500).json({ message: error.message || "Failed to delete dialogue line" });
  }
});

// Upload audio endpoint (music soundtrack, narration, sound effect)
contentRouter.post("/audio/upload", async (req, res) => {
  try {
    const { filename, fileData, category = 'music' } = req.body;
    if (!filename || !fileData) {
      return res.status(400).json({ message: "filename and fileData (base64) are required" });
    }

    const result = await audioGenerationService.saveUploadedAudio({
      filename,
      base64Data: fileData,
      category,
    });

    return res.json({
      success: true,
      audio: result,
    });
  } catch (error: any) {
    console.error("[Content] Failed to upload audio:", error);
    return res.status(500).json({ message: error.message || "Failed to upload audio" });
  }
});

// List available soundtrack music presets and uploaded tracks
contentRouter.get("/music/tracks", async (req, res) => {
  try {
    const musicDir = path.join(process.cwd(), process.env.STORAGE_DIR || "./storage", "music");
    const tracks: Array<{ id: string; label: string; url?: string; durationMs?: number; isCustom?: boolean }> = [
      { id: "gentle-storybook", label: "Gentle Storybook (Calm & Warm)", url: "/storage/music/gentle-storybook.mp3" },
      { id: "playful-adventure", label: "Playful Adventure (Upbeat & Cheerful)", url: "/storage/music/playful-adventure.mp3" },
      { id: "whimsical-forest", label: "Whimsical Forest (Magical & Light)", url: "/storage/music/whimsical-forest.mp3" },
      { id: "none", label: "No Background Music (Voice Only)" },
    ];

    if (fs.existsSync(musicDir)) {
      const files = await fs.promises.readdir(musicDir);
      for (const file of files) {
        if (file.startsWith("upload-") && (file.endsWith(".mp3") || file.endsWith(".wav") || file.endsWith(".m4a"))) {
          const trackUrl = `/storage/music/${file}`;
          const cleanName = file.replace(/^upload-\d+-/, "").replace(/\.[^.]+$/, "");
          tracks.push({
            id: trackUrl,
            label: `Custom: ${cleanName}`,
            url: trackUrl,
            isCustom: true,
          });
        }
      }
    }

    return res.json(tracks);
  } catch (error: any) {
    console.error("[Content] Failed to list music tracks:", error);
    return res.status(500).json({ message: "Failed to list music tracks" });
  }
});

contentRouter.delete("/scenes/:sceneId", async (req, res) => {
  try {
    const { sceneId } = req.params;

    await deleteScene(sceneId);

    return res.json({ success: true });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Failed to delete scene" });
  }
});

contentRouter.post("/scenes/:sceneId/restore", async (req, res) => {
  try {
    const { sceneId } = req.params;

    const restoredScene = await restoreScene(sceneId);

    return res.json(restoredScene);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Failed to restore scene" });
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

    // Fetch characters with full details including canonical appearance and reference image
    let enhancedCharacters = characters;
    if (storyId && characters.length > 0) {
      const linkedCharacters = await getCharactersByStoryId(storyId);
      enhancedCharacters = characters.map((char: any) => {
        const fullCharacter = linkedCharacters.find((c: any) => c.id === char.id);
        if (fullCharacter) {
          return {
            name: fullCharacter.name,
            species: fullCharacter.species,
            personality: fullCharacter.personality,
            description: fullCharacter.visualDescription,
            canonicalAppearance: fullCharacter.canonicalAppearance,
            referenceImageUrl: fullCharacter.referenceImageUrl,
          };
        }
        return char;
      });
    }

    console.log(`[Content] Using ${enhancedCharacters.length} characters for scene generation`);
    enhancedCharacters.forEach((char: any) => {
      console.log(`[Content] Character: ${char.name}, hasReferenceImage: ${!!char.referenceImageUrl}, hasCanonicalAppearance: ${!!char.canonicalAppearance}`);
    });

    // Build image prompt from custom prompt or scene's existing data
    const customPrompt = req.body.prompt;
    const prompt = (customPrompt && typeof customPrompt === "string" && customPrompt.trim().length > 0)
      ? customPrompt.trim()
      : buildSceneImagePrompt(
          {
            description: sceneDescription,
            title: sceneTitle,
            narration: scene ? scene.narration : description,
          },
          enhancedCharacters,
        );

    console.log(`[Content] Generated prompt for scene ${sceneId}:`);
    console.log(prompt);

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

    // Update scene record with latest imageUrl and visualPrompt
    await updateScene(sceneId, {
      imageUrl: url,
      visualPrompt: prompt,
      generationStatus: "completed",
    });

    // Record scene version
    await createSceneVersion({
      id: randomUUID(),
      sceneId,
      prompt,
      imageUrl: url,
      cameraDirection: scene?.cameraDirection,
      narration: scene?.narration,
      durationMs: scene && scene.endMs > scene.startMs ? scene.endMs - scene.startMs : undefined,
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

// =========================================================================
// Scene Background Management Routes (Phase 1)
// =========================================================================

/**
 * Validates image buffer using magic bytes and length.
 */
function validateImageBuffer(buffer: Buffer): { valid: boolean; mimeType?: string; ext?: string; error?: string } {
  if (!buffer || buffer.length < 8) {
    return { valid: false, error: 'File is empty or too small to be a valid image' };
  }
  const MAX_SIZE = 15 * 1024 * 1024; // 15MB limit
  if (buffer.length > MAX_SIZE) {
    return { valid: false, error: `Image file exceeds maximum allowed size of 15MB (${(buffer.length / (1024 * 1024)).toFixed(1)}MB)` };
  }

  // PNG magic bytes: 89 50 4E 47 0D 0A 1A 0A
  const isPng =
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47 &&
    buffer[4] === 0x0d &&
    buffer[5] === 0x0a &&
    buffer[6] === 0x1a &&
    buffer[7] === 0x0a;

  // JPEG magic bytes: FF D8 FF
  const isJpeg =
    buffer[0] === 0xff &&
    buffer[1] === 0xd8 &&
    buffer[2] === 0xff;

  if (isPng) {
    return { valid: true, mimeType: 'image/png', ext: 'png' };
  }
  if (isJpeg) {
    return { valid: true, mimeType: 'image/jpeg', ext: 'jpg' };
  }

  return { valid: false, error: 'Only valid PNG and JPEG image formats are supported' };
}

// 1. Upload a scene background image
contentRouter.post("/scenes/:sceneId/background/upload", async (req, res) => {
  try {
    const { sceneId } = req.params;
    const { data, fileData, image, filename: clientFilename, fit: rawFit } = req.body;

    const base64Input = data || fileData || image;
    if (!base64Input || typeof base64Input !== 'string') {
      return res.status(400).json({ message: "Image data (base64 string or data URI) is required" });
    }

    const scene = await getSceneBySceneId(sceneId);
    if (!scene) {
      return res.status(404).json({ message: `Scene not found: ${sceneId}` });
    }

    // Strip data URI prefix if present
    const cleanBase64 = base64Input.replace(/^data:image\/[a-zA-Z0-9.+_-]+;base64,/, '');
    const buffer = Buffer.from(cleanBase64, 'base64');

    const validation = validateImageBuffer(buffer);
    if (!validation.valid || !validation.mimeType || !validation.ext) {
      return res.status(400).json({ message: validation.error || "Invalid image file" });
    }

    const fit: 'cover' | 'contain' = rawFit === 'contain' ? 'contain' : 'cover';
    const timestamp = Date.now();
    const storageFilename = `bg-${scene.storyId}-${scene.sceneId}-${timestamp}-${randomUUID().slice(0, 6)}.${validation.ext}`;

    const { url } = await storageService.saveFile(buffer, storageFilename, validation.mimeType);

    // Synchronize scene.imageUrl and scene.animationData.background
    const currentAnim = (scene.animationData || {}) as any;
    const updatedAnimData = {
      ...currentAnim,
      background: {
        imageUrl: url,
        fit,
      },
    };

    const updatedScene = await updateScene(scene.sceneId, {
      imageUrl: url,
      animationData: updatedAnimData,
    });

    // Create record in Image table so it is tracked in story images
    const imageId = randomUUID();
    await createImage({
      id: imageId,
      sceneId: scene.sceneId,
      provider: 'upload',
      model: 'user',
      prompt: clientFilename ? `User upload: ${clientFilename}` : 'Uploaded scene background',
      storageKey: storageFilename,
      imageUrl: url,
      width: 1280,
      height: 720,
      status: 'completed',
    });

    // Create scene version for history tracking
    await createSceneVersion({
      id: randomUUID(),
      sceneId: scene.sceneId,
      prompt: `Background uploaded: ${clientFilename || storageFilename} (fit: ${fit})`,
      imageUrl: url,
      cameraDirection: scene.cameraDirection,
      narration: scene.narration,
    });

    return res.json({
      success: true,
      sceneId: scene.sceneId,
      background: {
        imageUrl: url,
        fit,
      },
      scene: updatedScene,
    });
  } catch (error: any) {
    console.error("[Content] Failed to upload scene background:", error);
    return res.status(500).json({ message: error.message || "Failed to upload scene background" });
  }
});

// 2. Assign existing image or update background fit mode
contentRouter.put("/scenes/:sceneId/background", async (req, res) => {
  try {
    const { sceneId } = req.params;
    const { imageUrl, fit: rawFit } = req.body;

    const scene = await getSceneBySceneId(sceneId);
    if (!scene) {
      return res.status(404).json({ message: `Scene not found: ${sceneId}` });
    }

    const currentAnim = (scene.animationData || {}) as any;
    const currentBgUrl = currentAnim.background?.imageUrl || scene.imageUrl;

    const targetUrl = imageUrl || currentBgUrl;
    if (!targetUrl) {
      return res.status(400).json({ message: "imageUrl is required when no existing background is present" });
    }

    // Validate URL format (must be relative /storage/ or absolute http/https)
    if (typeof targetUrl !== 'string' || (!targetUrl.startsWith('/storage/') && !targetUrl.startsWith('http://') && !targetUrl.startsWith('https://'))) {
      return res.status(400).json({ message: "Invalid image URL format" });
    }

    // If local storage URL, ensure file exists on disk
    if (targetUrl.startsWith('/storage/')) {
      const localPath = path.join(process.cwd(), targetUrl.replace(/^\//, ''));
      if (!fs.existsSync(localPath)) {
        return res.status(400).json({ message: "Specified background image does not exist on server storage" });
      }
    }

    const fit: 'cover' | 'contain' = rawFit === 'contain' ? 'contain' : (rawFit === 'cover' ? 'cover' : (currentAnim.background?.fit || 'cover'));

    const updatedAnimData = {
      ...currentAnim,
      background: {
        imageUrl: targetUrl,
        fit,
      },
    };

    const updatedScene = await updateScene(scene.sceneId, {
      imageUrl: targetUrl,
      animationData: updatedAnimData,
    });

    return res.json({
      success: true,
      sceneId: scene.sceneId,
      background: {
        imageUrl: targetUrl,
        fit,
      },
      scene: updatedScene,
    });
  } catch (error: any) {
    console.error("[Content] Failed to update scene background:", error);
    return res.status(500).json({ message: error.message || "Failed to update scene background" });
  }
});

// 3. Remove scene background and restore default stage
contentRouter.delete("/scenes/:sceneId/background", async (req, res) => {
  try {
    const { sceneId } = req.params;

    const scene = await getSceneBySceneId(sceneId);
    if (!scene) {
      return res.status(404).json({ message: `Scene not found: ${sceneId}` });
    }

    const currentAnim = (scene.animationData || {}) as any;
    const { background: _removed, ...restAnim } = currentAnim;

    const updatedScene = await updateScene(scene.sceneId, {
      imageUrl: null,
      animationData: restAnim,
    });

    return res.json({
      success: true,
      sceneId: scene.sceneId,
      message: "Background removed. Default stage restored.",
      scene: updatedScene,
    });
  } catch (error: any) {
    console.error("[Content] Failed to remove scene background:", error);
    return res.status(500).json({ message: error.message || "Failed to remove scene background" });
  }
});

// 4. List all available backgrounds across scenes in a story
contentRouter.get("/story/:storyId/backgrounds", async (req, res) => {
  try {
    const { storyId } = req.params;
    const scenes = await getScenesByStoryId(storyId, false);

    const backgroundsMap = new Map<string, { imageUrl: string; sceneId: string; sceneTitle: string; sceneNumber?: number; prompt?: string; createdAt?: Date }>();

    for (const sc of scenes) {
      // Check animationData background
      const animBg = (sc.animationData as any)?.background?.imageUrl;
      if (animBg && !backgroundsMap.has(animBg)) {
        backgroundsMap.set(animBg, {
          imageUrl: animBg,
          sceneId: sc.sceneId,
          sceneTitle: sc.title || `Scene ${sc.number}`,
          sceneNumber: sc.number,
          prompt: sc.visualPrompt || sc.narration || undefined,
        });
      }

      // Check scene.imageUrl
      if (sc.imageUrl && !backgroundsMap.has(sc.imageUrl)) {
        backgroundsMap.set(sc.imageUrl, {
          imageUrl: sc.imageUrl,
          sceneId: sc.sceneId,
          sceneTitle: sc.title || `Scene ${sc.number}`,
          sceneNumber: sc.number,
          prompt: sc.visualPrompt || sc.narration || undefined,
        });
      }

      // Check scene versions
      if (Array.isArray(sc.versions)) {
        for (const ver of sc.versions) {
          if (ver.imageUrl && !backgroundsMap.has(ver.imageUrl)) {
            backgroundsMap.set(ver.imageUrl, {
              imageUrl: ver.imageUrl,
              sceneId: sc.sceneId,
              sceneTitle: sc.title || `Scene ${sc.number}`,
              sceneNumber: sc.number,
              prompt: ver.prompt || undefined,
              createdAt: ver.createdAt,
            });
          }
        }
      }
    }

    return res.json({
      success: true,
      backgrounds: Array.from(backgroundsMap.values()),
    });
  } catch (error: any) {
    console.error("[Content] Failed to list story backgrounds:", error);
    return res.status(500).json({ message: error.message || "Failed to list story backgrounds" });
  }
});

