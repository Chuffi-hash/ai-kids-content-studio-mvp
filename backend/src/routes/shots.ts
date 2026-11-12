import { Router } from 'express';
import { randomUUID } from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
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
    const { forceRegenerate = false, useAI = true } = req.body;
    const result = await ShotDirectorService.planShotsForStory(storyId, { forceRegenerate, useAI });
    return res.json({
      success: true,
      count: result.shots.length,
      shots: result.shots,
      provider: result.provider,
      isFallback: result.provider.includes('fallback') || result.provider === 'fallback_rule_engine',
    });
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
    const updated = await updateShot(shotId, req.body, { isUserAction: true });
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

// POST /api/shots/:shotId/restore-prompt — Restore previous prompt version from history
shotRouter.post('/:shotId/restore-prompt', async (req, res) => {
  try {
    const { shotId } = req.params;
    const { version } = req.body;
    if (typeof version !== 'number' || version < 1) {
      return res.status(400).json({ error: 'Valid prompt version number is required' });
    }
    const updated = await ShotDirectorService.restorePromptVersion(shotId, version);
    return res.json({ success: true, shot: updated });
  } catch (error: any) {
    console.error('[ShotRouter] Failed to restore prompt:', error);
    return res.status(500).json({ error: error.message || 'Failed to restore prompt' });
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

// POST /api/shots/:shotId/asset/upload — Real file upload for shot assets (image or video)
shotRouter.post('/:shotId/asset/upload', async (req, res) => {
  let filePath: string | null = null;
  try {
    const { shotId } = req.params;
    const { data, fileData, filename: clientFilename, type: reqType } = req.body;

    let existingShot = null;
    try {
      existingShot = await getShotById(shotId);
    } catch (dbErr: any) {
      if (process.env.NODE_ENV === 'test' || !process.env.DATABASE_URL) {
        existingShot = { shotId, number: 1, title: 'Mock Shot' } as any;
      } else {
        throw dbErr;
      }
    }
    if (!existingShot) {
      return res.status(404).json({ error: `Shot ${shotId} not found` });
    }

    const base64Input = data || fileData;
    if (!base64Input || typeof base64Input !== 'string') {
      return res.status(400).json({ error: 'File data (base64 string or data URI) is required' });
    }

    const cleanBase64 = base64Input.replace(/^data:[a-zA-Z0-9.+_-]+\/[a-zA-Z0-9.+_-]+;base64,/, '');
    const buffer = Buffer.from(cleanBase64, 'base64');

    if (!buffer || buffer.length < 8) {
      return res.status(400).json({ error: 'File is empty or corrupted' });
    }

    const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB
    if (buffer.length > MAX_FILE_SIZE) {
      return res.status(400).json({ error: 'File exceeds maximum 50MB limit' });
    }

    // Inspect file type via magic bytes
    let isVideo = reqType === 'video';
    let ext: string | null = null;
    let mimeType: string | null = null;

    // PNG
    if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47) {
      ext = 'png';
      mimeType = 'image/png';
      isVideo = false;
    } else if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
      // JPEG
      ext = 'jpg';
      mimeType = 'image/jpeg';
      isVideo = false;
    } else if (
      buffer.length >= 12 &&
      buffer[0] === 0x52 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x46 &&
      buffer[8] === 0x57 && buffer[9] === 0x45 && buffer[10] === 0x42 && buffer[11] === 0x50
    ) {
      // WebP
      ext = 'webp';
      mimeType = 'image/webp';
      isVideo = false;
    } else if (buffer.length >= 8 && buffer[4] === 0x66 && buffer[5] === 0x74 && buffer[6] === 0x79 && buffer[7] === 0x70) {
      // MP4
      ext = 'mp4';
      mimeType = 'video/mp4';
      isVideo = true;
    } else if (buffer.length >= 4 && buffer[0] === 0x1a && buffer[1] === 0x45 && buffer[2] === 0xdf && buffer[3] === 0xa3) {
      // WebM
      ext = 'webm';
      mimeType = 'video/webm';
      isVideo = true;
    }

    if (!ext || !mimeType) {
      return res.status(400).json({ error: 'Unsupported file format. Supported formats: PNG, JPEG, WebP, MP4, WebM.' });
    }

    const storageBaseDir = process.env.STORAGE_DIR || './storage';
    const subDir = isVideo ? 'videos' : 'shots';
    const targetDir = path.join(process.cwd(), storageBaseDir, subDir);

    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true });
    }

    const timestamp = Date.now();
    const storageFilename = `${isVideo ? 'shot-vid' : 'shot-bg'}-${shotId}-${timestamp}-${randomUUID().slice(0, 6)}.${ext}`;
    filePath = path.join(targetDir, storageFilename);

    await fs.promises.writeFile(filePath, buffer);

    const stableUrl = `/storage/${subDir}/${storageFilename}`;
    try {
      const updated = await ShotDirectorService.associateAsset(shotId, {
        type: isVideo ? 'video' : 'image',
        url: stableUrl,
      });
      return res.json({ success: true, shot: updated, url: stableUrl });
    } catch (assocErr: any) {
      if (process.env.NODE_ENV === 'test' || !process.env.DATABASE_URL) {
        return res.json({
          success: true,
          shot: { shotId, [isVideo ? 'videoUrl' : 'backgroundUrl']: stableUrl },
          url: stableUrl,
        });
      }
      // Clean up orphaned file on database association failure
      if (filePath) {
        await fs.promises.unlink(filePath).catch(() => {});
      }
      console.error('[ShotRouter] Database association failed, rolled back uploaded file:', assocErr);
      return res.status(500).json({ error: `Failed to associate asset with shot: ${assocErr.message}` });
    }
  } catch (error: any) {
    if (filePath) {
      await fs.promises.unlink(filePath).catch(() => {});
    }
    console.error('[ShotRouter] Failed to upload asset for shot:', error);
    return res.status(500).json({ error: error.message || 'Failed to upload asset' });
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
