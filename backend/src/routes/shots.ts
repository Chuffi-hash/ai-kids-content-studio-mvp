import { Router } from 'express';
import { ShotDirectorService } from '../services/scene-director/shot-director.service.js';
import {
  getShotsByStoryId,
  getShotsBySceneId,
  getShotById,
  updateShot,
  deleteShot,
} from '../services/database/database.service.js';

export const shotRouter = Router();

// POST /api/shots/story/:storyId/plan — Plan or regenerate multi-shot breakdowns for a story
shotRouter.post('/story/:storyId/plan', async (req, res) => {
  try {
    const { storyId } = req.params;
    const { forceRegenerate = false } = req.body;
    const shots = await ShotDirectorService.planShotsForStory(storyId, { forceRegenerate });
    return res.json({ success: true, count: shots.length, shots });
  } catch (error: any) {
    console.error('[ShotRouter] Failed to plan shots for story:', error);
    return res.status(500).json({ error: error.message || 'Failed to plan shots' });
  }
});

// GET /api/shots/story/:storyId — Fetch all shots for a story
shotRouter.get('/story/:storyId', async (req, res) => {
  try {
    const { storyId } = req.params;
    const records = await getShotsByStoryId(storyId);
    const shots = records.map(ShotDirectorService.mapPrismaRecordToShotData);
    return res.json({ success: true, count: shots.length, shots });
  } catch (error: any) {
    console.error('[ShotRouter] Failed to get shots for story:', error);
    return res.status(500).json({ error: error.message || 'Failed to get shots' });
  }
});

// GET /api/shots/scene/:sceneId — Fetch all shots for a single scene
shotRouter.get('/scene/:sceneId', async (req, res) => {
  try {
    const { sceneId } = req.params;
    const records = await getShotsBySceneId(sceneId);
    const shots = records.map(ShotDirectorService.mapPrismaRecordToShotData);
    return res.json({ success: true, count: shots.length, shots });
  } catch (error: any) {
    console.error('[ShotRouter] Failed to get shots for scene:', error);
    return res.status(500).json({ error: error.message || 'Failed to get shots' });
  }
});

// GET /api/shots/:shotId — Fetch a single shot
shotRouter.get('/:shotId', async (req, res) => {
  try {
    const { shotId } = req.params;
    const record = await getShotById(shotId);
    if (!record) {
      return res.status(404).json({ error: `Shot ${shotId} not found` });
    }
    return res.json({ success: true, shot: ShotDirectorService.mapPrismaRecordToShotData(record) });
  } catch (error: any) {
    console.error('[ShotRouter] Failed to get shot:', error);
    return res.status(500).json({ error: error.message || 'Failed to get shot' });
  }
});

// PATCH /api/shots/:shotId — Update shot details, framing, duration, or staging
shotRouter.patch('/:shotId', async (req, res) => {
  try {
    const { shotId } = req.params;
    const updated = await updateShot(shotId, req.body);
    return res.json({ success: true, shot: ShotDirectorService.mapPrismaRecordToShotData(updated) });
  } catch (error: any) {
    console.error('[ShotRouter] Failed to update shot:', error);
    return res.status(500).json({ error: error.message || 'Failed to update shot' });
  }
});

// POST /api/shots/:shotId/regenerate-prompt — Regenerate prompt version with history
shotRouter.post('/:shotId/regenerate-prompt', async (req, res) => {
  try {
    const { shotId } = req.params;
    const { type = 'background', instructions } = req.body;
    const updated = await ShotDirectorService.regenerateShotPrompt(shotId, type, instructions);
    return res.json({ success: true, shot: updated });
  } catch (error: any) {
    console.error('[ShotRouter] Failed to regenerate prompt:', error);
    return res.status(500).json({ error: error.message || 'Failed to regenerate prompt' });
  }
});

// POST /api/shots/:shotId/approve — Approve shot
shotRouter.post('/:shotId/approve', async (req, res) => {
  try {
    const { shotId } = req.params;
    const updated = await ShotDirectorService.approveShot(shotId);
    return res.json({ success: true, shot: updated });
  } catch (error: any) {
    console.error('[ShotRouter] Failed to approve shot:', error);
    return res.status(500).json({ error: error.message || 'Failed to approve shot' });
  }
});

// POST /api/shots/:shotId/asset — Associate imported or generated image/video asset
shotRouter.post('/:shotId/asset', async (req, res) => {
  try {
    const { shotId } = req.params;
    const { type, url } = req.body;
    if (!type || !url) {
      return res.status(400).json({ error: 'Asset type and url are required' });
    }
    const updated = await ShotDirectorService.associateAsset(shotId, { type, url });
    return res.json({ success: true, shot: updated });
  } catch (error: any) {
    console.error('[ShotRouter] Failed to associate asset with shot:', error);
    return res.status(500).json({ error: error.message || 'Failed to associate asset' });
  }
});

// DELETE /api/shots/:shotId — Delete a shot
shotRouter.delete('/:shotId', async (req, res) => {
  try {
    const { shotId } = req.params;
    await deleteShot(shotId);
    return res.json({ success: true, message: `Shot ${shotId} deleted` });
  } catch (error: any) {
    console.error('[ShotRouter] Failed to delete shot:', error);
    return res.status(500).json({ error: error.message || 'Failed to delete shot' });
  }
});
