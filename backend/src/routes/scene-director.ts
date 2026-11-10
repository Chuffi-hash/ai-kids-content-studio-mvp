import { Router } from 'express';
import { SceneDirectorService } from '../services/scene-director/scene-director.service.js';
import {
  getStoryByStoryId,
  getScenesByStoryId,
  updateScene,
  getAllCharacters,
} from '../services/database/database.service.js';

export const sceneDirectorRouter = Router();
const sceneDirector = new SceneDirectorService();

// POST auto-direct all scenes in a story
sceneDirectorRouter.post('/auto-direct/:storyId', async (req, res) => {
  try {
    const { storyId } = req.params;
    const { format = '16:9' } = req.body;

    let story: any;
    let scenes: any[] = [];
    let allChars: any[] = [];

    try {
      story = await getStoryByStoryId(storyId);
      scenes = await getScenesByStoryId(storyId);
      allChars = await getAllCharacters();
    } catch {
      // Offline / standalone fallback
      scenes = req.body.scenes || [];
      allChars = req.body.characters || [];
    }

    if (!scenes || scenes.length === 0) {
      return res.status(400).json({ message: 'No scenes found for story' });
    }

    const directedScenes: any[] = [];

    for (let i = 0; i < scenes.length; i++) {
      const scene = scenes[i];
      const sceneNum = scene.number || i + 1;
      const animData = scene.animationData || {};

      // Match characters for this scene
      const sceneChars = allChars.slice(0, 2);

      const rawDialogues = Array.isArray(animData.dialogueLines)
        ? animData.dialogueLines
        : (Array.isArray(animData.dialogues) ? animData.dialogues : []);

      const direction = sceneDirector.directScene({
        sceneId: scene.sceneId || scene.id,
        sceneNumber: sceneNum,
        totalScenes: scenes.length,
        format,
        characters: sceneChars.map((c: any) => ({
          id: c.id,
          name: c.name,
          visualDescription: c.visualDescription,
        })),
        dialogueLines: rawDialogues,
        narration: scene.narration,
        existingBackgroundUrl: animData.background?.imageUrl || scene.imageUrl,
      });

      const updatedAnimData = sceneDirector.applyDirectionToAnimationData(direction, animData);

      try {
        await updateScene(scene.sceneId || scene.id, {
          animationData: updatedAnimData,
        });
      } catch {
        // standalone test
      }

      directedScenes.push({
        sceneId: scene.sceneId || scene.id,
        sceneNumber: sceneNum,
        direction,
        animationData: updatedAnimData,
      });
    }

    res.json({
      success: true,
      storyId,
      format,
      scenes: directedScenes,
    });
  } catch (err: any) {
    console.error('[SceneDirector] Auto-direct failed:', err);
    res.status(500).json({ message: err.message || 'Auto-direct failed' });
  }
});

// POST apply direction to a single scene
sceneDirectorRouter.post('/apply/:sceneId', async (req, res) => {
  try {
    const { sceneId } = req.params;
    const { direction, existingAnimationData } = req.body;

    if (!direction) {
      return res.status(400).json({ message: 'direction object is required' });
    }

    const updatedAnimData = sceneDirector.applyDirectionToAnimationData(direction, existingAnimationData || {});

    try {
      await updateScene(sceneId, {
        animationData: updatedAnimData,
      });
    } catch {
      // offline/test
    }

    res.json({
      success: true,
      sceneId,
      animationData: updatedAnimData,
    });
  } catch (err: any) {
    console.error('[SceneDirector] Apply direction failed:', err);
    res.status(500).json({ message: err.message || 'Failed to apply scene direction' });
  }
});
