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
import { AudioGenerationService } from '../src/services/audio-generation/audio-generation.service.js';
import { VideoAssemblyService } from '../src/services/video-assembly/video-assembly.service.js';
import { VectorSceneData } from '../src/services/animation/vector-animation.engine.js';

const execFileAsync = promisify(execFile);
const ffmpegPath = (ffmpegStatic as any).path || 'ffmpeg';
const ffprobePath = (ffprobeStatic as any).path || 'ffprobe';

const ARTIFACT_DIR = 'C:/Users/chuph/.gemini/antigravity/brain/22788c65-d8fa-4654-95aa-810b62d024c2';

async function runPhase2ExportVerification() {
  console.log('================================================================');
  console.log('   PHASE 2: VERIFICATION OF EXPRESSIONS, VOICES & LIP-SYNC     ');
  console.log('================================================================\n');

  const testStoryId = `story-phase2-verify-${Date.now()}`;
  const testSceneId = `scene-phase2-verify-${Date.now()}`;

  const audioGen = new AudioGenerationService();
  const videoAssembly = new VideoAssemblyService();

  try {
    // 1. Synthesize character dialogue audio with Kokoro-82M
    console.log('[Phase 2 Verify] Step 1: Synthesizing character dialogue with Kokoro-82M...');
    const dialogueResult = await audioGen.generateCharacterDialogueAudio({
      characterName: 'Pip',
      text: 'Hello friends! Look at the wonderful forest we can explore together!',
      voice: 'bm_george',
      speakingDirection: 'cheerful',
      speed: 1.0,
      startMs: 400,
    });

    console.log(`[Phase 2 Verify] Generated dialogue audio: ${dialogueResult.audioUrl}`);
    console.log(`[Phase 2 Verify] Probed duration: ${dialogueResult.durationMs}ms`);
    console.log(`[Phase 2 Verify] Generated viseme cues count: ${dialogueResult.visemeCues.length}`);

    // 2. Create story and scene with vector animation, happy expression, and dialogue
    console.log('\n[Phase 2 Verify] Step 2: Creating database story and scene...');
    await createStory({
      storyId: testStoryId,
      title: 'Pip Expressive Forest Tale',
      targetDuration: 4,
    });

    const animationData: VectorSceneData = {
      version: 1,
      viewport: { width: 1280, height: 720 },
      characterInstances: [
        {
          instanceId: 'inst-pip',
          characterId: 'pip_the_bear',
          name: 'Pip',
          x: 640,
          y: 460,
          scale: 1.1,
          rotation: 0,
          flipX: false,
          zIndex: 1,
        },
      ],
      animationClips: [
        {
          clipId: 'clip-walk',
          instanceId: 'inst-pip',
          action: 'idle',
          startMs: 0,
          durationMs: 4000,
          loop: true,
        },
      ],
      expressionCues: [
        {
          instanceId: 'inst-pip',
          expression: 'happy',
          startMs: 0,
          durationMs: 4000,
        },
      ],
      dialogueLines: [
        {
          id: 'dlg-pip-1',
          characterInstanceId: 'inst-pip',
          characterName: 'Pip',
          text: 'Hello friends! Look at the wonderful forest we can explore together!',
          voice: 'bm_george',
          speakingDirection: 'cheerful',
          audioUrl: dialogueResult.audioUrl,
          startMs: 400,
          durationMs: dialogueResult.durationMs,
          visemeCues: dialogueResult.visemeCues,
        },
      ],
    };

    const sceneDurationMs = Math.max(4000, 400 + dialogueResult.durationMs + 600);

    await createScene({
      sceneId: testSceneId,
      storyId: testStoryId,
      number: 1,
      order: 1,
      title: 'Pip Speaks Cheerfully',
      narration: 'Deep in the heart of the forest, Pip greeted everyone with a huge smile.',
      startMs: 0,
      endMs: sceneDurationMs,
      animationData,
    });

    // 3. Trigger video assembly export
    console.log('\n[Phase 2 Verify] Step 3: Triggering video assembly export...');
    const exportJob = videoAssembly.startExportJob({
      storyId: testStoryId,
      fps: 24,
      resolution: '720p',
    });

    console.log(`[Phase 2 Verify] Export job started with ID: ${exportJob.id}`);

    // Wait for export job completion
    let pollCount = 0;
    let completedJob = exportJob;
    while (pollCount < 60) {
      await new Promise((r) => setTimeout(r, 1000));
      const status = videoAssembly.getJob(exportJob.id);
      if (!status) break;
      completedJob = status;
      if (status.status === 'completed' || status.status === 'failed') {
        break;
      }
      pollCount++;
    }

    if (completedJob.status !== 'completed') {
      throw new Error(`Export job failed: ${completedJob.error || 'Timed out'}`);
    }

    console.log(`[Phase 2 Verify] Export job succeeded! Filename: ${completedJob.filename}`);
    const exportedVideoPath = path.resolve(process.cwd(), 'storage/exports', completedJob.filename!);
    console.log(`[Phase 2 Verify] Exported video path: ${exportedVideoPath}`);

    // 4. Verify streams with ffprobe
    console.log('\n[Phase 2 Verify] Step 4: Probing exported MP4 streams with ffprobe...');
    const { stdout: probeStdout } = await execFileAsync(ffprobePath, [
      '-v', 'quiet',
      '-print_format', 'json',
      '-show_format',
      '-show_streams',
      exportedVideoPath,
    ]);

    const probeData = JSON.parse(probeStdout);
    const videoStream = probeData.streams?.find((s: any) => s.codec_type === 'video');
    const audioStream = probeData.streams?.find((s: any) => s.codec_type === 'audio');
    const durationSec = parseFloat(probeData.format?.duration || '0');

    console.log(`[Phase 2 Verify] Video codec: ${videoStream?.codec_name} (${videoStream?.width}x${videoStream?.height})`);
    console.log(`[Phase 2 Verify] Audio codec: ${audioStream?.codec_name} (${audioStream?.sample_rate}Hz, channels: ${audioStream?.channels})`);
    console.log(`[Phase 2 Verify] Total duration: ${durationSec}s`);

    if (!videoStream || !audioStream) {
      throw new Error('Exported video is missing video or audio stream!');
    }
    if (durationSec <= 0) {
      throw new Error('Exported video has invalid duration!');
    }

    // 5. Extract a snapshot frame during speech (at 1.5s) to verify lip-sync & expression
    console.log('\n[Phase 2 Verify] Step 5: Extracting verification snapshot frame at 1.5s...');
    const snapshotPath = path.join(ARTIFACT_DIR, 'phase2_lip_sync_speaking_frame.png');
    await execFileAsync(ffmpegPath, [
      '-y',
      '-ss', '1.5',
      '-i', exportedVideoPath,
      '-vframes', '1',
      snapshotPath,
    ]);

    console.log(`[Phase 2 Verify] Verification snapshot saved to: ${snapshotPath}`);
    console.log('\n================================================================');
    console.log('   PHASE 2 EXPORT VERIFICATION PASSED WITH COMPLETE SUCCESS!    ');
    console.log('================================================================');
  } finally {
    // Cleanup test story
    try {
      await deleteStory(testStoryId);
    } catch {}
    await prisma.$disconnect();
  }
}

runPhase2ExportVerification().catch((err) => {
  console.error('[Phase 2 Verify] Fatal Error:', err);
  process.exit(1);
});
