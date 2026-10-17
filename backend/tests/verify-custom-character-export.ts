import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

import fs from 'fs';
import {
  prisma,
  createStory,
  createScene,
  createCharacter,
  getCharacterByName,
  linkStoryCharacter,
  deleteStory,
  deleteCharacter,
} from '../src/services/database/database.service.js';
import { VideoAssemblyService } from '../src/services/video-assembly/video-assembly.service.js';
import { AudioGenerationService } from '../src/services/audio-generation/audio-generation.service.js';
import {
  buildRigFromAppearance,
  CHARACTER_PRESETS,
} from '../src/services/animation/templates/custom-character-rig.js';
// @ts-ignore
import ffprobeStatic from '@ffprobe-installer/ffprobe';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { VectorSceneData } from '../src/services/animation/vector-animation.engine.js';
import { randomUUID } from 'crypto';

const execFileAsync = promisify(execFile);

async function verifyCustomCharacterExport() {
  console.log('=== [E2E] Verifying Custom Character Builder & Video Export Pipeline ===');

  const testStoryId = `story-custom-anim-${Date.now()}`;
  const testCharId = `char-custom-${Date.now()}`;

  try {
    // 1. Create a custom character with custom appearance
    const customAppearance = {
      ...CHARACTER_PRESETS['kid_girl'].appearance,
      torso: {
        ...CHARACTER_PRESETS['kid_girl'].appearance.torso,
        clothingStyle: 'hoodie' as const,
        shirtColor: '#9333ea', // Purple hoodie
        pattern: 'star' as const,
      },
      hair: {
        style: 'ponytail' as const,
        color: '#b45309',
      },
    };

    const existingMaya = await getCharacterByName('Maya Custom Explorer');
    if (existingMaya) {
      await deleteCharacter(existingMaya.id);
    }

    const character = await createCharacter({
      id: testCharId,
      name: 'Maya Custom Explorer',
      species: 'Human',
      personality: 'Inventive and courageous',
      visualDescription: 'A smart girl with purple hoodie and ponytail',
      distinctiveFeatures: 'Star badge on purple hoodie',
      canonicalAppearance: customAppearance,
    });
    console.log('✓ Created custom character:', character.name, `(${character.id})`);

    // 2. Create story in PostgreSQL and link the custom character
    const story = await createStory({
      id: testStoryId,
      storyId: testStoryId,
      title: "Maya's Space Station Journey",
      logline: 'Maya tests her custom vector rig across an animated sci-fi stage.',
      lesson: 'Courage and curiosity guide the way.',
      genre: 'Adventure',
      audience: '4-7 years',
      targetDuration: 5000,
    });
    console.log('✓ Created test story:', story.storyId);

    await linkStoryCharacter({
      id: randomUUID(),
      storyId: testStoryId,
      characterId: character.id,
    });
    console.log('✓ Linked custom character to story');

    // 3. Generate Narration Audio (TTS)
    const narrationText = 'Maya takes her first steps on the new station platform, waving to her crew.';
    console.log('Generating TTS narration audio...');
    const audioService = new AudioGenerationService();
    const ttsResult = await audioService.generateNarrationAudio({
      sceneId: 'temp-custom-preview',
      narration: narrationText,
      lang: 'en',
    });
    console.log('✓ TTS Narration generated:', ttsResult.audioUrl, `(${ttsResult.durationMs}ms)`);

    // 4. Build Custom Character Rig and Animation Clips
    const customRig = buildRigFromAppearance(character.id, character.name, customAppearance);

    const animationData: VectorSceneData = {
      version: 1,
      viewport: { width: 1280, height: 720 },
      characterInstances: [
        {
          instanceId: 'char-maya-01',
          characterId: character.id,
          assetType: 'vector_rig',
          name: character.name,
          x: 200,
          y: 480,
          scale: 1.0,
          rotation: 0,
          flipX: false,
          zIndex: 1,
          customRig,
          appearance: customAppearance,
        },
      ],
      animationClips: [
        {
          clipId: 'clip-walk-01',
          instanceId: 'char-maya-01',
          action: 'walk',
          startMs: 0,
          durationMs: 2000,
          loop: false,
          motionMode: 'motion_path',
          motionPath: {
            startX: 200,
            startY: 480,
            endX: 640,
            endY: 480,
            easing: 'easeInOut',
          },
        },
        {
          clipId: 'clip-wave-02',
          instanceId: 'char-maya-01',
          action: 'wave',
          startMs: 2000,
          durationMs: 2000,
          loop: true,
        },
      ],
    };

    // 5. Create Scene in Database with animationData
    const sceneDuration = Math.max(4000, Math.ceil(ttsResult.durationMs / 1000) * 1000);
    const testSceneId = `scene-custom-anim-${Date.now()}`;
    const scene = await createScene({
      id: testSceneId,
      sceneId: testSceneId,
      storyId: story.storyId,
      number: 1,
      order: 0,
      title: 'Scene 1: Maya Waves on Stage',
      narration: narrationText,
      visualPrompt: 'Futuristic sci-fi orbital platform.',
      cameraDirection: 'Eye level wide shot',
      startMs: 0,
      endMs: sceneDuration,
      estimatedDurationMs: sceneDuration,
      audioUrl: ttsResult.audioUrl,
      actualAudioDurationMs: ttsResult.durationMs,
      animationData,
    });
    console.log('✓ Created scene with custom animationData:', scene.sceneId, `(${sceneDuration}ms)`);

    // 6. Start Real Video Assembly Export Job
    const assemblyService = new VideoAssemblyService();
    console.log('Starting Real Video Assembly Export Job with Custom Character...');
    const job = assemblyService.startExportJob({
      storyId: story.storyId,
      resolution: '720p',
      fps: 30,
      backgroundMusic: 'playful-adventure',
      musicVolume: 0.15,
    });
    console.log('Export Job ID:', job.id);

    // 7. Poll for completion
    while (true) {
      await new Promise((r) => setTimeout(r, 1000));
      const current = assemblyService.getJob(job.id);
      if (!current) throw new Error('Job disappeared from tracker');

      if (current.status === 'completed') {
        console.log('✓ Video Export Succeeded!');
        const videoRelative = (current.downloadUrl || (current as any).outputPath || '').replace(/^\//, '');
        const videoFullPath = path.resolve(process.cwd(), videoRelative);
        console.log('Validating output file on disk:', videoFullPath);
        if (!fs.existsSync(videoFullPath)) {
          throw new Error(`Rendered video file not found at ${videoFullPath}`);
        }
        const stats = fs.statSync(videoFullPath);
        console.log(`Video File Size: ${(stats.size / 1024 / 1024).toFixed(2)} MB`);

        const ffprobePath = ffprobeStatic.path;
        const { stdout } = await execFileAsync(ffprobePath, [
          '-v', 'quiet',
          '-print_format', 'json',
          '-show_format',
          '-show_streams',
          videoFullPath,
        ]);
        const probeData = JSON.parse(stdout);
        const videoStream = probeData.streams?.find((s: any) => s.codec_type === 'video');
        const audioStream = probeData.streams?.find((s: any) => s.codec_type === 'audio');

        console.log('=== FFprobe Stream Inspection ===');
        console.log('Video Codec:', videoStream?.codec_name);
        console.log('Resolution:', `${videoStream?.width}x${videoStream?.height}`);
        console.log('Duration:', `${probeData.format?.duration}s`);
        console.log('Audio Codec:', audioStream?.codec_name);
        console.log('Audio Channels:', audioStream?.channels);

        if (videoStream?.width !== 1280 || videoStream?.height !== 720) {
          throw new Error(`Unexpected video resolution: ${videoStream?.width}x${videoStream?.height}`);
        }
        if (videoStream?.codec_name !== 'h264') {
          throw new Error(`Unexpected video codec: ${videoStream?.codec_name}`);
        }
        if (!audioStream) {
          throw new Error('Expected audio stream with narration and background music mix');
        }

        console.log('✓ [VERIFIED] Custom Character Video Export satisfies all requirements!');
        break;
      } else if (current.status === 'failed') {
        throw new Error(`Export job failed: ${current.error}`);
      } else {
        console.log(`Rendering progress: ${current.progress}% (${current.stage})`);
      }
    }
  } finally {
    // 9. Cleanup test records
    console.log('Cleaning up test data...');
    try {
      await deleteStory(testStoryId);
      await deleteCharacter(testCharId);
      console.log('✓ Cleaned up test story and custom character');
    } catch (cleanErr) {
      console.warn('Cleanup warning:', cleanErr);
    }
  }
}

verifyCustomCharacterExport().catch((err) => {
  console.error('❌ Verification failed:', err);
  process.exit(1);
});

