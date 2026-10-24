import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

import fs from 'fs';
import { promisify } from 'util';
import { execFile } from 'child_process';
// @ts-ignore
import ffprobeStatic from '@ffprobe-installer/ffprobe';
import { prisma, getScenesByStoryId, updateScene } from '../services/database/database.service.js';
import { StoryImporterService } from '../services/story-generation/story-importer.service.js';
import { AudioGenerationService } from '../services/audio-generation/audio-generation.service.js';
import { VideoAssemblyService } from '../services/video-assembly/video-assembly.service.js';

const execFileAsync = promisify(execFile);

const FOUR_SEASONS_SCRIPT = `# Title: Earth's Promise: The Four Seasons
Logline: Earth teaches children how the four seasons bring balance, beauty, and life to our planet.
Lesson: Every season has a special purpose in nature.

## Characters
- Earth (Protagonist): Our smiling, wise living planet with blue oceans and green continents.

## Scene 1: Golden Summer
Visual: Sun-drenched golden meadows with distant mountains, vibrant sunshine rays and heat shimmer.
Narration: ग्रीष्म ऋतु में सूरज अपनी सुनहरी किरणें बिखेरता है और प्रकृति खिल उठती है।
Earth: नमस्ते नन्हे दोस्तों! मैं तुम्हारी पृथ्वी हूँ। देखो, सूरज की धूप फसलों को पका रही है! (Emotion: happy)

## Scene 2: The Monsoon Rain
Visual: Lush green hills and valleys covered in fresh gentle monsoon rain, rolling clouds and water splashes.
Narration: वर्षा ऋतु में काले बादल गरजते हैं और ठंडी बारिश सूखी धरती को नया जीवन देती है।
Earth: आहा! बारिश की हर बूंद नदियों और झरनों में नई जान फूंक देती है। (Emotion: excited)

## Scene 3: Peaceful Winter
Visual: Serene snowy forest with pine trees covered in soft snowfall, gentle fog and mist.
Narration: शीत ऋतु में बर्फ की सफेद चादर बिछ जाती है और पेड़-पौधे विश्राम करते हैं।
Earth: सर्दी हमें सिखाती है कि नए जीवन की तैयारी के लिए विश्राम भी जरूरी है। (Emotion: calm)

## Scene 4: Colorful Autumn
Visual: Forest hills with golden falling leaves swirling in the breeze and flying birds in the sky.
Narration: शरद ऋतु में पत्ते सुनहरे होकर गिरते हैं और पक्षी सुहाने मौसम में उड़ते हैं।
Earth: पतझड़ के बाद नया बसंत आता है! प्रकृति का यह चक्र हमेशा मुस्कुराता रहता है। (Emotion: cheerful)
`;

