import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

import fs from 'fs';
import {
  prisma,
  deleteStory,
  deleteCharacter,
  getStoryByStoryId,
  getScenesByStoryId,
} from '../src/services/database/database.service.js';
import { StoryGenerationService } from '../src/services/story-generation/story-generation.service.js';
import { StoryProviderFactory } from '../src/services/story-generation/providers/story-provider.factory.js';
import { DeterministicStoryProvider } from '../src/services/story-generation/providers/deterministic-story.provider.js';
import { VideoAssemblyService } from '../src/services/video-assembly/video-assembly.service.js';
// @ts-ignore
import ffprobeStatic from '@ffprobe-installer/ffprobe';
import { execFile } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

// Ensure deterministic story generation for fast and reliable test execution
StoryProviderFactory.setMockProvider(new DeterministicStoryProvider());

async function verifyStructuredStoryExport() {
  console.log('=== [E2E] Verifying Structured Story Generation -> 2D Vector Animation -> MP4 Video Export ===');

  let testStoryId: string | null = null;
  const createdCharIds: string[] = [];

  try {
    // 1. Generate and persist complete structured story
    console.log('1. Generating structured story with scenes and 2D vector character animations...');
    const result = await StoryGenerationService.generateAndPersistStory({
      topic: 'Pip the Bear explores the magic forest with Sammy',
      title: 'Pip and Sammy Forest Magic',
      ageGroup: '4-7 years',
      desiredDurationSeconds: 15, // Compact duration for quick verification
      language: 'en',
      genre: 'Adventure',
      lesson: 'Helping friends makes any adventure magical',
    });

    testStoryId = result.story.storyId;
    result.characters.forEach((c) => {
      if (!c.isExisting && c.id) createdCharIds.push(c.id);
    });

    console.log(`✓ Story created: ${result.story.title} (${testStoryId})`);
    console.log(`✓ Scenes created: ${result.scenes.length}`);

    // Verify scenes in DB
    const dbScenes = await getScenesByStoryId(testStoryId);
    console.log(`✓ Verified ${dbScenes.length} scenes in database`);

    // Verify first scene animation data
    const firstScene = dbScenes[0];
    const animData = firstScene.animationData as any;
    console.log('Scene 1 animation characters:', animData?.characterInstances?.length || 0);
    console.log('Scene 1 animation clips:', animData?.animationClips?.length || 0);

    // 2. Start Real Video Assembly Export Job
    console.log('2. Starting Video Assembly Export Job...');
    const assemblyService = new VideoAssemblyService();
    const job = assemblyService.startExportJob({
      storyId: testStoryId,
      resolution: '720p',
      fps: 15,
      backgroundMusic: 'gentle-storybook',
      musicVolume: 0.15,
    });
    console.log('Export Job ID:', job.id);

    // 3. Poll for completion
    let attempts = 0;
    let completedJob: any = null;

    while (attempts < 150) {
      await new Promise((r) => setTimeout(r, 1000));
      attempts++;
      const current = assemblyService.getJob(job.id);
      if (!current) throw new Error('Job disappeared from tracker');

      if (current.status === 'completed') {
        completedJob = current;
        break;
      }
      if (current.status === 'failed') {
        throw new Error(`Export job failed: ${current.error}`);
      }
      if (attempts % 5 === 0) {
        console.log(`  Export progress: ${current.progress}% (${current.stage || 'processing'})`);
      }
    }

    if (!completedJob) {
      throw new Error('Export timed out after 150 seconds');
    }

    console.log('✓ Video Export Succeeded!');
    const videoRelative = (completedJob.downloadUrl || (completedJob as any).outputPath || '').replace(/^\//, '');
    const videoFullPath = path.resolve(process.cwd(), videoRelative);
    console.log('Validating output file on disk:', videoFullPath);

    if (!fs.existsSync(videoFullPath)) {
      throw new Error(`Rendered video file not found at ${videoFullPath}`);
    }

    const stats = fs.statSync(videoFullPath);
    console.log(`Video File Size: ${(stats.size / 1024).toFixed(1)} KB`);

    // 4. Validate with FFprobe
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

    console.log('=== FFprobe Stream Inspection ===');
    console.log('Video Codec:', videoStream?.codec_name);
    console.log('Resolution:', `${videoStream?.width}x${videoStream?.height}`);
    console.log('Duration:', `${probeData.format?.duration}s`);

    if (videoStream?.width !== 1280 || videoStream?.height !== 720) {
      throw new Error(`Invalid resolution: ${videoStream?.width}x${videoStream?.height}`);
    }

    const durationNum = parseFloat(probeData.format?.duration || '0');
    if (durationNum <= 0) {
      throw new Error(`Invalid duration: ${durationNum}`);
    }

    console.log('🎉 SUCCESS: Structured story generation, vector animation rendering, and video export fully verified!');
  } finally {
    // Cleanup test story and characters
    if (testStoryId) {
      console.log('Cleaning up test story:', testStoryId);
      await deleteStory(testStoryId).catch(() => {});
    }
    for (const cId of createdCharIds) {
      await deleteCharacter(cId).catch(() => {});
    }
  }
}

verifyStructuredStoryExport()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('VERIFICATION FAILED:', err);
    process.exit(1);
  });
