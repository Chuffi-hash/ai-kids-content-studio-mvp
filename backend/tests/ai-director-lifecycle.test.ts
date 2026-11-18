import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { contentRouter, setDirectorServiceOverrides } from '../src/routes/content.js';

function createDeferred<T>() {
  let resolve!: (val: T) => void;
  let reject!: (err: any) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

test('AI Director Deterministic Lifecycle & Cancellation Across All Stages Suite', async (t) => {
  const app = express();
  app.use(express.json());
  app.use('/api/content', contentRouter);

  const server = app.listen(0);
  const address = server.address() as any;
  const baseUrl = `http://127.0.0.1:${address.port}`;

  t.after(() => {
    setDirectorServiceOverrides(null);
    server.close();
  });

  await t.test('1. Successful export propagates to AI Director COMPLETED state with downloadUrl', async () => {
    let exportStarted = false;
    const mockExportJob = {
      id: 'export-success-101',
      status: 'queued',
      progress: 0,
      stage: 'Queued...',
      downloadUrl: undefined as string | undefined,
    };

    setDirectorServiceOverrides({
      storyGenerationService: {
        generateAndPersistStory: async () => ({
          storyId: 'story-success-101',
          story: { visualStyle: 'Storybook' },
          scenes: [{ sceneId: 'sc-1', title: 'Scene 1', imageUrl: '/storage/img1.jpg' }],
        }),
      },
      imageGenerationService: {
        generateSceneImage: async () => ({
          imageBuffer: Buffer.from('fake-image'),
          mimeType: 'image/jpeg',
        }),
      },
      audioGenerationService: {
        generateNarrationAudio: async () => ({ audioUrl: '/storage/audio1.mp3' }),
        generateAllSceneDialogues: async () => [],
      },
      getScenesByStoryId: async () => [
        { sceneId: 'sc-1', narration: 'Hello', audioUrl: '/storage/audio1.mp3' },
      ],
      videoAssemblyService: {
        startExportJob: () => {
          exportStarted = true;
          return mockExportJob;
        },
        getJob: () => {
          // Immediately simulate completion once queried
          mockExportJob.status = 'completed';
          mockExportJob.progress = 100;
          mockExportJob.downloadUrl = '/storage/exports/pip-story-completed.mp4';
          return mockExportJob;
        },
        cancelExportJob: async () => true,
      },
    });

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

    // Poll director job status until completed
    let finalDirectorState: any = null;
    for (let i = 0; i < 20; i++) {
      await new Promise((r) => setTimeout(r, 100));
      const pollRes = await fetch(`${baseUrl}/api/content/story/director/${data.directorJobId}`);
      const job = await pollRes.json();
      if (job.status === 'COMPLETED' || job.lifecycleState === 'COMPLETED') {
        finalDirectorState = job;
        break;
      }
    }

    assert.ok(exportStarted, 'startExportJob must have been called');
    assert.ok(finalDirectorState, 'Director job must reach COMPLETED state');
    assert.equal(finalDirectorState.progress, 100);
    assert.equal(finalDirectorState.downloadUrl, '/storage/exports/pip-story-completed.mp4');
  });

  await t.test('2. Failed export propagates to AI Director FAILED state and never reports downloadUrl', async () => {
    const mockExportJob = {
      id: 'export-failed-102',
      status: 'queued',
      progress: 0,
      stage: 'Queued...',
      error: undefined as string | undefined,
    };

    setDirectorServiceOverrides({
      storyGenerationService: {
        generateAndPersistStory: async () => ({
          storyId: 'story-failed-102',
          story: { visualStyle: 'Storybook' },
          scenes: [{ sceneId: 'sc-1', title: 'Scene 1', imageUrl: '/storage/img1.jpg' }],
        }),
      },
      imageGenerationService: {
        generateSceneImage: async () => ({
          imageBuffer: Buffer.from('fake-image'),
          mimeType: 'image/jpeg',
        }),
      },
      audioGenerationService: {
        generateNarrationAudio: async () => ({ audioUrl: '/storage/audio1.mp3' }),
        generateAllSceneDialogues: async () => [],
      },
      getScenesByStoryId: async () => [
        { sceneId: 'sc-1', narration: 'Hello', audioUrl: '/storage/audio1.mp3' },
      ],
      videoAssemblyService: {
        startExportJob: () => mockExportJob,
        getJob: () => {
          mockExportJob.status = 'failed';
          mockExportJob.error = 'GPU out of memory during Remotion render';
          return mockExportJob;
        },
        cancelExportJob: async () => true,
      },
    });

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

    let finalDirectorState: any = null;
    for (let i = 0; i < 20; i++) {
      await new Promise((r) => setTimeout(r, 100));
      const pollRes = await fetch(`${baseUrl}/api/content/story/director/${data.directorJobId}`);
      const job = await pollRes.json();
      if (job.status === 'FAILED' || job.lifecycleState === 'FAILED') {
        finalDirectorState = job;
        break;
      }
    }

    assert.ok(finalDirectorState, 'Director job must reach FAILED state');
    assert.equal(finalDirectorState.downloadUrl, undefined, 'Must not report downloadUrl on failure');
    assert.ok(finalDirectorState.error?.includes('GPU out of memory'), 'Error message must be preserved');
  });

  await t.test('3. Stage 1 Cancellation: Cancelling during story generation preserves CANCELLED state after story settles', async () => {
    const storyDeferred = createDeferred<any>();
    let bgStarted = false;
    let exportStarted = false;

    setDirectorServiceOverrides({
      storyGenerationService: {
        generateAndPersistStory: () => storyDeferred.promise,
      },
      imageGenerationService: {
        generateSceneImage: async () => {
          bgStarted = true;
          return { imageBuffer: Buffer.from('fake'), mimeType: 'image/jpeg' };
        },
      },
      audioGenerationService: {
        generateNarrationAudio: async () => ({ audioUrl: '/storage/audio.mp3' }),
      },
      getScenesByStoryId: async () => [],
      videoAssemblyService: {
        startExportJob: () => {
          exportStarted = true;
          return { id: 'should-not-start', status: 'queued' };
        },
        getJob: () => undefined,
        cancelExportJob: async () => true,
      },
    });

    const res = await fetch(`${baseUrl}/api/content/story/director`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        topic: 'Stage 1 Cancel Story',
        language: 'Hindi',
      }),
    });

    assert.equal(res.status, 202);
    const { directorJobId } = await res.json();

    // Verify initial stage is GENERATING_STORY and exportJobId does not exist yet
    const initRes = await fetch(`${baseUrl}/api/content/story/director/${directorJobId}`);
    const initJob = await initRes.json();
    assert.equal(initJob.status, 'GENERATING_STORY');
    assert.equal(initJob.exportJobId, undefined, 'Cancellation must work before exportJobId exists');

    // Cancel while story generation is in flight
    const cancelRes = await fetch(`${baseUrl}/api/content/story/director/${directorJobId}/cancel`, {
      method: 'POST',
    });
    assert.equal(cancelRes.status, 200);
    const cancelData = await cancelRes.json();
    assert.equal(cancelData.status, 'CANCELLED');

    // Now resolve the pending story generation promise
    storyDeferred.resolve({
      storyId: 'story-late-103',
      scenes: [{ sceneId: 'sc-late-1', title: 'Late Scene' }],
    });

    // Wait for microtasks to settle
    await new Promise((r) => setTimeout(r, 150));

    // Verify job remains in terminal CANCELLED state and never moved to subsequent stages
    const finalRes = await fetch(`${baseUrl}/api/content/story/director/${directorJobId}`);
    const finalJob = await finalRes.json();
    assert.equal(finalJob.status, 'CANCELLED', 'Job must remain CANCELLED after story generation resolves');
    assert.equal(finalJob.lifecycleState, 'CANCELLED');
    assert.equal(bgStarted, false, 'Background generation must not be started after cancellation');
    assert.equal(exportStarted, false, 'Video export must not be started after cancellation');
  });

  await t.test('4. Stage 2 Cancellation: Cancelling during background generation preserves CANCELLED state after image settles', async () => {
    const imageDeferred = createDeferred<any>();
    let audioStarted = false;
    let exportStarted = false;

    setDirectorServiceOverrides({
      storyGenerationService: {
        generateAndPersistStory: async () => ({
          storyId: 'story-bg-cancel-104',
          scenes: [{ sceneId: 'sc-bg-1', title: 'Scene 1', visualPrompt: 'A forest path' }],
        }),
      },
      imageGenerationService: {
        generateSceneImage: () => imageDeferred.promise,
      },
      audioGenerationService: {
        generateNarrationAudio: async () => {
          audioStarted = true;
          return { audioUrl: '/storage/audio.mp3' };
        },
      },
      getScenesByStoryId: async () => [],
      videoAssemblyService: {
        startExportJob: () => {
          exportStarted = true;
          return { id: 'should-not-start-2', status: 'queued' };
        },
        getJob: () => undefined,
        cancelExportJob: async () => true,
      },
    });

    const res = await fetch(`${baseUrl}/api/content/story/director`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        topic: 'Stage 2 Cancel Background',
        language: 'Hindi',
      }),
    });

    const { directorJobId } = await res.json();

    // Poll until stage reaches GENERATING_BACKGROUNDS
    for (let i = 0; i < 20; i++) {
      await new Promise((r) => setTimeout(r, 50));
      const pollRes = await fetch(`${baseUrl}/api/content/story/director/${directorJobId}`);
      const job = await pollRes.json();
      if (job.status === 'GENERATING_BACKGROUNDS') break;
    }

    // Cancel while background generation is in flight
    const cancelRes = await fetch(`${baseUrl}/api/content/story/director/${directorJobId}/cancel`, {
      method: 'POST',
    });
    assert.equal(cancelRes.status, 200);

    // Resolve late background image
    imageDeferred.resolve({
      imageBuffer: Buffer.from('late-image'),
      mimeType: 'image/jpeg',
    });

    await new Promise((r) => setTimeout(r, 150));

    const checkRes = await fetch(`${baseUrl}/api/content/story/director/${directorJobId}`);
    const checkJob = await checkRes.json();
    assert.equal(checkJob.status, 'CANCELLED');
    assert.equal(audioStarted, false, 'Audio generation must never execute after background stage cancellation');
    assert.equal(exportStarted, false, 'Export must never execute after cancellation');
  });

  await t.test('5. Stage 3 Cancellation: Cancelling during audio generation preserves CANCELLED state and prevents export startup', async () => {
    const audioDeferred = createDeferred<any>();
    let exportStarted = false;

    setDirectorServiceOverrides({
      storyGenerationService: {
        generateAndPersistStory: async () => ({
          storyId: 'story-audio-cancel-105',
          scenes: [{ sceneId: 'sc-aud-1', title: 'Scene 1', imageUrl: '/storage/img.jpg' }],
        }),
      },
      imageGenerationService: {
        generateSceneImage: async () => ({ imageBuffer: Buffer.from('img'), mimeType: 'image/jpeg' }),
      },
      audioGenerationService: {
        generateNarrationAudio: () => audioDeferred.promise,
      },
      getScenesByStoryId: async () => [
        { sceneId: 'sc-aud-1', narration: 'Narration line to generate', audioUrl: null },
      ],
      videoAssemblyService: {
        startExportJob: () => {
          exportStarted = true;
          return { id: 'should-not-start-3', status: 'queued' };
        },
        getJob: () => undefined,
        cancelExportJob: async () => true,
      },
    });

    const res = await fetch(`${baseUrl}/api/content/story/director`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        topic: 'Stage 3 Cancel Audio',
        language: 'Hindi',
      }),
    });

    const { directorJobId } = await res.json();

    // Poll until stage reaches GENERATING_AUDIO
    for (let i = 0; i < 20; i++) {
      await new Promise((r) => setTimeout(r, 50));
      const pollRes = await fetch(`${baseUrl}/api/content/story/director/${directorJobId}`);
      const job = await pollRes.json();
      if (job.status === 'GENERATING_AUDIO') break;
    }

    // Cancel while audio generation is running
    const cancelRes = await fetch(`${baseUrl}/api/content/story/director/${directorJobId}/cancel`, {
      method: 'POST',
    });
    assert.equal(cancelRes.status, 200);

    // Resolve late audio
    audioDeferred.resolve({ audioUrl: '/storage/late-audio.mp3' });

    await new Promise((r) => setTimeout(r, 150));

    const checkRes = await fetch(`${baseUrl}/api/content/story/director/${directorJobId}`);
    const checkJob = await checkRes.json();
    assert.equal(checkJob.status, 'CANCELLED');
    assert.equal(exportStarted, false, 'startExportJob must never be invoked after audio stage cancellation');
  });

  await t.test('6. Stage 4 Cancellation: Cancelling during Remotion rendering cancels underlying export and blocks late completion', async () => {
    let cancelExportJobCalledWith = '';
    const mockExportJob = {
      id: 'export-stage4-106',
      status: 'processing',
      progress: 40,
      stage: 'Rendering frames with Remotion...',
      downloadUrl: undefined as string | undefined,
    };

    setDirectorServiceOverrides({
      storyGenerationService: {
        generateAndPersistStory: async () => ({
          storyId: 'story-render-cancel-106',
          scenes: [{ sceneId: 'sc-1', title: 'Scene 1', imageUrl: '/storage/img.jpg' }],
        }),
      },
      imageGenerationService: {
        generateSceneImage: async () => ({ imageBuffer: Buffer.from('img'), mimeType: 'image/jpeg' }),
      },
      audioGenerationService: {
        generateNarrationAudio: async () => ({ audioUrl: '/storage/audio.mp3' }),
      },
      getScenesByStoryId: async () => [
        { sceneId: 'sc-1', narration: 'Speech', audioUrl: '/storage/audio.mp3' },
      ],
      videoAssemblyService: {
        startExportJob: () => mockExportJob,
        getJob: () => mockExportJob,
        cancelExportJob: async (id: string) => {
          cancelExportJobCalledWith = id;
          mockExportJob.status = 'cancelled';
          return true;
        },
      },
    });

    const res = await fetch(`${baseUrl}/api/content/story/director`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        topic: 'Stage 4 Cancel Remotion Render',
        language: 'Hindi',
      }),
    });

    const { directorJobId } = await res.json();

    // Poll until export job is linked and rendering
    for (let i = 0; i < 20; i++) {
      await new Promise((r) => setTimeout(r, 50));
      const pollRes = await fetch(`${baseUrl}/api/content/story/director/${directorJobId}`);
      const job = await pollRes.json();
      if (job.exportJobId) break;
    }

    // Cancel while export is in progress
    const cancelRes = await fetch(`${baseUrl}/api/content/story/director/${directorJobId}/cancel`, {
      method: 'POST',
    });
    assert.equal(cancelRes.status, 200);
    assert.equal(cancelExportJobCalledWith, 'export-stage4-106', 'Underlying export job must be cancelled');

    // Simulate late export completion racing with cancellation
    mockExportJob.status = 'completed';
    mockExportJob.downloadUrl = '/storage/exports/late-race.mp4';

    await new Promise((r) => setTimeout(r, 200));

    const checkRes = await fetch(`${baseUrl}/api/content/story/director/${directorJobId}`);
    const checkJob = await checkRes.json();
    assert.equal(checkJob.status, 'CANCELLED', 'Director job must remain CANCELLED despite late completed export');
    assert.equal(checkJob.downloadUrl, undefined, 'Must not report downloadUrl when cancelled');
  });

  await t.test('7. Race Protection: Cannot cancel an export that has already reached terminal completion', async () => {
    const mockExportJob = {
      id: 'export-completed-107',
      status: 'completed',
      progress: 100,
      stage: 'Export completed successfully!',
      downloadUrl: '/storage/exports/completed-already.mp4',
    };

    setDirectorServiceOverrides({
      storyGenerationService: {
        generateAndPersistStory: async () => ({
          storyId: 'story-race-107',
          scenes: [{ sceneId: 'sc-1', title: 'Scene 1', imageUrl: '/storage/img.jpg' }],
        }),
      },
      imageGenerationService: {
        generateSceneImage: async () => ({ imageBuffer: Buffer.from('img'), mimeType: 'image/jpeg' }),
      },
      audioGenerationService: {
        generateNarrationAudio: async () => ({ audioUrl: '/storage/audio.mp3' }),
      },
      getScenesByStoryId: async () => [
        { sceneId: 'sc-1', narration: 'Speech', audioUrl: '/storage/audio.mp3' },
      ],
      videoAssemblyService: {
        startExportJob: () => mockExportJob,
        getJob: () => mockExportJob,
        cancelExportJob: async () => false,
      },
    });

    const res = await fetch(`${baseUrl}/api/content/story/director`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        topic: 'Race completed test',
        language: 'Hindi',
      }),
    });

    const { directorJobId } = await res.json();

    // Wait until completed
    for (let i = 0; i < 20; i++) {
      await new Promise((r) => setTimeout(r, 50));
      const pollRes = await fetch(`${baseUrl}/api/content/story/director/${directorJobId}`);
      const job = await pollRes.json();
      if (job.status === 'COMPLETED') break;
    }

    // Now attempt to cancel the completed job
    const cancelRes = await fetch(`${baseUrl}/api/content/story/director/${directorJobId}/cancel`, {
      method: 'POST',
    });
    assert.equal(cancelRes.status, 400, 'Cancellation must be rejected for completed export');

    const checkRes = await fetch(`${baseUrl}/api/content/story/director/${directorJobId}`);
    const checkJob = await checkRes.json();
    assert.equal(checkJob.status, 'COMPLETED', 'Director job status must remain COMPLETED');
  });

  await t.test('8. Stuck export deadline timeout triggers recovery and terminal FAILED state', async () => {
    const prevTimeout = process.env.DIRECTOR_EXPORT_TIMEOUT_MS;
    process.env.DIRECTOR_EXPORT_TIMEOUT_MS = '200'; // 200ms timeout for export stage

    let cancelCalled = false;
    const mockExportJob = {
      id: 'export-stuck-108',
      status: 'processing',
      progress: 30,
      stage: 'Rendering forever...',
    };

    setDirectorServiceOverrides({
      storyGenerationService: {
        generateAndPersistStory: async () => ({
          storyId: 'story-stuck-108',
          scenes: [{ sceneId: 'sc-1', title: 'Scene 1', imageUrl: '/storage/img.jpg' }],
        }),
      },
      imageGenerationService: {
        generateSceneImage: async () => ({ imageBuffer: Buffer.from('img'), mimeType: 'image/jpeg' }),
      },
      audioGenerationService: {
        generateNarrationAudio: async () => ({ audioUrl: '/storage/audio.mp3' }),
      },
      getScenesByStoryId: async () => [
        { sceneId: 'sc-1', narration: 'Speech', audioUrl: '/storage/audio.mp3' },
      ],
      videoAssemblyService: {
        startExportJob: () => mockExportJob,
        getJob: () => mockExportJob,
        cancelExportJob: async () => {
          cancelCalled = true;
          return true;
        },
      },
    });

    try {
      const res = await fetch(`${baseUrl}/api/content/story/director`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          topic: 'Stuck export timeout test',
          language: 'Hindi',
        }),
      });

      const { directorJobId } = await res.json();

      let timedOutJob: any = null;
      for (let i = 0; i < 30; i++) {
        await new Promise((r) => setTimeout(r, 50));
        const pollRes = await fetch(`${baseUrl}/api/content/story/director/${directorJobId}`);
        const job = await pollRes.json();
        if (job.status === 'FAILED' && job.error?.includes('timed out')) {
          timedOutJob = job;
          break;
        }
      }

      assert.ok(timedOutJob, 'Director job must time out and transition to FAILED');
      assert.ok(cancelCalled, 'Underlying stuck export job must be cancelled on timeout');
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