async function main() {
  console.log('================================================================');
  console.log('🚀 SEEDING DEMONSTRATION STORY: "Earth\'s Promise: The Four Seasons"');
  console.log('================================================================');

  const audioGen = new AudioGenerationService();
  const assembly = new VideoAssemblyService();

  // 1. Import and persist story via StoryImporterService
  console.log('\n[Step 1] Importing story via StoryImporterService...');
  const imported = await StoryImporterService.importAndPersistStory({
    rawText: FOUR_SEASONS_SCRIPT,
    title: "Earth's Promise: The Four Seasons",
    language: 'Hindi',
    genre: 'Educational',
    visualStyle: 'Storybook',
    ageGroup: '4-7 years',
  });

  const storyId = imported.storyId;
  console.log(`✓ Story created in database: ${storyId} ("${imported.story.title}")`);
  console.log(`✓ Scenes prepared: ${imported.scenes.length}`);
  console.log(`✓ Characters resolved: ${imported.characters.length} (${imported.characters.map((c: any) => c.name).join(', ')})`);

  // 2. Synthesize Hindi Narration Audio for all scenes
  console.log('\n[Step 2] Synthesizing Kokoro-82M Hindi Narration Audio (hf_alpha)...');
  const scenes = await getScenesByStoryId(storyId, false);
  for (let i = 0; i < scenes.length; i++) {
    const sc = scenes[i];
    console.log(`  Generating Hindi narration for Scene ${sc.number || i + 1}: "${sc.title}"...`);
    try {
      const narrRes = await audioGen.generateNarrationAudio({
        sceneId: sc.sceneId,
        narration: sc.narration || '',
        lang: 'hi',
        voice: 'hf_alpha',
        speed: 1.0,
      });
      console.log(`    ✓ Audio generated: ${narrRes.audioUrl} (${narrRes.durationMs}ms, ${narrRes.provider})`);
      await updateScene(sc.sceneId, {
        audioUrl: narrRes.audioUrl,
        actualAudioDurationMs: narrRes.durationMs,
        endMs: Math.max(sc.endMs || 5000, narrRes.durationMs),
      });
    } catch (err: any) {
      console.warn(`    ⚠️ Narration audio notice for Scene ${sc.number}:`, err?.message || err);
    }
  }

  // 3. Synthesize Character Dialogue Audio for all scenes
  console.log('\n[Step 3] Synthesizing Character Dialogue Audio (Kokoro-82M Hindi hf_alpha)...');
  try {
    const genDialogues = await audioGen.generateAllStoryDialogues(storyId);
    console.log(`✓ Synthesized ${genDialogues.length} character dialogue lines with Kokoro Hindi voice & emotions.`);
  } catch (err: any) {
    console.warn(`⚠️ Dialogue generation notice:`, err?.message || err);
  }

  // Helper to wait for export job completion
  async function waitForExport(jobId: string, label: string) {
    console.log(`\nWaiting for ${label} export job ${jobId}...`);
    while (true) {
      await new Promise((r) => setTimeout(r, 1200));
      const job = assembly.getJob(jobId);
      if (!job) throw new Error(`Job ${jobId} not found`);

      if (job.status === 'processing') {
        process.stdout.write(`\r  [${label}] ${job.progress}% — ${job.stage}`);
      } else if (job.status === 'completed') {
        process.stdout.write(`\r  [${label}] 100% — Complete!\n`);
        return job;
      } else if (job.status === 'failed') {
        throw new Error(`Export job failed: ${job.error}`);
      }
    }
  }

  // Helper to inspect MP4 with ffprobe
  async function inspectMp4(filePath: string, label: string) {
    const ffprobePath = ffprobeStatic?.path || 'ffprobe';
    const { stdout } = await execFileAsync(ffprobePath, [
      '-v', 'error',
      '-show_entries', 'format=duration,size:stream=codec_name,codec_type,width,height',
      '-of', 'json',
      filePath,
    ]);

    const data = JSON.parse(stdout);
    const videoStream = data.streams?.find((s: any) => s.codec_type === 'video');
    const audioStream = data.streams?.find((s: any) => s.codec_type === 'audio');
    const duration = parseFloat(data.format?.duration || '0');
    const size = parseInt(data.format?.size || '0', 10);

    console.log(`\n--- [FFprobe Verification: ${label}] ---`);
    console.log(`  File: ${filePath}`);
    console.log(`  Size: ${(size / (1024 * 1024)).toFixed(2)} MB (${size} bytes)`);
    console.log(`  Duration: ${duration.toFixed(2)} seconds`);
    console.log(`  Video Stream: ${videoStream?.codec_name} (${videoStream?.width} × ${videoStream?.height})`);
    console.log(`  Audio Stream: ${audioStream?.codec_name}`);

    if (!videoStream || videoStream.codec_name !== 'h264') {
      throw new Error(`Missing H.264 video stream in ${label}`);
    }
    if (!audioStream || audioStream.codec_name !== 'aac') {
      throw new Error(`Missing AAC audio stream in ${label}`);
    }
    if (duration <= 0 || size <= 1000) {
      throw new Error(`Invalid video output: duration=${duration}, size=${size}`);
    }

    return { videoStream, audioStream, duration, size };
  }

  // 4. Export Video A: Full 16:9 Landscape MP4
  console.log('\n================================================================');
  console.log('🎬 [Export A] Rendering 16:9 Landscape Movie (1280 × 720)...');
  console.log('================================================================');
  const job16x9 = assembly.startExportJob({
    storyId,
    format: '16:9',
    resolution: '720p',
    fps: 30,
    backgroundMusic: 'gentle-storybook',
    musicVolume: 0.18,
  });

  const completed16x9 = await waitForExport(job16x9.id, '16:9 Landscape');
  const path16x9 = path.join(process.cwd(), completed16x9.downloadUrl!.replace(/^\//, ''));
  const stats16x9 = await inspectMp4(path16x9, '16:9 Landscape Video');

  // 5. Export Video B: Vertical 9:16 Reel / Short MP4
  console.log('\n================================================================');
  console.log('📱 [Export B] Rendering 9:16 Vertical Reel / Short (720 × 1280)...');
  console.log('================================================================');
  const job9x16 = assembly.startExportJob({
    storyId,
    format: '9:16',
    resolution: '720p',
    fps: 30,
    backgroundMusic: 'gentle-storybook',
    musicVolume: 0.18,
  });

  const completed9x16 = await waitForExport(job9x16.id, '9:16 Vertical Reel');
  const path9x16 = path.join(process.cwd(), completed9x16.downloadUrl!.replace(/^\//, ''));
  const stats9x16 = await inspectMp4(path9x16, '9:16 Vertical Reel');

  console.log('\n================================================================');
  console.log('🎉 BOTH VIDEO EXPORTS SUCCEEDED WITH VERIFIED PLAYABLE STREAMS!');
  console.log('================================================================');
  console.log(`Story ID: ${storyId}`);
  console.log(`16:9 Landscape: ${completed16x9.downloadUrl} (${stats16x9.videoStream.width}x${stats16x9.videoStream.height}, ${stats16x9.duration.toFixed(1)}s)`);
  console.log(`9:16 Vertical Reel: ${completed9x16.downloadUrl} (${stats9x16.videoStream.width}x${stats9x16.videoStream.height}, ${stats9x16.duration.toFixed(1)}s)`);

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error('\n❌ Fatal error in seed-four-seasons-story:', err);
  prisma.$disconnect();
  process.exit(1);
});

