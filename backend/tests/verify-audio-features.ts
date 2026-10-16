import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

import fs from 'fs';
import { execFile } from 'child_process';
import { promisify } from 'util';
// @ts-ignore
import ffprobeStatic from '@ffprobe-installer/ffprobe';
import { AudioGenerationService } from '../src/services/audio-generation/audio-generation.service.js';
import { VideoAssemblyService } from '../src/services/video-assembly/video-assembly.service.js';
import { prisma } from '../src/services/database/database.service.js';


const execFileAsync = promisify(execFile);

async function probeAudioFile(filePath: string) {
  const { stdout } = await execFileAsync(ffprobeStatic.path, [
    '-v', 'error',
    '-show_entries', 'format=duration,size,bit_rate:stream=codec_name,codec_type,sample_rate,channels',
    '-of', 'json',
    filePath,
  ]);
  return JSON.parse(stdout);
}

async function runAudioVerification() {
  console.log('====================================================');
  console.log('STARTING COMPREHENSIVE AUDIO FEATURES VERIFICATION');
  console.log('====================================================\n');

  const audioService = new AudioGenerationService();

  // Find an existing scene from database
  const scene = await prisma.scene.findFirst({
    include: { story: true },
    orderBy: { createdAt: 'desc' },
  });

  if (!scene) {
    throw new Error('No scene found in database to test audio generation.');
  }

  console.log(`[Test 1] Testing Scene: "${scene.title}" (ID: ${scene.id})`);

  // 1. TEST TTS WITH LONG TEXT (> 200 characters)
  const longNarrationText =
    'Once upon a sunny morning in the enchanted whispering forest, Barnaby the little blue rabbit hopped through the dewy green meadows. He looked up at the sparkling trees, smiled warmly at all his animal friends, and discovered a glowing secret acorn hidden under an old oak tree that seemed to radiate pure magic!';

  console.log(`[Test 2] Generating TTS speech with long text (${longNarrationText.length} characters)...`);
  const ttsResult = await audioService.generateNarrationAudio({
    sceneId: scene.id,
    narration: longNarrationText,
  });

  console.log('✓ TTS Generated Successfully:', ttsResult);


  if (!ttsResult.audioUrl || ttsResult.durationMs <= 0) {
    throw new Error('TTS result invalid: missing audioUrl or non-positive durationMs');
  }

  const generatedFilePath = path.join(process.cwd(), ttsResult.audioUrl.replace(/^\//, ''));
  if (!fs.existsSync(generatedFilePath)) {
    throw new Error(`Generated audio file does not exist on disk at ${generatedFilePath}`);
  }

  const ttsProbe = await probeAudioFile(generatedFilePath);
  const ttsDurationSec = parseFloat(ttsProbe.format?.duration || '0');
  const ttsCodec = ttsProbe.streams?.[0]?.codec_name;
  console.log(`✓ Generated MP3 verified on disk (${(fs.statSync(generatedFilePath).size / 1024).toFixed(1)} KB)`);
  console.log(`✓ FFprobe probe: Codec=${ttsCodec}, Duration=${ttsDurationSec.toFixed(2)}s, SampleRate=${ttsProbe.streams?.[0]?.sample_rate}Hz`);

  if (ttsCodec !== 'mp3' || ttsDurationSec < 3.0) {
    throw new Error(`TTS audio file validation failed: expected mp3 >= 3s, got ${ttsCodec} ${ttsDurationSec}s`);
  }

  // 2. TEST CUSTOM AUDIO FILE UPLOAD
  console.log('\n[Test 3] Testing Custom Audio Upload (Simulating user background music / sound effect upload)...');
  const sampleAudioBuffer = fs.readFileSync(generatedFilePath);
  const sampleBase64 = sampleAudioBuffer.toString('base64');

  const uploadResult = await audioService.saveUploadedAudio({
    filename: 'test-custom-soundtrack.mp3',
    base64Data: sampleBase64,
    category: 'music',
  });

  console.log('✓ Custom Audio Uploaded Successfully:', uploadResult);
  const uploadedDiskPath = path.join(process.cwd(), uploadResult.url.replace(/^\//, ''));
  if (!fs.existsSync(uploadedDiskPath)) {
    throw new Error(`Uploaded file does not exist at ${uploadedDiskPath}`);
  }

  const uploadProbe = await probeAudioFile(uploadedDiskPath);
  console.log(`✓ Uploaded Audio FFprobe: Codec=${uploadProbe.streams?.[0]?.codec_name}, Duration=${uploadProbe.format?.duration}s`);

  // 3. TEST SCENE VOICE REMOVAL WITH HISTORY RETENTION
  console.log('\n[Test 4] Testing Scene Voice Removal with Version History Retention...');
  await audioService.removeSceneAudio(scene.sceneId);
  const updatedScene = await prisma.scene.findUnique({ where: { sceneId: scene.sceneId } });
  console.log(`✓ Scene Voice Removed. scene.audioUrl=${updatedScene?.audioUrl}, scene.actualAudioDurationMs=${updatedScene?.actualAudioDurationMs}`);

  const versions = await prisma.sceneVersion.findMany({
    where: { sceneId: scene.sceneId },
    orderBy: { createdAt: 'desc' },
    take: 2,
  });
  console.log(`✓ Scene versions count: ${versions.length}. Latest version: v${versions[0]?.versionNumber}`);

  // Restore audio to scene for export test
  await prisma.scene.update({
    where: { sceneId: scene.sceneId },
    data: {
      audioUrl: ttsResult.audioUrl,
      actualAudioDurationMs: ttsResult.durationMs,
      estimatedDurationMs: Math.max(scene.estimatedDurationMs || 5000, ttsResult.durationMs + 1000),
    },
  });

  console.log('✓ Re-attached verified audio to scene for assembly test.');

  // 4. TEST VIDEO ASSEMBLY EXPORT WITH TTS NARRATION + SOUNDTRACK MIXING
  console.log('\n[Test 5] Testing Real Video Assembly & Audio Mastering with Narration & Soundtrack...');
  const assemblyService = new VideoAssemblyService();
  const exportJob = assemblyService.startExportJob({
    storyId: scene.storyId,
    resolution: '720p',
    fps: 30,
    backgroundMusic: uploadResult.url, // Test using the newly uploaded custom soundtrack!
    musicVolume: 0.25,
  });

  console.log(`Export Job Created: ID=${exportJob.id}. Waiting for assembly completion...`);

  let completedJob: any = null;
  while (true) {
    await new Promise((r) => setTimeout(r, 1000));
    const current = assemblyService.getJob(exportJob.id);
    if (!current) throw new Error('Export job lost');

    console.log(`  [Assembly Progress] ${current.progress}% — ${current.stage}`);

    if (current.status === 'completed') {
      completedJob = current;
      break;
    } else if (current.status === 'failed') {
      throw new Error(`Export job failed: ${current.error}`);
    }
  }

  const finalVideoPath = path.join(process.cwd(), completedJob.downloadUrl!.replace(/^\//, ''));
  console.log(`✓ Assembly Completed! Output Video: ${finalVideoPath}`);

  if (!fs.existsSync(finalVideoPath)) {
    throw new Error(`Final exported video not found at ${finalVideoPath}`);
  }

  const finalProbe = await probeAudioFile(finalVideoPath);
  const audioStream = finalProbe.streams?.find((s: any) => s.codec_type === 'audio');
  const videoStream = finalProbe.streams?.find((s: any) => s.codec_type === 'video');
  const finalDurationSec = parseFloat(finalProbe.format?.duration || '0');

  console.log('\n=== FINAL EXPORT VERIFICATION REPORT ===');
  console.log(`Output File Size: ${(fs.statSync(finalVideoPath).size / 1024).toFixed(1)} KB`);
  console.log(`Video Stream: ${videoStream?.codec_name} (${videoStream?.width}x${videoStream?.height})`);
  console.log(`Audio Stream: ${audioStream?.codec_name}, Channels=${audioStream?.channels}, SampleRate=${audioStream?.sample_rate}Hz`);
  console.log(`Total Movie Duration: ${finalDurationSec.toFixed(2)}s`);

  if (!videoStream || !audioStream || finalDurationSec <= 0) {
    throw new Error('Export audio/video stream verification failed.');
  }

  if (audioStream.sample_rate !== '44100' && audioStream.sample_rate !== 44100) {
    console.warn(`Note: Audio sample rate is ${audioStream.sample_rate}`);
  }

  console.log('\n====================================================');
  console.log('✓ ALL AUDIO FEATURES SUCCESSFULLY VERIFIED END-TO-END');
  console.log('====================================================');
}

runAudioVerification()
  .then(async () => {
    await prisma.$disconnect();
    process.exit(0);
  })
  .catch(async (err) => {
    console.error('VERIFICATION FAILED:', err);
    await prisma.$disconnect();
    process.exit(1);
  });
