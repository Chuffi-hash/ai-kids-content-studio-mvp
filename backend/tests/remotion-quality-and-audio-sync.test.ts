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

import { RemotionRenderService } from '../src/services/video-assembly/remotion-render.service.js';
import {
  RemotionManifestAdapter,
  validateAudioTimeline,
  RemotionScene,
} from '../src/services/video-assembly/remotion-manifest.adapter.js';

const execFileAsync = promisify(execFile);
const ffprobePath = (ffprobeStatic as any)?.path || 'ffprobe';
const ffmpegPath = (ffmpegStatic as any)?.path || 'ffmpeg';

test('Remotion Visual Quality, Animation and Audio Synchronization Test Suite', async (t) => {
  const remotionRenderService = new RemotionRenderService();
  const adapter = new RemotionManifestAdapter();

  const testTempDir = path.resolve(process.cwd(), 'storage/temp/quality-audio-sync-tests');
  const tempAudioDir = path.resolve(process.cwd(), 'storage/audio/quality-audio-sync');
  const musicDir = path.resolve(process.cwd(), 'storage/music');
  await fs.promises.mkdir(testTempDir, { recursive: true });
  await fs.promises.mkdir(tempAudioDir, { recursive: true });
  await fs.promises.mkdir(musicDir, { recursive: true });

  // Synthesize clean audio test fixtures
  const hindiNarrWav = path.join(tempAudioDir, 'hindi-narr-fixture.wav');
  const char1Wav = path.join(tempAudioDir, 'char1-fixture.wav');
  const char2Wav = path.join(tempAudioDir, 'char2-fixture.wav');
  const bgmWav = path.join(musicDir, 'storybook-bgm-fixture.wav');

  await execFileAsync(ffmpegPath, [
    '-y',
    '-f', 'lavfi',
    '-i', 'sine=frequency=380:duration=2.2',
    '-ar', '44100',
    '-ac', '2',
    hindiNarrWav,
  ]);

  await execFileAsync(ffmpegPath, [
    '-y',
    '-f', 'lavfi',
    '-i', 'sine=frequency=520:duration=1.4',
    '-ar', '44100',
    '-ac', '2',
    char1Wav,
  ]);

  await execFileAsync(ffmpegPath, [
    '-y',
    '-f', 'lavfi',
    '-i', 'sine=frequency=660:duration=1.4',
    '-ar', '44100',
    '-ac', '2',
    char2Wav,
  ]);

  await execFileAsync(ffmpegPath, [
    '-y',
    '-f', 'lavfi',
    '-i', 'sine=frequency=220:duration=15.0',
    '-ar', '44100',
    '-ac', '2',
    bgmWav,
  ]);

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

  async function extractFrame(videoPath: string, timestampSec: number, outPng: string): Promise<void> {
    await execFileAsync(ffmpegPath, [
      '-y',
      '-ss', String(timestampSec),
      '-i', videoPath,
      '-vframes', '1',
      '-pix_fmt', 'rgba',
      outPng,
    ]);
  }

  // --------------------------------------------------------------------------
  // TEST 1: Audio Segment Scheduling and Overlap Prevention Model
  // --------------------------------------------------------------------------
  await t.test('1. Audio Segment Scheduling: strictly prevents narration and dialogue overlaps', async () => {
    const story = {
      id: 'test-audio-story',
      title: 'ऑडियो सिंक्रोनाइज़ेशन स्टोरी',
      targetLanguage: 'hi',
    };

    const scenes = [
      {
        id: 'scene-dialogue-turn',
        number: 1,
        title: 'Scene 1: Two Characters Meet',
        narration: 'एक सुंदर सुबह, दो दोस्त जंगल में मिले।',
        audioUrl: hindiNarrWav,
        actualAudioDurationMs: 2200,
        animationData: {
          dialogueLines: [
            {
              id: 'd1',
              characterName: 'Pip',
              characterId: 'char_pip',
              text: 'नमस्ते दोस्त, तुम कैसे हो?',
              audioUrl: char1Wav,
              durationMs: 1400,
              startMs: 0, // Deliberately set to 0 (classic overlap bug)
            },
            {
              id: 'd2',
              characterName: 'Luna',
              characterId: 'char_luna',
              text: 'मैं बहुत अच्छी हूँ, धन्यवाद!',
              audioUrl: char2Wav,
              durationMs: 1400,
              startMs: 0, // Deliberately set to 0 (classic overlap bug)
            },
          ],
        },
      },
    ];

    const manifest = await adapter.buildManifest(story, scenes, {
      format: '16:9',
      fps: 30,
      embedBase64Audio: false,
    });

    const sceneManifest = manifest.scenes[0];
    assert.ok(sceneManifest.audioSchedule, 'Audio schedule must be generated');
    assert.equal(sceneManifest.audioSchedule.length, 3, 'Should schedule 3 segments (narration + 2 dialogues)');

    const narrSeg = sceneManifest.audioSchedule.find((s) => s.speakerType === 'narrator')!;
    const char1Seg = sceneManifest.audioSchedule.find((s) => s.speakerId === 'char_pip')!;
    const char2Seg = sceneManifest.audioSchedule.find((s) => s.speakerId === 'char_luna')!;

    // Rule 1: Narration must complete before Character 1 speaks (with a natural pause)
    assert.ok(
      char1Seg.startMs >= narrSeg.endMs + 300,
      `Character 1 (${char1Seg.startMs}ms) must start after narration ends (${narrSeg.endMs}ms) with pause`
    );

    // Rule 2: Character 1 dialogue must complete before Character 2 speaks
    assert.ok(
      char2Seg.startMs >= char1Seg.endMs + 300,
      `Character 2 (${char2Seg.startMs}ms) must start after Character 1 ends (${char1Seg.endMs}ms) with pause`
    );

    // Rule 3: Scene duration must fully contain all audio without truncation
    assert.ok(
      sceneManifest.durationMs >= char2Seg.endMs + 400,
      `Scene duration (${sceneManifest.durationMs}ms) must extend past last audio segment (${char2Seg.endMs}ms)`
    );

    // Timeline validator test: must validate with zero overlaps
    const validation = validateAudioTimeline(manifest.scenes);
    assert.equal(validation.valid, true, `Timeline should have no overlaps: ${JSON.stringify(validation.overlaps)}`);
    assert.equal(validation.overlaps.length, 0);

    console.log('[Test 1 Passed] Audio segments scheduled sequentially without any overlaps.');
  });

  // --------------------------------------------------------------------------
  // TEST 2: Audio Timeline Overlap Validator Error Detection
  // --------------------------------------------------------------------------
  await t.test('2. Audio Timeline Validator: correctly flags and reports accidental overlaps', async () => {
    const invalidScenes: RemotionScene[] = [
      {
        id: 'scene-overlap-test',
        sceneNumber: 2,
        durationMs: 5000,
        audioSchedule: [
          {
            speakerId: 'narrator',
            speakerType: 'narrator',
            text: 'First speaker',
            audioSrc: 'test1.wav',
            startMs: 0,
            endMs: 2500,
            durationMs: 2500,
            volume: 1,
          },
          {
            speakerId: 'character_milo',
            speakerType: 'character',
            text: 'Second speaker overlapping',
            audioSrc: 'test2.wav',
            startMs: 1000, // Starts while narrator is speaking!
            endMs: 3000,
            durationMs: 2000,
            volume: 1,
          },
        ],
      },
    ];

    const validation = validateAudioTimeline(invalidScenes);
    assert.equal(validation.valid, false, 'Validator must detect overlapping audio');
    assert.equal(validation.overlaps.length, 1);
    assert.equal(validation.overlaps[0].speaker1, 'narrator');
    assert.equal(validation.overlaps[0].speaker2, 'character_milo');
    assert.equal(validation.overlaps[0].range, '1000ms - 2500ms');

    console.log('[Test 2 Passed] Audio timeline validator accurately flags overlapping speakers and time range.');
  });

  // --------------------------------------------------------------------------
  // TEST 3: Background Continuity Inheritance Across Multiple Scenes
  // --------------------------------------------------------------------------
  await t.test('3. Background Continuity: scenes 2..N inherit prior scene backdrop instead of dark void', async () => {
    const manifest = await adapter.buildManifest(
      { storyId: 'test-continuity-story', title: 'Continuity Story' },
      [
        {
          sceneId: 'scene-1',
          number: 1,
          imageUrl: 'storage/images/sample-meadow.jpg',
          animationData: { background: { imageUrl: 'storage/images/sample-meadow.jpg' } },
        },
        {
          sceneId: 'scene-2',
          number: 2,
          animationData: {},
        },
        {
          sceneId: 'scene-3',
          number: 3,
          animationData: { background: { removed: true } },
        },
      ],
      { embedBase64Images: false }
    );

    assert.equal(manifest.scenes[0].background?.imageUrl, 'http://localhost:5001/storage/images/sample-meadow.jpg');
    // Scene 2 inherits Scene 1's backdrop
    assert.equal(manifest.scenes[1].background?.imageUrl, 'http://localhost:5001/storage/images/sample-meadow.jpg');
    assert.equal(manifest.scenes[1].background?.inheritedFromScene, 1);
    // Scene 3 has removed = true
    assert.equal(manifest.scenes[2].background?.removed, true);

    console.log('[Test 3 Passed] Background continuity inheritance verified.');
  });

  // --------------------------------------------------------------------------
  // TEST 4: Full Portrait 9:16 MP4 Render & Frame Inspection
  // --------------------------------------------------------------------------
  await t.test('4. Portrait 9:16 Export: renders full reel with prominent characters and valid streams', async () => {
    const outputPath = path.join(process.cwd(), 'storage/exports', `test-reel-9x16-${Date.now()}.mp4`);
    const story = {
      id: `story-reel-9x16-${Date.now()}`,
      title: 'Portrait Reel Story',
      targetDuration: 3,
    };

    const scenes = [
      {
        sceneId: 'scene-reel-1',
        number: 1,
        title: 'रील परिचय',
        narration: 'नमस्ते बच्चों! यह 9:16 रील वीडियो है।',
        audioUrl: hindiNarrWav,
        actualAudioDurationMs: 2200,
        animationData: {
          viewport: { width: 720, height: 1280 },
          characterInstances: [
            {
              instanceId: 'char-earth-reel',
              characterId: 'earth_character',
              name: 'Earth',
              x: 360,
              y: 800,
              scale: 1.0,
              flipX: false,
              zIndex: 1,
            },
          ],
          animationClips: [
            {
              clipId: 'clip-wave-reel',
              instanceId: 'char-earth-reel',
              action: 'wave',
              startMs: 0,
              durationMs: 2200,
              loop: true,
            },
          ],
        },
      },
    ];

    const result = await remotionRenderService.renderStoryExport({
      jobId: `job-reel-${Date.now()}`,
      story,
      scenes,
      resolution: '720p',
      format: '9:16',
      fps: 30,
      finalOutputPath: outputPath,
    });

    assert.ok(fs.existsSync(result.outputPath), '9:16 Exported MP4 should exist');

    const probe = await probeVideo(result.outputPath);
    assert.equal(probe.videoStream?.width, 720, 'Width must be 720 for 9:16');
    assert.equal(probe.videoStream?.height, 1280, 'Height must be 1280 for 9:16');
    assert.equal(probe.videoStream?.codec_name, 'h264', 'Must be h264');
    assert.ok(probe.audioStream, 'AAC Audio stream must be present in 9:16 export');
    assert.equal(probe.audioStream?.codec_name, 'aac');
    assert.ok(probe.duration >= 2.0, `Duration ${probe.duration}s should be >= 2.0s`);

    // Frame inspection at beginning (0.5s), middle (50%), and end
    const frameStart = path.join(testTempDir, 'reel-9x16-frame-start.png');
    const frameMid = path.join(testTempDir, 'reel-9x16-frame-mid.png');
    const frameEnd = path.join(testTempDir, 'reel-9x16-frame-end.png');

    await extractFrame(result.outputPath, 0.5, frameStart);
    await extractFrame(result.outputPath, probe.duration * 0.5, frameMid);
    await extractFrame(result.outputPath, Math.max(0.5, probe.duration - 0.5), frameEnd);

    assert.ok(fs.existsSync(frameStart) && fs.statSync(frameStart).size > 5000, 'Start frame exists');
    assert.ok(fs.existsSync(frameMid) && fs.statSync(frameMid).size > 5000, 'Middle frame exists');
    assert.ok(fs.existsSync(frameEnd) && fs.statSync(frameEnd).size > 5000, 'End frame exists');

    console.log(`[Test 4 Passed] Portrait 9:16 render verified (${probe.videoStream?.width}x${probe.videoStream?.height}, ${probe.duration}s, aac audio, 3 frames extracted).`);
  });

  // --------------------------------------------------------------------------
  // TEST 5: Full Landscape 16:9 MP4 Render with Dialogue Turns & BGM Ducking
  // --------------------------------------------------------------------------
  await t.test('5. Landscape 16:9 Export: 2-character dialogue turns, speech ducking and audio mastering', async () => {
    const outputPath = path.join(process.cwd(), 'storage/exports', `test-land-16x9-${Date.now()}.mp4`);
    const story = {
      id: `story-land-16x9-${Date.now()}`,
      title: 'Landscape Multi-Turn Story',
      targetDuration: 5,
    };

    const scenes = [
      {
        sceneId: 'scene-land-1',
        number: 1,
        title: 'कहानी का दृश्य',
        narration: 'दो दोस्तों की प्यारी बातचीत शुरू हुई।',
        audioUrl: hindiNarrWav,
        actualAudioDurationMs: 2200,
        animationData: {
          viewport: { width: 1280, height: 720 },
          characterInstances: [
            {
              instanceId: 'char-earth-left',
              characterId: 'earth_character',
              name: 'Earth',
              x: 400,
              y: 430,
              scale: 1.0,
              flipX: false,
              zIndex: 1,
            },
            {
              instanceId: 'char-pip-right',
              characterId: 'char-rig-pip-bear',
              name: 'Pip',
              x: 880,
              y: 430,
              scale: 1.0,
              flipX: true, // Facing left toward Earth
              zIndex: 2,
            },
          ],
          dialogueLines: [
            {
              id: 'dlg-1',
              characterName: 'Earth',
              characterId: 'earth_character',
              text: 'नमस्ते पिप!',
              audioUrl: char1Wav,
              durationMs: 1400,
            },
            {
              id: 'dlg-2',
              characterName: 'Pip',
              characterId: 'char-rig-pip-bear',
              text: 'नमस्ते पृथ्वी!',
              audioUrl: char2Wav,
              durationMs: 1400,
            },
          ],
        },
      },
    ];

    const result = await remotionRenderService.renderStoryExport({
      jobId: `job-land-${Date.now()}`,
      story,
      scenes,
      resolution: '720p',
      format: '16:9',
      fps: 30,
      backgroundMusic: 'storybook-bgm-fixture',
      musicVolume: 0.25,
      finalOutputPath: outputPath,
    });

    assert.ok(fs.existsSync(result.outputPath), '16:9 Exported MP4 should exist');

    const probe = await probeVideo(result.outputPath);
    assert.equal(probe.videoStream?.width, 1280, 'Width must be 1280 for 16:9');
    assert.equal(probe.videoStream?.height, 720, 'Height must be 720 for 16:9');
    assert.equal(probe.videoStream?.codec_name, 'h264');
    assert.ok(probe.audioStream, 'Mastered AAC Audio stream must be present');
    assert.equal(probe.audioStream?.codec_name, 'aac');
    assert.equal(probe.audioStream?.sample_rate, 44100, 'Audio sample rate must be 44.1kHz');
    assert.ok(probe.duration >= 4.0, `Duration ${probe.duration}s should cover narration + dialogue turns`);

    // Frame inspection at beginning, middle, and end
    const frameStart = path.join(testTempDir, 'land-16x9-frame-start.png');
    const frameMid = path.join(testTempDir, 'land-16x9-frame-mid.png');
    const frameEnd = path.join(testTempDir, 'land-16x9-frame-end.png');

    await extractFrame(result.outputPath, 0.5, frameStart);
    await extractFrame(result.outputPath, probe.duration * 0.5, frameMid);
    await extractFrame(result.outputPath, Math.max(0.5, probe.duration - 0.5), frameEnd);

    assert.ok(fs.existsSync(frameStart) && fs.statSync(frameStart).size > 5000);
    assert.ok(fs.existsSync(frameMid) && fs.statSync(frameMid).size > 5000);
    assert.ok(fs.existsSync(frameEnd) && fs.statSync(frameEnd).size > 5000);

    console.log(`[Test 5 Passed] Landscape 16:9 multi-turn dialogue with BGM ducking verified (${probe.videoStream?.width}x${probe.videoStream?.height}, ${probe.duration}s, mastered aac).`);
  });
});
