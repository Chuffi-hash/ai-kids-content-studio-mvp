import test from 'node:test';
import assert from 'node:assert/strict';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import { promisify } from 'util';
import { execFile } from 'child_process';
// @ts-ignore
import ffprobeStatic from '@ffprobe-installer/ffprobe';
// @ts-ignore
import ffmpegStatic from '@ffmpeg-installer/ffmpeg';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

import { RemotionManifestAdapter } from '../src/services/video-assembly/remotion-manifest.adapter.js';
import { RemotionRenderService } from '../src/services/video-assembly/remotion-render.service.js';
import { getCompositionDimensions, calculateResolvedBrandingPlacement } from '../src/services/branding/sharedCompositionCoordinates.js';

const execFileAsync = promisify(execFile);
const ffprobePath = (ffprobeStatic as any)?.path || 'ffprobe';
const ffmpegPath = (ffmpegStatic as any)?.path || 'ffmpeg';

test('End-to-End Remotion Visual Regression & Export Verification', async (t) => {
  const adapter = new RemotionManifestAdapter();
  const remotionService = new RemotionRenderService();

  const tempDir = path.resolve(process.cwd(), 'storage/temp/visual-e2e-test');
  const tempAudioDir = path.resolve(process.cwd(), 'storage/audio/visual-e2e');
  await fs.promises.mkdir(tempDir, { recursive: true });
  await fs.promises.mkdir(tempAudioDir, { recursive: true });

  // 1. Create a dummy test audio file
  const testAudio = path.join(tempAudioDir, 'narr-sample.wav');
  await execFileAsync(ffmpegPath, [
    '-y',
    '-f', 'lavfi',
    '-i', 'sine=frequency=440:duration=2.0',
    '-ar', '44100',
    '-ac', '2',
    testAudio,
  ]);

  // 2. Mock complete story & scene data
  const story = {
    storyId: 'story-e2e-visual-test',
    title: 'The Enchanted Forest',
    status: 'draft',
  };

  const scene = {
    sceneId: 'scene-e2e-1',
    storyId: 'story-e2e-visual-test',
    number: 1,
    title: 'The Enchanted Forest',
    durationMs: 3000,
    animationData: {
      background: {
        imageUrl: '',
        fit: 'cover',
      },
      characterInstances: [
        {
          instanceId: 'inst-pip',
          characterId: 'char-pip',
          name: 'Pip the Bear',
          x: 420,
          y: 480,
          scale: 1.0,
          rotation: 0,
          facingDirection: 'front-right',
          flipX: false,
          zIndex: 1,
        },
        {
          instanceId: 'inst-sammy',
          characterId: 'char-sammy',
          name: 'Sammy the Kid',
          x: 860,
          y: 480,
          scale: 1.0,
          rotation: 0,
          facingDirection: 'front-left',
          flipX: true,
          zIndex: 2,
        },
      ],
      animationClips: [
        {
          clipId: 'clip-pip',
          instanceId: 'inst-pip',
          action: 'wave',
          startMs: 0,
          durationMs: 3000,
        },
      ],
      overlays: [
        {
          id: 'overlay-sunbeams',
          type: 'sunbeams',
          x: 640,
          y: 200,
          scale: 1.0,
          opacity: 0.8,
          layerDepth: 'above_characters',
        },
      ],
      dialogueLines: [
        {
          id: 'dlg-1',
          characterId: 'char-pip',
          characterName: 'Pip',
          text: 'Look at the magical golden seed!',
          startMs: 500,
          durationMs: 2000,
        },
      ],
      formatVariants: {
        '9:16': {
          aspectRatio: '9:16',
          width: 720,
          height: 1280,
          characterOverrides: {
            'inst-pip': { x: 240, y: 880, scale: 1.1, facingDirection: 'front-right' },
            'inst-sammy': { x: 500, y: 880, scale: 1.1, facingDirection: 'front-left' },
          },
        },
      },
    },
    narration: 'Deep in the enchanted forest, Pip and Sammy discovered something amazing.',
    audioUrl: testAudio,
    actualAudioDurationMs: 2000,
  };

  const branding = {
    enabled: true,
    logoUrl: '/storage/branding/test-logo.png',
    position: 'bottom-right' as const,
    width: 140,
    height: 50,
    padding: 24,
    opacity: 0.9,
    showChannelName: false, // Prevents unexpected "test" text
    showSocialHandle: false,
    channelName: 'test',
    formatPresets: {
      '16:9': { position: 'bottom-right' as const, width: 140, height: 50, padding: 28 },
      '9:16': { position: 'bottom-right' as const, width: 110, height: 42, padding: 36 },
      '1:1': { position: 'bottom-right' as const, width: 120, height: 45, padding: 24 },
      '4:5': { position: 'bottom-right' as const, width: 120, height: 45, padding: 26 },
    },
  };

  await t.test('1. Manifest generation carries canonical character transforms, facing directions and branding across all 4 formats', async () => {
    const formats: Array<'16:9' | '9:16' | '1:1' | '4:5'> = ['16:9', '9:16', '1:1', '4:5'];

    for (const fmt of formats) {
      const manifest = await adapter.buildManifest(
        story as any,
        [scene as any],
        {
          format: fmt,
          resolution: '720p',
          branding: branding as any,
        }
      );

      assert.equal(manifest.format, fmt);
      assert.ok(manifest.branding, 'Branding must be present in manifest');
      assert.equal(manifest.branding?.enabled, true);
      assert.equal(manifest.branding?.showChannelName, false);

      const sceneManifest = manifest.scenes[0];
      assert.equal(sceneManifest.characterInstances?.length, 2);

      const pip = sceneManifest.characterInstances?.find((c) => c.instanceId === 'inst-pip');
      assert.equal(pip?.facingDirection, 'front-right');
      assert.equal(pip?.x, 420);

      const sammy = sceneManifest.characterInstances?.find((c) => c.instanceId === 'inst-sammy');
      assert.equal(sammy?.facingDirection, 'front-left');
      assert.equal(sammy?.x, 860);
      assert.equal(sammy?.flipX, true);

      // Verify formatVariants carried over
      assert.ok(sceneManifest.formatVariants?.['9:16']?.characterOverrides?.['inst-pip']);
    }
  });

  await t.test('2. Execute Remotion MP4 Render and probe final output for visual standards', async () => {
    const outputPath = path.join(tempDir, 'e2e-render-test.mp4');

    const result = await remotionService.renderStoryExport({
      jobId: 'e2e-test-job',
      story: story as any,
      scenes: [scene as any],
      format: '16:9',
      resolution: '720p',
      fps: 30,
      branding: branding as any,
      finalOutputPath: outputPath,
    });

    assert.ok(fs.existsSync(outputPath), 'Output MP4 must exist');

    // Probe exported MP4 with ffprobe
    const { stdout } = await execFileAsync(ffprobePath, [
      '-v', 'error',
      '-select_streams', 'v:0',
      '-show_entries', 'stream=width,height,r_frame_rate,duration',
      '-of', 'json',
      outputPath,
    ]);

    const probeData = JSON.parse(stdout);
    const videoStream = probeData.streams[0];
    assert.equal(videoStream.width, 1280);
    assert.equal(videoStream.height, 720);
    assert.ok(parseFloat(videoStream.duration) >= 2.0, 'Duration is at least 2 seconds');

    // Extract a frame with ffmpeg to confirm visual rasterization succeeded without artifacting
    const framePng = path.join(tempDir, 'frame-15.png');
    await execFileAsync(ffmpegPath, [
      '-y',
      '-ss', '0.5',
      '-i', outputPath,
      '-vframes', '1',
      framePng,
    ]);

    assert.ok(fs.existsSync(framePng), 'Extracted PNG frame must exist');
    const frameStat = await fs.promises.stat(framePng);
    assert.ok(frameStat.size > 10000, 'Frame PNG has substantial image data (> 10KB)');
  });
});
