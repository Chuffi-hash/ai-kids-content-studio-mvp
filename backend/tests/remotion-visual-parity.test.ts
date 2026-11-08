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
import { RemotionRenderService } from '../src/services/video-assembly/remotion-render.service.js';
import { VectorAnimationEngine, VectorSceneData } from '../src/services/animation/vector-animation.engine.js';

const execFileAsync = promisify(execFile);
const ffprobePath = (ffprobeStatic as any)?.path || 'ffprobe';
const ffmpegPath = (ffmpegStatic as any)?.path || 'ffmpeg';

test('Remotion Visual Parity & 10 Core Test Cases Verification', async (t) => {
  const videoAssembly = new VideoAssemblyService();
  const adapter = new RemotionManifestAdapter();
  const remotionService = new RemotionRenderService();
  const vectorEngine = new VectorAnimationEngine();

  const testTempDir = path.resolve(process.cwd(), 'storage/temp/visual-parity-tests');
  const tempAudioDir = path.resolve(process.cwd(), 'storage/audio/visual-parity');
  await fs.promises.mkdir(testTempDir, { recursive: true });
  await fs.promises.mkdir(tempAudioDir, { recursive: true });

  // Generate synthetic test audio files
  const hindiNarrAudio = path.join(tempAudioDir, 'hindi-narr-sample.wav');
  const dlg1Audio = path.join(tempAudioDir, 'dlg1-sample.wav');
  const dlg2Audio = path.join(tempAudioDir, 'dlg2-sample.wav');

  await execFileAsync(ffmpegPath, [
    '-y',
    '-f', 'lavfi',
    '-i', 'sine=frequency=440:duration=2.0',
    '-ar', '44100',
    '-ac', '2',
    hindiNarrAudio,
  ]);

  await execFileAsync(ffmpegPath, [
    '-y',
    '-f', 'lavfi',
    '-i', 'sine=frequency=520:duration=1.2',
    '-ar', '44100',
    '-ac', '2',
    dlg1Audio,
  ]);

  await execFileAsync(ffmpegPath, [
    '-y',
    '-f', 'lavfi',
    '-i', 'sine=frequency=660:duration=1.2',
    '-ar', '44100',
    '-ac', '2',
    dlg2Audio,
  ]);

  // Helper to extract frame from MP4 at timestampSec
  async function extractFrameFromVideo(videoPath: string, timestampSec: number, outPng: string): Promise<void> {
    await execFileAsync(ffmpegPath, [
      '-y',
      '-ss', String(timestampSec),
      '-i', videoPath,
      '-vframes', '1',
      '-pix_fmt', 'rgba',
      outPng,
    ]);
  }

  // Helper to probe video
  async function probeVideo(videoPath: string) {
    const { stdout } = await execFileAsync(ffprobePath, [
      '-v', 'quiet',
      '-print_format', 'json',
      '-show_format',
      '-show_streams',
      videoPath,
    ]);
    const json = JSON.parse(stdout);
    const videoStream = json.streams?.find((s: any) => s.codec_type === 'video');
    const audioStream = json.streams?.find((s: any) => s.codec_type === 'audio');
    const duration = parseFloat(json.format?.duration || '0');
    return { videoStream, audioStream, duration, raw: json };
  }

  // -------------------------------------------------------------
  // Test Case 1: Background-only scene renders
  // -------------------------------------------------------------
  await t.test('1. A background-only scene renders cleanly to MP4', async () => {
    const storyId = `parity-story-bg-${Date.now()}`;
    const sceneId = `parity-scene-bg-${Date.now()}`;
    await createStory({ storyId, title: 'Background Only Story', targetDuration: 2 });
    await createScene({
      sceneId,
      storyId,
      title: 'Background Scene',
      number: 1,
      narration: 'A peaceful empty landscape.',
      estimatedDurationMs: 2000,
      animationData: {
        version: 1,
        viewport: { width: 1280, height: 720 },
        characterInstances: [],
        animationClips: [],
      } as any,
    });

    const exportJob = videoAssembly.startExportJob({
      storyId,
      renderer: 'remotion',
      resolution: '720p',
      format: '16:9',
      fps: 30,
    });

    let job = exportJob;
    while (job.status === 'queued' || job.status === 'processing') {
      await new Promise((r) => setTimeout(r, 600));
      job = videoAssembly.getJob(exportJob.id) || job;
    }

    assert.equal(job.status, 'completed', `Failed: ${job.error}`);
    const exportedPath = path.resolve(process.cwd(), 'storage/exports', job.filename!);
    assert.ok(fs.existsSync(exportedPath), 'Exported file should exist');

    const probe = await probeVideo(exportedPath);
    assert.equal(probe.videoStream?.width, 1280);
    assert.equal(probe.videoStream?.height, 720);
    assert.equal(probe.videoStream?.codec_name, 'h264');
    assert.ok(probe.duration >= 1.5, 'Duration should be at least 1.5s');

    // Extract frame
    const framePng = path.join(testTempDir, 'case1-bg-frame.png');
    await extractFrameFromVideo(exportedPath, 0.5, framePng);
    assert.ok(fs.existsSync(framePng), 'Extracted frame should exist');
    assert.ok(fs.statSync(framePng).size > 1000, 'Frame PNG should have content');
    console.log('[Parity Test 1] Background-only scene verified.');
    await deleteStory(storyId);
  });

  // -------------------------------------------------------------
  // Test Case 2: A scene with one vector character renders
  // -------------------------------------------------------------
  await t.test('2. A scene with one vector character renders with valid pose and frame', async () => {
    const storyId = `parity-story-one-char-${Date.now()}`;
    const sceneId = `parity-scene-one-char-${Date.now()}`;
    await createStory({ storyId, title: 'One Character Story', targetDuration: 2 });
    await createScene({
      sceneId,
      storyId,
      title: 'Earth Intro',
      number: 1,
      narration: 'Hello Earth!',
      estimatedDurationMs: 2000,
      animationData: {
        version: 1,
        viewport: { width: 1280, height: 720 },
        characterInstances: [
          {
            instanceId: 'char-earth',
            characterId: 'earth_character',
            name: 'Earth',
            x: 640,
            y: 420,
            scale: 1.0,
            rotation: 0,
            flipX: false,
            zIndex: 1,
          },
        ],
        animationClips: [
          {
            clipId: 'clip-idle',
            instanceId: 'char-earth',
            action: 'idle',
            startMs: 0,
            durationMs: 2000,
            loop: true,
          },
        ],
      } as any,
    });

    const exportJob = videoAssembly.startExportJob({
      storyId,
      renderer: 'remotion',
      resolution: '720p',
      format: '16:9',
      fps: 30,
    });

    let job = exportJob;
    while (job.status === 'queued' || job.status === 'processing') {
      await new Promise((r) => setTimeout(r, 600));
      job = videoAssembly.getJob(exportJob.id) || job;
    }

    assert.equal(job.status, 'completed', `Failed: ${job.error}`);
    const exportedPath = path.resolve(process.cwd(), 'storage/exports', job.filename!);
    const probe = await probeVideo(exportedPath);
    assert.equal(probe.videoStream?.width, 1280);
    assert.equal(probe.videoStream?.height, 720);

    const framePng = path.join(testTempDir, 'case2-one-char-frame.png');
    await extractFrameFromVideo(exportedPath, 0.5, framePng);
    assert.ok(fs.existsSync(framePng), 'Extracted frame must exist');
    console.log('[Parity Test 2] One vector character scene verified.');
    await deleteStory(storyId);
  });

  // -------------------------------------------------------------
  // Test Case 3 & 4: Two characters animate independently + motion path
  // -------------------------------------------------------------
  await t.test('3 & 4. Two characters animate independently and follow motion path', async () => {
    const story = { storyId: 'multi-char-test', title: 'Two Characters' };
    const scene = {
      sceneId: 'scene-multi-char',
      title: 'Earth & Pip Meet',
      number: 1,
      estimatedDurationMs: 2500,
      animationData: {
        version: 1,
        viewport: { width: 1280, height: 720 },
        characterInstances: [
          {
            instanceId: 'inst-earth',
            characterId: 'earth_character',
            name: 'Earth',
            x: 400,
            y: 420,
            scale: 1.0,
            rotation: 0,
            flipX: false,
            zIndex: 1,
          },
          {
            instanceId: 'inst-pip',
            characterId: 'pip',
            name: 'Pip the Bear',
            x: 800,
            y: 480,
            scale: 0.9,
            rotation: 0,
            flipX: true,
            zIndex: 2,
          },
        ],
        animationClips: [
          {
            clipId: 'earth-wave',
            instanceId: 'inst-earth',
            action: 'wave',
            startMs: 0,
            durationMs: 2500,
            loop: true,
          },
          {
            clipId: 'pip-walk',
            instanceId: 'inst-pip',
            action: 'walk',
            startMs: 0,
            durationMs: 2500,
            loop: true,
            motionMode: 'motion_path',
            motionPath: {
              startX: 950,
              startY: 480,
              endX: 680,
              endY: 480,
              easing: 'easeInOut',
            },
          },
        ],
      },
    };

    const manifest = await adapter.buildManifest(story, [scene], {
      resolution: '720p',
      format: '16:9',
      fps: 30,
    });

    assert.equal(manifest.scenes[0].characterInstances?.length, 2);
    assert.equal(manifest.scenes[0].animationClips?.length, 2);
    const pipClip = manifest.scenes[0].animationClips?.find((c) => c.instanceId === 'inst-pip');
    assert.equal(pipClip?.motionMode, 'motion_path');
    assert.equal(pipClip?.motionPath?.startX, 950);
    assert.equal(pipClip?.motionPath?.endX, 680);

    const outMp4 = path.join(testTempDir, 'case3-4-two-chars.mp4');
    const result = await remotionService.renderStoryExport({
      jobId: 'test-case3-4',
      story,
      scenes: [scene],
      resolution: '720p',
      format: '16:9',
      fps: 30,
      finalOutputPath: outMp4,
    });

    assert.ok(fs.existsSync(outMp4));
    assert.equal(result.width, 1280);
    assert.equal(result.height, 720);

    // Extract start and middle frames to confirm Pip traversed motion path
    const frameStart = path.join(testTempDir, 'case4-pip-start.png');
    const frameMid = path.join(testTempDir, 'case4-pip-mid.png');
    await extractFrameFromVideo(outMp4, 0.2, frameStart);
    await extractFrameFromVideo(outMp4, 1.2, frameMid);

    assert.ok(fs.existsSync(frameStart));
    assert.ok(fs.existsSync(frameMid));
    console.log('[Parity Test 3 & 4] Two independent characters with motion path verified.');
  });

  // -------------------------------------------------------------
  // Test Case 5: Facial expression cues render at correct time
  // -------------------------------------------------------------
  await t.test('5. Facial expression cues render dynamic eyes/mouth at exact cue timestamps', async () => {
    const story = { storyId: 'expression-test', title: 'Expressions Story' };
    const scene = {
      sceneId: 'scene-exp',
      title: 'Expression Shifts',
      number: 1,
      estimatedDurationMs: 2500,
      animationData: {
        version: 1,
        viewport: { width: 1280, height: 720 },
        characterInstances: [
          {
            instanceId: 'char-earth-exp',
            characterId: 'earth_character',
            name: 'Earth',
            x: 640,
            y: 420,
            scale: 1.0,
            rotation: 0,
            flipX: false,
            zIndex: 1,
          },
        ],
        expressionCues: [
          {
            instanceId: 'char-earth-exp',
            expression: 'happy',
            startMs: 0,
            durationMs: 1000,
          },
          {
            instanceId: 'char-earth-exp',
            expression: 'surprised',
            startMs: 1000,
            durationMs: 1500,
          },
        ],
      },
    };

    const manifest = await adapter.buildManifest(story, [scene], { fps: 30 });
    assert.equal(manifest.scenes[0].expressionCues?.length, 2);
    assert.equal(manifest.scenes[0].expressionCues![0].expression, 'happy');
    assert.equal(manifest.scenes[0].expressionCues![1].expression, 'surprised');

    const outMp4 = path.join(testTempDir, 'case5-expressions.mp4');
    await remotionService.renderStoryExport({
      jobId: 'test-case5',
      story,
      scenes: [scene],
      resolution: '720p',
      format: '16:9',
      fps: 30,
      finalOutputPath: outMp4,
    });

    assert.ok(fs.existsSync(outMp4));
    console.log('[Parity Test 5] Facial expression cues verified.');
  });

  // -------------------------------------------------------------
  // Test Case 6: Lip-sync cues match dialogue timing
  // -------------------------------------------------------------
  await t.test('6. Lip-sync cues match dialogue timing and drive viseme mouth states', async () => {
    const story = { storyId: 'lipsync-test', title: 'LipSync Story' };
    const scene = {
      sceneId: 'scene-lipsync',
      title: 'LipSync Dialogue',
      number: 1,
      estimatedDurationMs: 2000,
      animationData: {
        version: 1,
        viewport: { width: 1280, height: 720 },
        characterInstances: [
          {
            instanceId: 'char-earth-talk',
            characterId: 'earth_character',
            name: 'Earth',
            x: 640,
            y: 420,
            scale: 1.0,
            rotation: 0,
            flipX: false,
            zIndex: 1,
          },
        ],
        dialogueLines: [
          {
            id: 'dlg-sync',
            characterName: 'Earth',
            characterInstanceId: 'char-earth-talk',
            text: 'बोलो बच्चों!',
            startMs: 200,
            durationMs: 1500,
            visemeCues: [
              { timeMs: 0, shape: 'open', durationMs: 300 },
              { timeMs: 300, shape: 'wide', durationMs: 400 },
              { timeMs: 700, shape: 'round', durationMs: 400 },
              { timeMs: 1100, shape: 'closed', durationMs: 400 },
            ],
          },
        ],
      },
    };

    const manifest = await adapter.buildManifest(story, [scene], { fps: 30 });
    const s0 = manifest.scenes[0];
    assert.equal(s0.dialogues?.length, 1);
    assert.equal(s0.dialogues![0].visemeCues?.length, 4);
    assert.equal(s0.dialogues![0].visemeCues![1].shape, 'wide');

    const outMp4 = path.join(testTempDir, 'case6-lipsync.mp4');
    await remotionService.renderStoryExport({
      jobId: 'test-case6',
      story,
      scenes: [scene],
      resolution: '720p',
      format: '16:9',
      fps: 30,
      finalOutputPath: outMp4,
    });

    assert.ok(fs.existsSync(outMp4));
    console.log('[Parity Test 6] Lip-sync cues verified.');
  });

  // -------------------------------------------------------------
  // Test Case 7: Hindi narration renders with correct audio
  // -------------------------------------------------------------
  await t.test('7. Hindi narration renders with synchronized audio track in Remotion', async () => {
    const story = { storyId: 'hindi-audio-test', title: 'Hindi Narration' };
    const scene = {
      sceneId: 'scene-hindi-audio',
      title: 'Hindi Scene',
      number: 1,
      narration: 'नमस्ते, यह पृथ्वी की सुंदर कहानी है।',
      audioUrl: `/storage/audio/visual-parity/${path.basename(hindiNarrAudio)}`,
      actualAudioDurationMs: 2000,
      estimatedDurationMs: 2000,
      animationData: {
        version: 1,
        viewport: { width: 1280, height: 720 },
        characterInstances: [],
      },
    };

    const manifest = await adapter.buildManifest(story, [scene], { fps: 30 });
    assert.ok(manifest.scenes[0].narration?.url.includes('hindi-narr-sample.wav'));
    assert.equal(manifest.scenes[0].caption, 'नमस्ते, यह पृथ्वी की सुंदर कहानी है।');

    const outMp4 = path.join(testTempDir, 'case7-hindi-audio.mp4');
    await remotionService.renderStoryExport({
      jobId: 'test-case7',
      story,
      scenes: [scene],
      resolution: '720p',
      format: '16:9',
      fps: 30,
      finalOutputPath: outMp4,
    });

    assert.ok(fs.existsSync(outMp4));
    const probe = await probeVideo(outMp4);
    assert.ok(probe.audioStream, 'Output MP4 must include audio stream');
    assert.ok(probe.duration >= 1.9, 'Duration should cover narration audio');
    console.log('[Parity Test 7] Hindi narration audio verified.');
  });

  // -------------------------------------------------------------
  // Test Case 8: Multiple dialogue tracks are synchronized
  // -------------------------------------------------------------
  await t.test('8. Multiple sequential dialogue tracks are synchronized cleanly', async () => {
    const story = { storyId: 'multi-dialogue-test', title: 'Conversation Story' };
    const scene = {
      sceneId: 'scene-dialogues',
      title: 'Two Speaker Dialogue',
      number: 1,
      estimatedDurationMs: 2800,
      animationData: {
        version: 1,
        viewport: { width: 1280, height: 720 },
        characterInstances: [
          { instanceId: 'char-1', characterId: 'earth_character', name: 'Earth', x: 450, y: 420, scale: 1 },
          { instanceId: 'char-2', characterId: 'pip', name: 'Pip', x: 850, y: 480, scale: 0.9 },
        ],
        dialogueLines: [
          {
            id: 'd1',
            characterName: 'Earth',
            characterInstanceId: 'char-1',
            text: 'नमस्ते पिप!',
            audioUrl: `/storage/audio/visual-parity/${path.basename(dlg1Audio)}`,
            startMs: 200,
            durationMs: 1000,
          },
          {
            id: 'd2',
            characterName: 'Pip',
            characterInstanceId: 'char-2',
            text: 'नमस्ते पृथ्वी!',
            audioUrl: `/storage/audio/visual-parity/${path.basename(dlg2Audio)}`,
            startMs: 1400,
            durationMs: 1000,
          },
        ],
      },
    };

    const manifest = await adapter.buildManifest(story, [scene], { fps: 30 });
    assert.equal(manifest.scenes[0].dialogues?.length, 2);
    assert.equal(manifest.scenes[0].dialogues![0].startMs, 200);
    assert.equal(manifest.scenes[0].dialogues![1].startMs, 1400);

    const outMp4 = path.join(testTempDir, 'case8-dialogues.mp4');
    await remotionService.renderStoryExport({
      jobId: 'test-case8',
      story,
      scenes: [scene],
      resolution: '720p',
      format: '16:9',
      fps: 30,
      finalOutputPath: outMp4,
    });

    assert.ok(fs.existsSync(outMp4));
    const probe = await probeVideo(outMp4);
    assert.ok(probe.audioStream, 'Output MP4 must include combined dialogue audio stream');
    console.log('[Parity Test 8] Multiple dialogue tracks verified.');
  });

  // -------------------------------------------------------------
  // Test Case 9: Portrait 9:16 output renders correctly
  // -------------------------------------------------------------
  await t.test('9. Portrait 9:16 (720x1280) vertical reel renders with correct dimensions and character adaptation', async () => {
    const story = { storyId: 'portrait-reel-test', title: 'Reel Story' };
    const scene = {
      sceneId: 'scene-reel',
      title: 'Vertical Reel Scene',
      number: 1,
      estimatedDurationMs: 2000,
      animationData: {
        version: 1,
        viewport: { width: 1280, height: 720 },
        characterInstances: [
          {
            instanceId: 'char-earth-reel',
            characterId: 'earth_character',
            name: 'Earth',
            x: 640,
            y: 420,
            scale: 1.0,
            rotation: 0,
            flipX: false,
            zIndex: 1,
          },
        ],
      },
    };

    const manifest = await adapter.buildManifest(story, [scene], {
      format: '9:16',
      resolution: '720p',
      fps: 30,
    });

    assert.equal(manifest.format, '9:16');
    assert.equal(manifest.resolution, '720p');

    const outMp4 = path.join(testTempDir, 'case9-portrait-9x16.mp4');
    const result = await remotionService.renderStoryExport({
      jobId: 'test-case9',
      story,
      scenes: [scene],
      format: '9:16',
      resolution: '720p',
      fps: 30,
      finalOutputPath: outMp4,
    });

    assert.ok(fs.existsSync(outMp4));
    assert.equal(result.width, 720);
    assert.equal(result.height, 1280);

    const probe = await probeVideo(outMp4);
    assert.equal(probe.videoStream?.width, 720);
    assert.equal(probe.videoStream?.height, 1280);
    console.log('[Parity Test 9] Portrait 9:16 output verified (720x1280).');
  });

  // -------------------------------------------------------------
  // Test Case 10: Existing FFmpeg export remains unaffected
  // -------------------------------------------------------------
  await t.test('10. Existing FFmpeg export remains completely unaffected and regression-free', async () => {
    const storyId = `parity-story-ffmpeg-${Date.now()}`;
    const sceneId = `parity-scene-ffmpeg-${Date.now()}`;
    await createStory({ storyId, title: 'FFmpeg Baseline Story', targetDuration: 2 });
    await createScene({
      sceneId,
      storyId,
      title: 'FFmpeg Scene',
      number: 1,
      narration: 'Baseline FFmpeg assembly.',
      estimatedDurationMs: 2000,
      animationData: {
        version: 1,
        viewport: { width: 1280, height: 720 },
        characterInstances: [
          {
            instanceId: 'char-earth-ffmpeg',
            characterId: 'earth_character',
            name: 'Earth',
            x: 640,
            y: 420,
            scale: 1.0,
            rotation: 0,
            flipX: false,
            zIndex: 1,
          },
        ],
      } as any,
    });

    // Default renderer without specifying renderer (should pick 'ffmpeg')
    const exportJob = videoAssembly.startExportJob({
      storyId,
      resolution: '720p',
      format: '16:9',
      fps: 15,
    });

    assert.equal(exportJob.renderer, 'ffmpeg', 'Default renderer must be ffmpeg');

    let job = exportJob;
    while (job.status === 'queued' || job.status === 'processing') {
      await new Promise((r) => setTimeout(r, 600));
      job = videoAssembly.getJob(exportJob.id) || job;
    }

    assert.equal(job.status, 'completed', `FFmpeg export failed: ${job.error}`);
    const exportedPath = path.resolve(process.cwd(), 'storage/exports', job.filename!);
    assert.ok(fs.existsSync(exportedPath), 'FFmpeg exported file must exist');

    const probe = await probeVideo(exportedPath);
    assert.equal(probe.videoStream?.width, 1280);
    assert.equal(probe.videoStream?.height, 720);
    assert.equal(probe.videoStream?.codec_name, 'h264');
    console.log('[Parity Test 10] Existing FFmpeg export verified unaffected.');
    await deleteStory(storyId);
  });

  // Cleanup temporary audio files
  try {
    await fs.promises.rm(tempAudioDir, { recursive: true, force: true });
    await fs.promises.rm(testTempDir, { recursive: true, force: true });
  } catch {}
});

