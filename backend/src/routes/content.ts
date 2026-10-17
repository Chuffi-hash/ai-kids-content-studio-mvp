import { Router } from "express";
import fs from "fs";
import path from "path";
import { generateStory } from "../services/story.service.js";
import { generateScenes } from "../services/scene.service.js";
import { StoryGenerationService } from "../services/story-generation/story-generation.service.js";
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
      language: language || "English",
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
      language: language || "English",
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
    const { voice, provider, speed, effect, sampleText, lang } = req.body;
    const result = await audioGenerationService.previewVoice({
      voice,
      provider,
      speed: speed ? parseFloat(speed) : undefined,
      effect,
      sampleText,
      lang,
    });
    return res.json({ success: true, ...result });
  } catch (error: any) {
    console.error("[Content] Voice preview failed:", error);
    return res.status(500).json({ message: error.message || "Failed to generate voice preview" });
  }
});

// Real voice / narration generation endpoint
contentRouter.post("/scenes/:sceneId/voice", async (req, res) => {
  try {
    const { sceneId } = req.params;
    const { narration, lang, provider, voice, speed, effect } = req.body;

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
      lang: lang || "en",
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
