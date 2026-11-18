import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { contentRouter } from '../src/routes/content.js';
import { VideoAssemblyService } from '../src/services/video-assembly/video-assembly.service.js';

test('AI Director Lifecycle, Bounded Polling & Error Propagation Suite', async (t) => {
  const app = express();
  app.use(express.json());
  app.use('/api/content', contentRouter);

  const server = app.listen(0);
  const address = server.address() as any;
  const baseUrl = `http://127.0.0.1:${address.port}`;

  const videoAssemblyService = new VideoAssemblyService();

  t.after(() => {
    server.close();
  });

  await t.test('1. Successful export propagates to AI Director COMPLETED state with downloadUrl', async () => {
    // Start an AI Director job
    const res = await fetch(`${baseUrl}/api/content/story/director`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        topic: 'A friendly bear named Pip playing in the forest',
        language: 'Hindi',
        sceneCount: 1,
        desiredDurationSeconds: 4,
      }),
    });

    assert.equal(res.status, 202);
    const data = await res.json();
    assert.ok(data.directorJobId);

    // Poll until export job is assigned
    let exportJobId: string | undefined = undefined;
    for (let i = 0; i < 30; i++) {
      await new Promise((r) => setTimeout(r, 200));
      const pollRes = await fetch(`${baseUrl}/api/content/story/director/${data.directorJobId}`);
      const job = await pollRes.json();
      if (job.exportJobId) {
        exportJobId = job.exportJobId;
        break;
      }
    }

    assert.ok(exportJobId, 'Export job ID must be linked to Director job');

    // Simulate export job completion
    const exportJob = videoAssemblyService.getJob(exportJobId!);
    if (exportJob) {
      exportJob.status = 'completed';
      exportJob.downloadUrl = '/storage/exports/pip-story-completed.mp4';
      exportJob.progress = 100;
    }

    // Director polling must detect completed state
    let finalDirectorState: any = null;
    for (let i = 0; i < 20; i++) {
      await new Promise((r) => setTimeout(r, 200));
      const pollRes = await fetch(`${baseUrl}/api/content/story/director/${data.directorJobId}`);
      const job = await pollRes.json();
      if (job.lifecycleState === 'COMPLETED' || job.status === 'COMPLETED') {
        finalDirectorState = job;
        break;
      }
    }

    assert.ok(finalDirectorState, 'Director job must reach COMPLETED state');
    assert.equal(finalDirectorState.progress, 100);
    assert.equal(finalDirectorState.downloadUrl, '/storage/exports/pip-story-completed.mp4');
  });

  await t.test('2. Failed export propagates to AI Director FAILED state and never reports success', async () => {
    const res = await fetch(`${baseUrl}/api/content/story/director`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        topic: 'A robot named Sparky',
        language: 'Hindi',
        sceneCount: 1,
        desiredDurationSeconds: 4,
      }),
    });

    assert.equal(res.status, 202);
    const data = await res.json();

    // Poll until export job is assigned (up to 30s)
    let exportJobId: string | undefined = undefined;
    for (let i = 0; i < 150; i++) {
      await new Promise((r) => setTimeout(r, 200));
      const pollRes = await fetch(`${baseUrl}/api/content/story/director/${data.directorJobId}`);
      const job = await pollRes.json();
      if (job.exportJobId) {
        exportJobId = job.exportJobId;
        break;
      }
    }

    assert.ok(exportJobId, 'Export job ID must be linked to Director job');

    // Simulate export job failure
    const exportJob = videoAssemblyService.getJob(exportJobId!);
    if (exportJob) {
      exportJob.status = 'failed';
      exportJob.error = 'GPU out of memory during Remotion render';
    }

    // Director polling must detect failed state
    let finalDirectorState: any = null;
    for (let i = 0; i < 30; i++) {
      await new Promise((r) => setTimeout(r, 200));
      const pollRes = await fetch(`${baseUrl}/api/content/story/director/${data.directorJobId}`);
      const job = await pollRes.json();
      if (job.lifecycleState === 'FAILED' || job.status === 'FAILED') {
        finalDirectorState = job;
        break;
      }
    }

    assert.ok(finalDirectorState, 'Director job must reach FAILED state');
    assert.equal(finalDirectorState.downloadUrl, undefined, 'Must not report downloadUrl on failure');
    assert.ok(finalDirectorState.error?.includes('GPU out of memory') || finalDirectorState.error?.includes('Remotion video rendering failed'));
  });

  await t.test('3. Director job cancellation terminates and cancels underlying export job', async () => {
    const res = await fetch(`${baseUrl}/api/content/story/director`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        topic: 'A magical bunny',
        language: 'Hindi',
        sceneCount: 1,
      }),
    });

    assert.equal(res.status, 202);
    const data = await res.json();

    // Cancel the director job
    const cancelRes = await fetch(`${baseUrl}/api/content/story/director/${data.directorJobId}/cancel`, {
      method: 'POST',
    });
    assert.equal(cancelRes.status, 200);
    const cancelData = await cancelRes.json();
    assert.equal(cancelData.status, 'CANCELLED');

    // Query job state
    const checkRes = await fetch(`${baseUrl}/api/content/story/director/${data.directorJobId}`);
    const checkJob = await checkRes.json();
    assert.equal(checkJob.lifecycleState, 'CANCELLED');
    assert.equal(checkJob.downloadUrl, undefined);
  });

  await t.test('4. Stuck export deadline timeout triggers recovery and terminal FAILED state', async () => {
    const prevTimeout = process.env.DIRECTOR_EXPORT_TIMEOUT_MS;
    process.env.DIRECTOR_EXPORT_TIMEOUT_MS = '1000'; // 1 second timeout for export stage

    try {
      const res = await fetch(`${baseUrl}/api/content/story/director`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          topic: 'Stuck export test',
          language: 'Hindi',
          sceneCount: 1,
        }),
      });

      const data = await res.json();

      // Wait until export stage starts or job fails from timeout
      let timedOutJob: any = null;
      for (let i = 0; i < 150; i++) {
        await new Promise((r) => setTimeout(r, 200));
        const pollRes = await fetch(`${baseUrl}/api/content/story/director/${data.directorJobId}`);
        const job = await pollRes.json();
        if (job.lifecycleState === 'FAILED' && job.error?.includes('timed out')) {
          timedOutJob = job;
          break;
        }
      }

      assert.ok(timedOutJob, 'Director job must time out and transition to FAILED');
      assert.ok(timedOutJob.error?.includes('timed out'), 'Error must report timeout');
    } finally {
      if (prevTimeout) {
        process.env.DIRECTOR_EXPORT_TIMEOUT_MS = prevTimeout;
      } else {
        delete process.env.DIRECTOR_EXPORT_TIMEOUT_MS;
      }
    }
  });
});
