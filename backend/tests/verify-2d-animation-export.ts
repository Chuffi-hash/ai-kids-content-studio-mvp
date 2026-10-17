import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

import fs from 'fs';
import { prisma, createStory, createScene } from '../src/services/database/database.service.js';
import { VideoAssemblyService } from '../src/services/video-assembly/video-assembly.service.js';
import { AudioGenerationService } from '../src/services/audio-generation/audio-generation.service.js';
// @ts-ignore
import ffprobeStatic from '@ffprobe-installer/ffprobe';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { VectorSceneData } from '../src/services/animation/vector-animation.engine.js';

const execFileAsync = promisify(execFile);

async function verify2dAnimationExport() {
  console.log('=== [E2E] Verifying 2D Vector Animation Studio Pipeline ===');

  // 1. Create a test story in PostgreSQL
  const testStoryId = `story-anim-${Date.now()}`;
  try {
    const story = await createStory({
    id: testStoryId,
    storyId: testStoryId,
    title: 'Pip the Bear 2D Animation Studio Test',
    logline: 'Testing the 2D vector animation rig, motion path, and real MP4 rendering.',
    lesson: 'Teamwork and creativity create wonderful animations.',
  });
  console.log('✓ Created test story:', story.storyId);

  // 2. Generate Narration Audio (TTS)
  const narrationText = 'Pip the bear is walking across the forest stage on a crisp morning.';
  console.log('Generating TTS narration audio...');
  const audioService = new AudioGenerationService();
  const ttsResult = await audioService.generateNarrationAudio({
    sceneId: 'temp-preview',
    narration: narrationText,
    lang: 'en',
  });
  console.log('✓ TTS Narration generated:', ttsResult.audioUrl, `(${ttsResult.durationMs}ms)`);

  // 3. Construct 2D Vector Animation Data (Pip the Bear walking with motion path)
  const animationData: VectorSceneData = {
    version: 1,
    viewport: { width: 1280, height: 720 },
    characterInstances: [
      {
        instanceId: 'char-pip-01',
        characterId: 'pip_the_bear',
        assetType: 'vector_rig',
        name: 'Pip the Bear',
        x: 300,
        y: 480,
        scale: 1.0,
        rotation: 0,
        flipX: false,
        zIndex: 1,
      },
    ],
    animationClips: [
      {
        clipId: 'clip-walk-01',
        instanceId: 'char-pip-01',
        action: 'walk',
        startMs: 0,
        durationMs: 3000,
        loop: false,
        speedMultiplier: 1.0,
        motionMode: 'motion_path',
        motionPath: {
          startX: 260,
          startY: 480,
          endX: 860,
          endY: 480,
          easing: 'easeInOut',
        },
      },
    ],
  };

  // 4. Create Scene in Database with animationData
  const sceneDuration = Math.max(3000, Math.ceil(ttsResult.durationMs / 1000) * 1000);
  const testSceneId = `scene-anim-${Date.now()}`;
  const scene = await createScene({
    id: testSceneId,
    sceneId: testSceneId,
    storyId: story.storyId,
    number: 1,
    order: 0,
    title: 'Scene 1: Pip Walks In',
    narration: narrationText,
    visualPrompt: 'A stylized 2D woodland clearing with trees.',
    cameraDirection: 'Eye level wide establishing shot',
    startMs: 0,
    endMs: sceneDuration,
    estimatedDurationMs: sceneDuration,
    audioUrl: ttsResult.audioUrl,
    actualAudioDurationMs: ttsResult.durationMs,
    animationData,
  });
  console.log('✓ Created scene with animationData in database:', scene.sceneId, `duration: ${sceneDuration}ms`);

  // 5. Start Real Video Assembly Export Job
  const assemblyService = new VideoAssemblyService();
  console.log('Starting Video Assembly Export Job...');
  const job = assemblyService.startExportJob({
    storyId: story.storyId,
    resolution: '720p',
    fps: 30,
    backgroundMusic: 'gentle-storybook',
    musicVolume: 0.2,
  });
  console.log('Export Job ID:', job.id);

  // 6. Poll for completion
  while (true) {
    await new Promise((r) => setTimeout(r, 1000));
    const current = assemblyService.getJob(job.id);
    if (!current) throw new Error('Job disappeared from tracker');

    console.log(`[Status: ${current.status}] Progress: ${current.progress}% — ${current.stage}`);

    if (current.status === 'completed') {
      const outputPath = path.join(process.cwd(), current.downloadUrl!.replace(/^\//, ''));
      console.log('✓ Video Assembly Finished! Output file:', outputPath);

      if (!fs.existsSync(outputPath)) {
        throw new Error(`Output file not found on disk at: ${outputPath}`);
      }

      const fileStats = fs.statSync(outputPath);
      console.log('✓ MP4 File Size on Disk:', fileStats.size, 'bytes');
      if (fileStats.size <= 1000) {
        throw new Error(`Exported video is unexpectedly small: ${fileStats.size} bytes`);
      }

      // 7. Verify with FFprobe
      const { stdout } = await execFileAsync(ffprobeStatic.path, [
        '-v', 'error',
        '-show_entries', 'format=duration,size:stream=codec_name,codec_type,width,height',
        '-of', 'json',
        outputPath,
      ]);

      const probeData = JSON.parse(stdout);
      const videoStream = probeData.streams?.find((s: any) => s.codec_type === 'video');
      const audioStream = probeData.streams?.find((s: any) => s.codec_type === 'audio');
      const duration = parseFloat(probeData.format?.duration || '0');

      console.log('--- FFprobe Inspection ---');
      console.log('Video Codec:', videoStream?.codec_name, `${videoStream?.width}x${videoStream?.height}`);
      console.log('Audio Codec:', audioStream?.codec_name);
      console.log('Total Duration:', duration.toFixed(2), 'seconds');

      if (!videoStream || videoStream.codec_name !== 'h264') {
        throw new Error('Verification failed: Missing or invalid H.264 video stream');
      }
      if (!audioStream || audioStream.codec_name !== 'aac') {
        throw new Error('Verification failed: Missing or invalid AAC audio stream');
      }
      if (duration < 2.0) {
        throw new Error(`Verification failed: Video duration too short (${duration}s)`);
      }

      console.log('\n🎉 ALL 2D VECTOR ANIMATION PIPELINE VERIFICATIONS PASSED SUCCESSFULLY!');
      return;
    } else if (current.status === 'failed') {
      console.error('❌ Video Assembly Failed:', current.error);
      throw new Error(`Video assembly failed: ${current.error}`);
    }
  }
  } finally {
    try {
      await prisma.image.deleteMany({ where: { scene: { storyId: testStoryId } } });
      await prisma.sceneVersion.deleteMany({ where: { scene: { storyId: testStoryId } } });
      await prisma.scene.deleteMany({ where: { storyId: testStoryId } });
      await prisma.story.delete({ where: { storyId: testStoryId } });
    } catch (_) {}
  }
}

verify2dAnimationExport().catch((err) => {
  console.error('Fatal Verification Error:', err);
  process.exit(1);
});
