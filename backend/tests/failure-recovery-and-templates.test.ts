import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import { VideoAssemblyService } from '../src/services/video-assembly/video-assembly.service.js';
import { RemotionManifestAdapter } from '../src/services/video-assembly/remotion-manifest.adapter.js';
import { getVideoTemplate, VIDEO_TEMPLATES } from '../../remotion/src/templates.js';
import { validateManifest, VideoManifest } from '../../remotion/src/manifest.js';

test('Failure Recovery, Cancellation, Idempotency & Template Suite', async (t) => {
  const service = new VideoAssemblyService();
  const adapter = new RemotionManifestAdapter();

  await t.test('1. Unicode Word Timing correctly tokenizes Hindi Devanagari and English', async () => {
    const hindiText = 'नमस्ते प्यारे बच्चों! आज हम सब मिलकर एक सुंदर कहानी सुनेंगे। क्या आप तैयार हैं?';
    const durationMs = 4000;

    const mockStory: any = { id: 'story-unicode-test', title: 'Unicode Test Story' };
    const mockScenes: any[] = [
      {
        id: 'scene-unicode-1',
        sceneId: 'scene-unicode-1',
        sceneNumber: 1,
        title: 'Hindi Scene',
        narration: hindiText,
        actualAudioDurationMs: durationMs,
        audioUrl: '/storage/audio/dummy.wav',
        animationData: {
          dialogueLines: [
            {
              id: 'dlg-1',
              characterName: 'Earth',
              text: 'नमस्ते बच्चों! मैं पृथ्वी हूँ।',
              durationMs: 2000,
            },
          ],
        },
      },
    ];

    const manifest = await adapter.buildManifest(mockStory, mockScenes, {
      format: '16:9',
      resolution: '720p',
    });

    const scene = manifest.scenes[0];
    assert.ok(scene.narration?.wordTimings, 'Narration wordTimings must be generated');
    assert.ok(scene.narration.wordTimings.length > 5, 'Must tokenize Hindi words correctly');

    // Verify first word is नमस्ते
    assert.equal(scene.narration.wordTimings[0].text, 'नमस्ते');
    // Verify last word has timing up to durationMs
    const lastWord = scene.narration.wordTimings[scene.narration.wordTimings.length - 1];
    assert.equal(lastWord.endMs, durationMs);

    // Verify dialogue word timings
    assert.ok(scene.dialogues?.[0].wordTimings, 'Dialogue wordTimings must be generated');
    assert.equal(scene.dialogues[0].wordTimings[0].text, 'नमस्ते');
  });

  await t.test('2. Video Templates are fully declared and consumed', async () => {
    assert.equal(VIDEO_TEMPLATES.length, 5, 'Must define all 5 core templates');

    const expectedTemplates = [
      'kids-story',
      'moral-story',
      'educational',
      'nursery-learning',
      'intro-outro',
    ];

    for (const id of expectedTemplates) {
      const tmpl = getVideoTemplate(id);
      assert.ok(tmpl, `Template ${id} must exist`);
      assert.ok(tmpl.titleColor, `Template ${id} must have titleColor`);
      assert.ok(tmpl.subtitleTheme, `Template ${id} must have subtitleTheme`);
      assert.ok(tmpl.decorStyle, `Template ${id} must have decorStyle`);
    }

    // Verify intro-outro template has intro and outro cards enabled
    const introOutro = getVideoTemplate('intro-outro');
    assert.equal(introOutro.showIntroCard, true);
    assert.equal(introOutro.showOutroCard, true);
  });

  await t.test('3. Invalid manifest schema is rejected safely with descriptive error', async () => {
    // Missing scenes
    assert.throws(
      () => validateManifest({ scenes: [] }),
      /Manifest requires scenes/
    );

    // Invalid FPS
    assert.throws(
      () => validateManifest({ fps: 90, scenes: [{ id: 's1', durationMs: 2000 }] }),
      /fps must be 1-60/
    );

    // Invalid scene duration
    assert.throws(
      () => validateManifest({ scenes: [{ id: 's1', durationMs: 100 }] }),
      /Invalid duration/
    );

    // Duplicate scene IDs
    assert.throws(
      () =>
        validateManifest({
          scenes: [
            { id: 'dup', durationMs: 2000 },
            { id: 'dup', durationMs: 3000 },
          ],
        }),
      /unique/
    );
  });

  await t.test('4. Duplicate active export jobs return existing job instance', async () => {
    const storyId = `test-story-dedup-${Date.now()}`;
    const job1 = service.startExportJob({
      storyId,
      renderer: 'remotion',
      format: '16:9',
      idempotencyKey: 'key-12345',
    });

    assert.ok(job1.id, 'Job 1 must be created');

    // Submit identical job with same idempotencyKey or same story/renderer/format while queued
    const job2 = service.startExportJob({
      storyId,
      renderer: 'remotion',
      format: '16:9',
      idempotencyKey: 'key-12345',
    });

    assert.equal(job2.id, job1.id, 'Duplicate export request must return existing active job');
  });

  await t.test('5. Cancellation terminates queued/running jobs and cleans up', async () => {
    const storyId = `test-story-cancel-${Date.now()}`;
    const job = service.startExportJob({
      storyId,
      renderer: 'remotion',
      format: '9:16',
    });

    assert.ok(job.id, 'Job must have an ID');

    // Cancel the job immediately
    const cancelled = await service.cancelExportJob(job.id);
    assert.equal(cancelled, true, 'Job must report successfully cancelled');

    const updated = service.getJob(job.id);
    assert.equal(updated?.status, 'cancelled', 'Job status must be cancelled');
    assert.ok(updated?.completedAt, 'completedAt must be set on cancellation');

    // Cancelling an already cancelled job returns false
    const cancelAgain = await service.cancelExportJob(job.id);
    assert.equal(cancelAgain, false, 'Cancelling terminated job returns false');
  });

  await t.test('6. Backend restart identifies interrupted in-flight jobs as failed', async () => {
    const tempDir = path.join(process.cwd(), process.env.STORAGE_DIR || './storage', 'temp');
    const jobsFile = path.join(tempDir, 'export-jobs.json');

    const simulatedInterruptedJob = {
      id: 'interrupted-job-123',
      storyId: 'story-interrupted',
      status: 'processing',
      progress: 45,
      stage: 'Rendering frames...',
      renderer: 'remotion',
      createdAt: new Date().toISOString(),
    };

    // Write simulated in-flight job to storage
    fs.writeFileSync(jobsFile, JSON.stringify([simulatedInterruptedJob], null, 2), 'utf-8');

    // Instantiate new service to simulate server reboot
    const rebootedService = new VideoAssemblyService();
    const recoveredJob = rebootedService.getJob('interrupted-job-123');

    assert.ok(recoveredJob, 'Interrupted job must be loaded from persistent storage');
    assert.equal(recoveredJob.status, 'failed', 'Interrupted job must transition to failed on restart');
    assert.match(recoveredJob.error || '', /Server restarted/, 'Descriptive restart error must be provided');
  });
});

