import test from 'node:test';
import assert from 'node:assert/strict';
import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

import fs from 'fs';
import { promisify } from 'util';
import { execFile } from 'child_process';
// @ts-ignore
import ffprobeStatic from '@ffprobe-installer/ffprobe';
// @ts-ignore
import ffmpegStatic from '@ffmpeg-installer/ffmpeg';

import {
  createStory,
  createScene,
  deleteStory,
} from '../src/services/database/database.service.js';
import { VideoAssemblyService } from '../src/services/video-assembly/video-assembly.service.js';
import { RemotionManifestAdapter } from '../src/services/video-assembly/remotion-manifest.adapter.js';
import { VectorSceneData } from '../src/services/animation/vector-animation.engine.js';

const execFileAsync = promisify(execFile);
const ffprobePath = (ffprobeStatic as any)?.path || 'ffprobe';
const ffmpegPath = (ffmpegStatic as any)?.path || 'ffmpeg';

test('Remotion Video Renderer Integration & Parity Verification', async (t) => {
  const videoAssembly = new VideoAssemblyService();
  const adapter = new RemotionManifestAdapter();

  const testStoryId = `story-remotion-test-${Date.now()}`;
  const testSceneId = `scene-remotion-test-${Date.now()}`;

  // 1. Create a dummy sine wave audio for narration
  const tempAudioDir = path.resolve(process.cwd(), 'storage/audio/test-remotion');
  await fs.promises.mkdir(tempAudioDir, { recursive: true });
  const narrationFile = path.join(tempAudioDir, `narr-${Date.now()}.wav`);

  await execFileAsync(ffmpegPath, [
    '-y',
    '-f', 'lavfi',
    '-i', 'sine=frequency=440:duration=2.0',
    '-ar', '44100',
    '-ac', '2',
    narrationFile,
  ]);

  // 2. Set up test story in database
  await createStory({
    storyId: testStoryId,
    title: 'Remotion Test Story',
    targetDuration: 3,
  });

  const animationData: VectorSceneData = {
    version: 1,
    viewport: { width: 1280, height: 720 },
    cameraMovement: 'Slow Zoom In',
    cameraRotation: 'none',
    characterInstances: [
      {
        instanceId: 'inst-earth-1',
        characterId: 'earth_character',
        name: 'Earth',
        x: 640,
        y: 420,
        scale: 1.1,
        rotation: 0,
        flipX: false,
        zIndex: 10,
        expression: 'happy',
      },
    ],
    animationClips: [
      {
        clipId: 'clip-wave-1',
        instanceId: 'inst-earth-1',
        action: 'wave',
        startMs: 0,
        durationMs: 2500,
        loop: true,
      },
    ],
    expressionCues: [
      {
        instanceId: 'inst-earth-1',
        expression: 'happy',
        startMs: 0,
        durationMs: 2500,
      },
    ],
    dialogueLines: [
      {
        id: 'dlg-1',
        characterName: 'Earth',
        characterInstanceId: 'inst-earth-1',
        text: 'नमस्ते बच्चों! मैं पृथ्वी हूँ।',
        startMs: 500,
        durationMs: 1800,
        facialExpression: 'happy',
        visemeCues: [
          { timeMs: 0, shape: 'open', durationMs: 400 },
          { timeMs: 400, shape: 'wide', durationMs: 400 },
          { timeMs: 800, shape: 'round', durationMs: 400 },
          { timeMs: 1200, shape: 'closed', durationMs: 300 },
        ],
      },
    ],
    overlays: [
      {
        id: 'pin-overlay-1',
        type: 'location_pin',
        x: 350,
        y: 250,
        scale: 1.2,
        color: '#ef4444',
        label: 'India',
        startMs: 200,
        durationMs: 2200,
      },
    ],
  };

  const sceneRecord = await createScene({
    sceneId: testSceneId,
    storyId: testStoryId,
    title: 'Scene 1: Introduction',
    number: 1,
    narration: 'नमस्ते बच्चों! मैं पृथ्वी हूँ। Welcome to our wonderful planet!',
    audioUrl: `/storage/audio/test-remotion/${path.basename(narrationFile)}`,
    estimatedDurationMs: 2500,
    actualAudioDurationMs: 2000,
    animationData: animationData as any,
  });

  try {
    // -------------------------------------------------------------
    // Phase 1: Manifest Adapter Verification
    // -------------------------------------------------------------
    await t.test('Manifest Adapter converts database records into valid Remotion manifest', async () => {
      const story = { storyId: testStoryId, title: 'Remotion Test Story' };
      const scenes = [sceneRecord];

      const manifest = await adapter.buildManifest(story, scenes, {
        resolution: '720p',
        fps: 30,
        format: '16:9',
      });

      assert.equal(manifest.fps, 30);
      assert.equal(manifest.resolution, '720p');
      assert.equal(manifest.format, '16:9');
      assert.equal(manifest.scenes.length, 1);

      const s0 = manifest.scenes[0];
      assert.equal(s0.id, testSceneId);
      assert.equal(s0.title, 'Scene 1: Introduction');
      assert.equal(s0.cameraMovement, 'Slow Zoom In');
      assert.ok(s0.durationMs >= 2000, 'Duration should reflect audio duration');

      // Verify character instance rig resolution
      assert.equal(s0.characterInstances?.length, 1);
      const char0 = s0.characterInstances![0];
      assert.equal(char0.name, 'Earth');
      assert.ok(char0.customRig, 'Custom rig definition must be resolved and attached');
      assert.ok(char0.customRig.parts.head, 'Rig must contain head part');
      assert.ok(char0.customRig.parts.torso, 'Rig must contain torso part');

      // Verify Hindi dialogue and visemes
      assert.equal(s0.dialogues?.length, 1);
      assert.equal(s0.dialogues![0].text, 'नमस्ते बच्चों! मैं पृथ्वी हूँ।');
      assert.equal(s0.dialogues![0].visemeCues?.length, 4);

      // Verify educational overlay
      assert.equal(s0.overlays?.length, 1);
      assert.equal(s0.overlays![0].type, 'location_pin');
      assert.equal(s0.overlays![0].label, 'India');
    });

    // -------------------------------------------------------------
    // Phase 2: Remotion Video Assembly Export Execution
    // -------------------------------------------------------------
    await t.test('VideoAssemblyService exports video using Remotion renderer', async () => {
      console.log('\n[Test] Launching Remotion export job...');
      const exportJob = videoAssembly.startExportJob({
        storyId: testStoryId,
        format: '16:9',
        resolution: '720p',
        fps: 30,
        renderer: 'remotion',
      });

      assert.equal(exportJob.renderer, 'remotion');

      // Poll until export finishes
      let pollCount = 0;
      let job = exportJob;
      while (pollCount < 120) {
        await new Promise((r) => setTimeout(r, 1000));
        const current = videoAssembly.getJob(exportJob.id);
        if (!current) break;
        job = current;
        if (current.status === 'completed' || current.status === 'failed') break;
        pollCount++;
      }

      assert.equal(job.status, 'completed', `Export failed: ${job.error}`);
      assert.ok(job.filename, 'Job should return an export filename');
      assert.ok(job.filename.includes('remotion'), 'Filename should identify Remotion export');

      const exportedPath = path.resolve(process.cwd(), 'storage/exports', job.filename!);
      assert.ok(fs.existsSync(exportedPath), `Exported file should exist at ${exportedPath}`);

      // Probe exported file with ffprobe
      const { stdout: probeStdout } = await execFileAsync(ffprobePath, [
        '-v', 'quiet',
        '-print_format', 'json',
        '-show_format',
        '-show_streams',
        exportedPath,
      ]);

      const probe = JSON.parse(probeStdout);
      const vStream = probe.streams?.find((s: any) => s.codec_type === 'video');
      assert.ok(vStream, 'Exported video must have a video stream');
      assert.equal(vStream.codec_name, 'h264', 'Video codec should be H.264');
      assert.equal(vStream.width, 1280, 'Width should be 1280');
      assert.equal(vStream.height, 720, 'Height should be 720');

      const durSec = Number.parseFloat(probe.format?.duration || '0');
      assert.ok(durSec > 1.5, `Duration (${durSec}s) should be greater than 1.5s`);
      console.log(`[Test] Remotion export verified: ${job.filename} (${vStream.width}x${vStream.height}, ${durSec}s)`);
    });

    // -------------------------------------------------------------
    // Phase 3: Zero-Regression Test — Existing FFmpeg pipeline
    // -------------------------------------------------------------
    await t.test('Existing FFmpeg renderer pipeline continues to work seamlessly', async () => {
      console.log('\n[Test] Launching standard FFmpeg export job...');
      const exportJob = videoAssembly.startExportJob({
        storyId: testStoryId,
        format: '16:9',
        resolution: '720p',
        fps: 15,
        renderer: 'ffmpeg',
      });

      assert.equal(exportJob.renderer, 'ffmpeg');

      let pollCount = 0;
      let job = exportJob;
      while (pollCount < 120) {
        await new Promise((r) => setTimeout(r, 1000));
        const current = videoAssembly.getJob(exportJob.id);
        if (!current) break;
        job = current;
        if (current.status === 'completed' || current.status === 'failed') break;
        pollCount++;
      }

      assert.equal(job.status, 'completed', `FFmpeg export failed: ${job.error}`);
      assert.ok(job.filename, 'Job should return filename');

      const exportedPath = path.resolve(process.cwd(), 'storage/exports', job.filename!);
      assert.ok(fs.existsSync(exportedPath), `Exported file should exist at ${exportedPath}`);
      console.log(`[Test] Standard FFmpeg export verified: ${job.filename}`);
    });

  } finally {
    // Cleanup temporary files and database records
    try {
      await deleteStory(testStoryId);
    } catch {}
    try {
      await fs.promises.rm(tempAudioDir, { recursive: true, force: true });
    } catch {}
  }
});
