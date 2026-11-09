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

import express from 'express';
import { contentRouter } from '../src/routes/content.js';
import { productionRouter } from '../src/routes/production.js';
import { createStory, createScene, deleteStory } from '../src/services/database/database.service.js';
import { VideoAssemblyService } from '../src/services/video-assembly/video-assembly.service.js';

const execFileAsync = promisify(execFile);
const ffprobePath = (ffprobeStatic as any)?.path || 'ffprobe';
const ffmpegPath = (ffmpegStatic as any)?.path || 'ffmpeg';

test('AI Director & Video Variations Verification', async (t) => {
  // Set up in-memory Express server for API route testing
  const app = express();
  app.use(express.json());
  app.use('/api/content', contentRouter);
  app.use('/api/production', productionRouter);

  const server = app.listen(0);
  const address = server.address() as any;
  const baseUrl = `http://127.0.0.1:${address.port}`;

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
  // Test 1: AI Director Idempotency & Lifecycle States
  // -------------------------------------------------------------
  await t.test('1. AI Director handles idempotencyKey and transitions through lifecycle states', async () => {
    const idempotencyKey = `idemp-key-${Date.now()}`;
    const payload = {
      topic: 'A little bird learning to fly in the forest',
      language: 'Hindi',
      format: '16:9',
      resolution: '720p',
      fps: 30,
      desiredDurationSeconds: 4,
      sceneCount: 1,
      idempotencyKey,
    };

    // First request -> 202 Accepted
    const res1 = await fetch(`${baseUrl}/api/content/story/director`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    assert.equal(res1.status, 202, 'First request should return 202 Accepted');
    const data1 = await res1.json();
    assert.ok(data1.success);
    assert.ok(data1.directorJobId);
    assert.ok(data1.statusUrl);

    // Second request with same idempotencyKey -> 200 OK with same job ID
    const res2 = await fetch(`${baseUrl}/api/content/story/director`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    assert.equal(res2.status, 200, 'Duplicate request with same idempotencyKey should return 200');
    const data2 = await res2.json();
    assert.equal(data2.directorJobId, data1.directorJobId, 'Should return matching directorJobId');

    // Poll status until complete or failed
    const observedStates = new Set<string>();
    let finalStatus: any = null;
    const startTime = Date.now();
    const timeoutMs = 240000; // 4 minutes to accommodate multi-scene TTS and Remotion frame render

    while (Date.now() - startTime < timeoutMs) {
      const pollRes = await fetch(`${baseUrl}/api/content/story/director/${data1.directorJobId}`);
      assert.equal(pollRes.status, 200);
      const statusData = await pollRes.json();
      observedStates.add(statusData.status);
      observedStates.add(statusData.lifecycleState);

      if (statusData.status === 'COMPLETED' || statusData.status === 'FAILED') {
        finalStatus = statusData;
        break;
      }
      await new Promise((r) => setTimeout(r, 800));
    }

    assert.ok(finalStatus, 'Job should reach terminal state within timeout');
    console.log('[AIDirector Test] Observed states:', Array.from(observedStates));
    console.log('[AIDirector Test] Final status:', finalStatus.status, 'downloadUrl:', finalStatus.downloadUrl);

    assert.equal(finalStatus.status, 'COMPLETED', `AI Director job should succeed: ${finalStatus.error}`);
    assert.equal(finalStatus.progress, 100, 'Completed job must have progress = 100');
    assert.ok(finalStatus.downloadUrl, 'Completed job must have downloadUrl');

    // Verify the produced export file on disk
    const exportFile = path.resolve(process.cwd(), finalStatus.downloadUrl.replace(/^\//, ''));
    assert.ok(fs.existsSync(exportFile), `Exported file ${exportFile} must exist`);

    const probe = await probeVideo(exportFile);
    assert.ok(probe.videoStream, 'Must have video stream');
    assert.equal(probe.videoStream.codec_name, 'h264');
    assert.ok(probe.audioStream, 'Must have audio stream');
    assert.equal(probe.audioStream.codec_name, 'aac');
    assert.ok(probe.duration > 0, 'Duration must be positive');

    // Clean up created story
    if (finalStatus.storyId) {
      await deleteStory(finalStatus.storyId).catch(() => {});
    }
  });

  // -------------------------------------------------------------
  // Test 2: Video Variations (POST /api/production/story/:storyId/export-variations)
  // -------------------------------------------------------------
  await t.test('2. Video Variations exports multiple formats sequentially with Remotion', async () => {
    const testStoryId = `variations-story-${Date.now()}`;
    const testSceneId = `variations-scene-${Date.now()}`;

    // Synthetic audio for test
    const tempAudioDir = path.resolve(process.cwd(), 'storage/audio/variations-test');
    await fs.promises.mkdir(tempAudioDir, { recursive: true });
    const audioPath = path.join(tempAudioDir, `tone-${Date.now()}.wav`);
    await execFileAsync(ffmpegPath, [
      '-y',
      '-f', 'lavfi',
      '-i', 'sine=frequency=440:duration=1.5',
      '-ar', '44100',
      '-ac', '2',
      audioPath,
    ]);

    await createStory({ storyId: testStoryId, title: 'Variations Test Story', targetDuration: 2 });
    await createScene({
      sceneId: testSceneId,
      storyId: testStoryId,
      title: 'Intro Scene',
      number: 1,
      narration: 'Variations test scene narration.',
      audioUrl: `/storage/audio/variations-test/${path.basename(audioPath)}`,
      estimatedDurationMs: 1500,
      actualAudioDurationMs: 1500,
      animationData: {
        version: 1,
        viewport: { width: 1280, height: 720 },
        characterInstances: [],
        animationClips: [],
      } as any,
    });

    // Request variations in 16:9 and 9:16
    const res = await fetch(`${baseUrl}/api/production/story/${testStoryId}/export-variations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        formats: ['16:9', '9:16'],
        resolution: '720p',
        fps: 30,
        renderer: 'remotion',
      }),
    });

    assert.equal(res.status, 202);
    const body = await res.json();
    assert.ok(body.success);
    assert.equal(body.jobs.length, 2);

    const job1Id = body.jobs[0].id;
    const job2Id = body.jobs[1].id;
    assert.notEqual(job1Id, job2Id, 'Each format job must have a unique ID');

    // Poll both jobs until completion
    const pollJob = async (jobId: string) => {
      const startTime = Date.now();
      while (Date.now() - startTime < 120000) {
        const checkRes = await fetch(`${baseUrl}/api/production/export/${jobId}`);
        assert.equal(checkRes.status, 200);
        const job = await checkRes.json();
        if (job.status === 'completed' || job.status === 'failed') {
          return job;
        }
        await new Promise((r) => setTimeout(r, 600));
      }
      throw new Error(`Job ${jobId} timed out`);
    };

    const [job1Result, job2Result] = await Promise.all([pollJob(job1Id), pollJob(job2Id)]);

    assert.equal(job1Result.status, 'completed', `Job 1 (16:9) failed: ${job1Result.error}`);
    assert.equal(job2Result.status, 'completed', `Job 2 (9:16) failed: ${job2Result.error}`);

    // Verify 16:9 video stream
    const file1 = path.resolve(process.cwd(), job1Result.downloadUrl.replace(/^\//, ''));
    assert.ok(fs.existsSync(file1));
    const probe1 = await probeVideo(file1);
    assert.equal(probe1.videoStream.width, 1280);
    assert.equal(probe1.videoStream.height, 720);
    assert.equal(probe1.videoStream.codec_name, 'h264');
    assert.equal(probe1.audioStream.codec_name, 'aac');

    // Verify 9:16 video stream
    const file2 = path.resolve(process.cwd(), job2Result.downloadUrl.replace(/^\//, ''));
    assert.ok(fs.existsSync(file2));
    const probe2 = await probeVideo(file2);
    assert.equal(probe2.videoStream.width, 720);
    assert.equal(probe2.videoStream.height, 1280);
    assert.equal(probe2.videoStream.codec_name, 'h264');
    assert.equal(probe2.audioStream.codec_name, 'aac');

    console.log('[Variations Test] 16:9 and 9:16 Remotion variations verified successfully.');
    await deleteStory(testStoryId).catch(() => {});
  });

  server.close();
});

