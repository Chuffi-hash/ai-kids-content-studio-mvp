import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

import fs from 'fs';
import { randomUUID } from 'crypto';
import { createStory, createScene, deleteStory } from '../src/services/database/database.service.js';
import { VideoAssemblyService } from '../src/services/video-assembly/video-assembly.service.js';
import { AudioGenerationService } from '../src/services/audio-generation/audio-generation.service.js';
import { LocalStorageService } from '../src/services/storage/local-storage.service.js';
// @ts-ignore
import ffprobeStatic from '@ffprobe-installer/ffprobe';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { VectorSceneData } from '../src/services/animation/vector-animation.engine.js';

const execFileAsync = promisify(execFile);

// Valid 1x1 PNG
const VALID_1X1_PNG = Buffer.from(
  '89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000a49444154789c63000100000500010d0a2d420000000049454e44ae426082',
  'hex'
);

async function verifySceneBackgroundExport() {
  console.log('=== [E2E] Verifying Scene Background + Vector Characters MP4 Export ===');

  const testStoryId = `story-bg-export-${Date.now()}`;
  const testSceneId = `scene-bg-export-${Date.now()}`;
  const storageService = new LocalStorageService();

  try {
    // 1. Save a background image to storage
    const bgFilename = `test-bg-${Date.now()}.png`;
    const savedBgResult = await storageService.saveFile(VALID_1X1_PNG, bgFilename, 'image/png');
    const savedBgUrl = savedBgResult.url;
    console.log('✓ Saved test background image:', savedBgUrl);

    // 2. Create test story in DB
    const story = await createStory({
      storyId: testStoryId,
      title: 'Scene Background MP4 Export Verification',
      logline: 'Verifying that custom backgrounds render seamlessly behind vector characters in MP4 export.',
      targetDuration: 15,
    });
    console.log('✓ Created test story:', story.storyId);

    // 3. Generate short speech audio
    const audioService = new AudioGenerationService();
    const narrationText = 'Welcome to the beautiful sunny meadow with lush green grass.';
    const ttsResult = await audioService.generateNarrationAudio({
      sceneId: testSceneId,
      narration: narrationText,
      lang: 'en',
    });
    console.log('✓ TTS Narration generated:', ttsResult.audioUrl, `(${ttsResult.durationMs}ms)`);

    // 4. Construct Vector Scene Data with custom background AND vector character instance
    const sceneDuration = Math.max(3000, Math.ceil(ttsResult.durationMs / 1000) * 1000);
    const animationData: VectorSceneData = {
      version: 1,
      viewport: { width: 1280, height: 720 },
      background: {
        imageUrl: savedBgUrl,
        fit: 'cover',
      },
      characterInstances: [
        {
          instanceId: 'char-sammy-export',
          characterId: 'sammy_the_kid',
          x: 400,
          y: 480,
          scale: 1.0,
          rotation: 0,
          flipX: false,
          zIndex: 1,
        },
      ],
      animationClips: [
        {
          clipId: 'clip-wave-01',
          instanceId: 'char-sammy-export',
          action: 'wave',
          startMs: 0,
          durationMs: sceneDuration,
          loop: true,
          motionMode: 'in_place',
        },
      ],
    };

    // 5. Create Scene in DB
    const scene = await createScene({
      id: testSceneId,
      sceneId: testSceneId,
      storyId: story.storyId,
      number: 1,
      order: 1,
      title: 'Scene 1: Sunny Meadow',
      narration: narrationText,
      startMs: 0,
      endMs: sceneDuration,
      estimatedDurationMs: sceneDuration,
      actualAudioDurationMs: ttsResult.durationMs,
      audioUrl: ttsResult.audioUrl,
      imageUrl: savedBgUrl,
      animationData,
    });
    console.log('✓ Created scene in database with background & character:', scene.sceneId);

    // 6. Run Video Assembly Export
    const assemblyService = new VideoAssemblyService();
    console.log('Starting Video Assembly Export Job...');
    const job = assemblyService.startExportJob({
      storyId: story.storyId,
      resolution: '720p',
      fps: 30,
    });

    console.log('Export Job ID:', job.id);

    // Poll until complete
    let pollCount = 0;
    while (true) {
      await new Promise((r) => setTimeout(r, 1000));
      pollCount++;
      const current = assemblyService.getJob(job.id);
      if (!current) throw new Error('Job disappeared from tracker');

      if (current.status === 'completed') {
        console.log('✓ Export job completed!');
        console.log('Download URL:', current.downloadUrl);
        console.log('Filename:', current.filename);

        // 7. Verify exported file exists and probe with ffprobe
        const finalPath = path.resolve(process.cwd(), '.' + current.downloadUrl);
        if (!fs.existsSync(finalPath)) {
          throw new Error(`Exported MP4 file not found on disk at: ${finalPath}`);
        }

        const stat = fs.statSync(finalPath);
        console.log(`✓ MP4 file size: ${(stat.size / 1024).toFixed(1)} KB`);

        const ffprobePath = ffprobeStatic?.path || 'ffprobe';
        const { stdout } = await execFileAsync(ffprobePath, [
          '-v', 'error',
          '-show_entries', 'format=duration:stream=codec_type,codec_name',
          '-of', 'json',
          finalPath,
        ]);
        const probe = JSON.parse(stdout);
        const hasVideo = probe.streams?.some((s: any) => s.codec_type === 'video' && s.codec_name === 'h264');
        const hasAudio = probe.streams?.some((s: any) => s.codec_type === 'audio' && s.codec_name === 'aac');
        const durationSec = Number.parseFloat(probe.format?.duration || '0');

        console.log('FFprobe streams:', probe.streams?.map((s: any) => `${s.codec_type}:${s.codec_name}`).join(', '));
        console.log('FFprobe duration:', durationSec, 'seconds');

        if (!hasVideo) throw new Error('Exported video is missing H.264 stream');
        if (!hasAudio) throw new Error('Exported video is missing AAC audio stream');
        if (durationSec <= 0) throw new Error('Exported video has invalid duration');

        console.log('✓ E2E Export Verification PASSED! Background & vector character successfully assembled into playable MP4.');
        break;
      }

      if (current.status === 'failed') {
        throw new Error(`Export job failed: ${current.error}`);
      }

      if (pollCount > 120) {
        throw new Error('Export job timed out after 120 seconds');
      }
    }
  } finally {
    // Cleanup test story
    try {
      await deleteStory(testStoryId);
      console.log('✓ Cleaned up test story');
    } catch {
      // ignore
    }
  }
}

verifySceneBackgroundExport()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('❌ E2E Export Verification Failed:', err);
    process.exit(1);
  });
