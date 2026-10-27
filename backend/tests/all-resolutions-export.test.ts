import test from 'node:test';
import assert from 'node:assert/strict';
import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

import fs from 'fs';
import { promisify } from 'util';
import { execFile } from 'child_process';
// @ts-ignore
import ffmpegStatic from '@ffmpeg-installer/ffmpeg';
// @ts-ignore
import ffprobeStatic from '@ffprobe-installer/ffprobe';

import {
  createStory,
  createScene,
  deleteStory,
  prisma,
} from '../src/services/database/database.service.js';
import { VideoAssemblyService } from '../src/services/video-assembly/video-assembly.service.js';
import { VectorSceneData } from '../src/services/animation/vector-animation.engine.js';

const execFileAsync = promisify(execFile);
const ffmpegPath = (ffmpegStatic as any).path || 'ffmpeg';
const ffprobePath = (ffprobeStatic as any).path || 'ffprobe';

test('Video Assembly Export - All Resolutions & Aspect Ratios Verification', async (t) => {
  const videoAssembly = new VideoAssemblyService();
  const testStoryId = `story-export-res-${Date.now()}`;
  const testSceneId = `scene-export-res-${Date.now()}`;

  // Create temporary audio files for narration and character dialogue
  const tempAudioDir = path.resolve(process.cwd(), 'storage/audio/test-export');
  await fs.promises.mkdir(tempAudioDir, { recursive: true });

  const narrationFile = path.join(tempAudioDir, `narr-${Date.now()}.wav`);
  const dialogueFile = path.join(tempAudioDir, `dlg-${Date.now()}.wav`);

  // Generate 1.5s sine tone audio files using ffmpeg
  await execFileAsync(ffmpegPath, [
    '-y',
    '-f', 'lavfi',
    '-i', 'sine=frequency=440:duration=1.5',
    '-ar', '44100',
    '-ac', '2',
    narrationFile,
  ]);

  await execFileAsync(ffmpegPath, [
    '-y',
    '-f', 'lavfi',
    '-i', 'sine=frequency=880:duration=1.2',
    '-ar', '44100',
    '-ac', '2',
    dialogueFile,
  ]);

  // Create story in DB
  await createStory({
    storyId: testStoryId,
    title: 'Resolution Test Story',
    targetDuration: 2,
  });

  const animationData: VectorSceneData = {
    version: 1,
    viewport: { width: 1280, height: 720 },
    characterInstances: [
      {
        instanceId: 'inst-earth',
        characterId: 'earth_character',
        name: 'Earth',
        x: 640,
        y: 450,
        scale: 1.0,
        rotation: 0,
        flipX: false,
        zIndex: 1,
      },
    ],
    animationClips: [
      {
        clipId: 'clip-idle',
        instanceId: 'inst-earth',
        action: 'idle',
        startMs: 0,
        durationMs: 1500,
        loop: true,
      },
    ],
    expressionCues: [
      {
        instanceId: 'inst-earth',
        expression: 'happy',
        startMs: 0,
        durationMs: 1500,
      },
    ],
    dialogueLines: [
      {
        id: 'dlg-1',
        characterInstanceId: 'inst-earth',
        characterName: 'Earth',
        text: 'नमस्ते नन्हे दोस्तों!',
        voice: 'hf_alpha',
        speakingDirection: 'cheerful',
        audioUrl: `/storage/audio/test-export/${path.basename(dialogueFile)}`,
        startMs: 200,
        durationMs: 1200,
      },
    ],
    overlays: [
      {
        id: 'overlay-sunshine',
        type: 'sunshine_rays',
        label: 'Sunshine Rays',
        color: '#fef08a',
        x: 640,
        y: 200,
        startMs: 0,
        durationMs: 1500,
      },
    ],
  };

  await createScene({
    sceneId: testSceneId,
    storyId: testStoryId,
    number: 1,
    order: 1,
    title: 'Resolution Test Scene',
    narration: 'ग्रीष्म ऋतु में सूरज अपनी सुनहरी किरणें बिखेरता है।',
    audioUrl: `/storage/audio/test-export/${path.basename(narrationFile)}`,
    startMs: 0,
    endMs: 1500,
    animationData,
  });

  const testCases = [
    { format: '16:9' as const, resolution: '720p' as const, expectedW: 1280, expectedH: 720, label: '16:9 Landscape 720p (1280x720)' },
    { format: '16:9' as const, resolution: '1080p' as const, expectedW: 1920, expectedH: 1080, label: '16:9 Landscape 1080p (1920x1080)' },
    { format: '9:16' as const, resolution: '720p' as const, expectedW: 720, expectedH: 1280, label: '9:16 Vertical Reel 720p (720x1280)' },
    { format: '9:16' as const, resolution: '1080p' as const, expectedW: 1080, expectedH: 1920, label: '9:16 Vertical Reel 1080p (1080x1920)' },
    { format: '1:1' as const, resolution: '720p' as const, expectedW: 720, expectedH: 720, label: '1:1 Square 720p (720x720)' },
    { format: '1:1' as const, resolution: '1080p' as const, expectedW: 1080, expectedH: 1080, label: '1:1 Square 1080p (1080x1080)' },
    { format: '4:5' as const, resolution: '720p' as const, expectedW: 720, expectedH: 900, label: '4:5 Portrait 720p (720x900)' },
    { format: '4:5' as const, resolution: '1080p' as const, expectedW: 1080, expectedH: 1350, label: '4:5 Portrait 1080p (1080x1350)' },
  ];

  try {
    for (const tc of testCases) {
      await t.test(`Export format: ${tc.label}`, async () => {
        console.log(`\nTesting export: ${tc.label}...`);

        const exportJob = videoAssembly.startExportJob({
          storyId: testStoryId,
          format: tc.format,
          resolution: tc.resolution,
          fps: 15,
        });

        // Poll for completion (up to ~96s to accommodate concurrent test load)
        let pollCount = 0;
        let job = exportJob;
        while (pollCount < 120) {
          await new Promise((r) => setTimeout(r, 800));
          const current = videoAssembly.getJob(exportJob.id);
          if (!current) break;
          job = current;
          if (current.status === 'completed' || current.status === 'failed') break;
          pollCount++;
        }

        assert.equal(
          job.status,
          'completed',
          `Export failed for ${tc.label}: ${job.error || 'Timed out'}`
        );
        assert.ok(job.filename, 'Export job should return filename');

        const exportedPath = path.resolve(process.cwd(), 'storage/exports', job.filename!);
        assert.ok(fs.existsSync(exportedPath), `Exported file should exist at ${exportedPath}`);

        // Probe with ffprobe to verify video dimensions and codecs
        const { stdout: probeStdout } = await execFileAsync(ffprobePath, [
          '-v', 'quiet',
          '-print_format', 'json',
          '-show_format',
          '-show_streams',
          exportedPath,
        ]);

        const probe = JSON.parse(probeStdout);
        const videoStream = probe.streams?.find((s: any) => s.codec_type === 'video');
        const audioStream = probe.streams?.find((s: any) => s.codec_type === 'audio');

        assert.ok(videoStream, 'Output video must have a valid video stream');
        assert.equal(videoStream.codec_name, 'h264', 'Video stream codec must be h264');
        assert.equal(videoStream.width, tc.expectedW, `Video width must be ${tc.expectedW}`);
        assert.equal(videoStream.height, tc.expectedH, `Video height must be ${tc.expectedH}`);

        assert.ok(audioStream, 'Output video must have a mixed audio stream');
        assert.equal(audioStream.codec_name, 'aac', 'Audio stream codec must be aac');

        const duration = parseFloat(probe.format?.duration || '0');
        assert.ok(duration >= 1.0, `Video duration must be >= 1.0s (probed: ${duration}s)`);

        console.log(`✓ ${tc.label} verified: ${videoStream.width}x${videoStream.height}, ${duration}s, H.264/AAC.`);

        // Clean up individual exported video file
        try {
          await fs.promises.unlink(exportedPath);
        } catch {
          // ignore
        }
      });
    }
  } finally {
    // Clean up temporary audio files and DB records
    try {
      await fs.promises.unlink(narrationFile).catch(() => {});
      await fs.promises.unlink(dialogueFile).catch(() => {});
      await fs.promises.rmdir(tempAudioDir).catch(() => {});
      await deleteStory(testStoryId).catch(() => {});
    } catch {
      // ignore
    }
  }
});

