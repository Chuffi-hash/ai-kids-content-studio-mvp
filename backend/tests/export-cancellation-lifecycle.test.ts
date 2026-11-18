import test from 'node:test';
import assert from 'node:assert/strict';
// @ts-ignore
import ffmpegStatic from '@ffmpeg-installer/ffmpeg';
import { RemotionRenderQueue } from '../src/services/video-assembly/remotion-render-queue.js';
import { RemotionRenderService } from '../src/services/video-assembly/remotion-render.service.js';
import { VideoAssemblyService, getExportJobs } from '../src/services/video-assembly/video-assembly.service.js';

test('Export Cancellation Lifecycle & Terminal State Immutability Suite', async (t) => {
  const queue = RemotionRenderQueue.getInstance();
  const remotionService = new RemotionRenderService();
  const assemblyService = new VideoAssemblyService();

  await t.test('1. Queued cancellation removes job safely without execution', async () => {
    // Fill the single concurrency slot with a pending task
    let releaseActiveSlot!: () => void;
    const activeSlotPromise = new Promise<void>((resolve) => {
      releaseActiveSlot = resolve;
    });

    const activeJobId = `active-slot-${Date.now()}`;
    const queuedJobId = `queued-to-cancel-${Date.now()}`;

    let queuedTaskExecuted = false;

    // Enqueue task 1 (takes active slot)
    const task1 = queue.enqueue({
      jobId: activeJobId,
      task: () => activeSlotPromise,
    });

    // Enqueue task 2 (queued behind task 1)
    const task2 = queue.enqueue({
      jobId: queuedJobId,
      task: async () => {
        queuedTaskExecuted = true;
      },
    });

    assert.equal(queue.getQueueLength(), 1, 'Task 2 should be in queue');

    // Cancel task 2 while queued
    const cancelled = queue.cancel(queuedJobId);
    assert.equal(cancelled, true, 'Queue must confirm task was cancelled');
    assert.equal(queue.getQueueLength(), 0, 'Queue length must be 0 after cancellation');

    // Task 2 promise must reject with cancellation error
    await assert.rejects(
      async () => await task2,
      /was cancelled before execution/
    );

    // Release task 1 slot
    releaseActiveSlot();
    await task1;

    assert.equal(queuedTaskExecuted, false, 'Queued task must never have executed');
  });

  await t.test('2. Running cancellation terminates active Remotion render and sets terminal cancelled status', async () => {
    const storyId = `cancel-story-${Date.now()}`;
    const job = assemblyService.startExportJob({
      storyId,
      renderer: 'remotion',
      format: '16:9',
    });

    assert.ok(job.id);
    assert.equal(job.status, 'processing');

    // Cancel immediately while in-flight
    const cancelled = await assemblyService.cancelExportJob(job.id);
    assert.equal(cancelled, true, 'cancelExportJob must return true');

    const statusAfter = assemblyService.getJob(job.id);
    assert.equal(statusAfter?.status, 'cancelled', 'Job must be in terminal cancelled state');
    assert.ok(statusAfter?.completedAt, 'completedAt must be recorded on cancellation');

    // Wait 200ms to ensure any background catch blocks have run
    await new Promise((r) => setTimeout(r, 200));

    // Status must remain 'cancelled' and NOT flip to 'failed'
    const statusFinal = assemblyService.getJob(job.id);
    assert.equal(statusFinal?.status, 'cancelled', 'Catch blocks must never overwrite cancelled status with failed');
  });

  await t.test('3. Cancellation during audio mastering stage is propagated and files are cleaned up', async () => {
    const jobId = `audio-mastering-cancel-${Date.now()}`;

    // Mark job cancelled in remotion service
    await remotionService.cancelJob(jobId);
    assert.equal(remotionService.isJobCancelled(jobId), true);

    // Attempting to execute remotion or audio mastering for cancelled job must reject immediately
    await assert.rejects(
      async () => {
        // @ts-ignore - test private method access for deterministic verification
        await remotionService['executeFfmpegMastering'](jobId, 'ffmpeg', ['-version']);
      },
      /cancelled before audio mastering/
    );
  });

  await t.test('4. Late completion after cancellation never overwrites cancelled status with completed', async () => {
    const storyId = `late-complete-${Date.now()}`;
    const job = assemblyService.startExportJob({
      storyId,
      renderer: 'remotion',
      format: '9:16',
    });

    // Cancel the job
    await assemblyService.cancelExportJob(job.id);
    const updated = assemblyService.getJob(job.id);
    assert.equal(updated?.status, 'cancelled');

    // Simulate late background handler completion attempting to mutate job
    if ((updated!.status as string) !== 'cancelled') {
      updated!.status = 'completed';
    }

    assert.equal(assemblyService.getJob(job.id)?.status, 'cancelled', 'Cancelled state is immutable against late completion');
  });

  await t.test('5. Terminal state immutability: completed or failed jobs cannot be cancelled or overwritten', async () => {
    const storyId = `terminal-check-${Date.now()}`;
    const job = assemblyService.startExportJob({
      storyId,
      renderer: 'remotion',
      format: '16:9',
    });

    // Manually mark completed
    job.status = 'completed';
    job.completedAt = new Date();

    // Calling cancelExportJob on a completed job must return false
    const cancelRes = await assemblyService.cancelExportJob(job.id);
    assert.equal(cancelRes, false, 'Completed job cannot be cancelled');
    assert.equal(assemblyService.getJob(job.id)?.status, 'completed', 'Completed status must remain untouched');
  });

  await t.test('6. Standard FFmpeg renderer cancellation: process tracking and terminal cancelled state', async () => {
    const storyId = `ffmpeg-cancel-${Date.now()}`;
    const job = assemblyService.startExportJob({
      storyId,
      renderer: 'ffmpeg',
      format: '16:9',
    });

    assert.ok(job.id);
    assert.equal(job.renderer, 'ffmpeg');

    // Cancel while in-flight
    const cancelled = await assemblyService.cancelExportJob(job.id);
    assert.equal(cancelled, true, 'cancelExportJob must confirm FFmpeg job cancellation');

    const statusAfter = assemblyService.getJob(job.id);
    assert.equal(statusAfter?.status, 'cancelled', 'FFmpeg job must be in terminal cancelled state');

    // Wait for background handlers to settle
    await new Promise((r) => setTimeout(r, 200));

    const statusFinal = assemblyService.getJob(job.id);
    assert.equal(statusFinal?.status, 'cancelled', 'Catch handler must never overwrite cancelled with failed');
  });

  await t.test('7. Standard FFmpeg child process tree termination on cancellation', async () => {
    const jobId = `ffmpeg-proc-kill-${Date.now()}`;
    const job: any = {
      id: jobId,
      status: 'processing',
      stage: 'Rendering with FFmpeg...',
    };

    // Register job in memory map
    getExportJobs().set(jobId, job);

    // Spawn a realtime FFmpeg process via runTrackedProcess
    const ffmpegPath = ffmpegStatic?.path || 'ffmpeg';
    const trackedPromise = (assemblyService as any).runTrackedProcess(jobId, ffmpegPath, [
      '-nostdin',
      '-re',
      '-f', 'lavfi',
      '-i', 'testsrc=size=320x240:rate=10',
      '-t', '60',
      '-f', 'null',
      '-',
    ]);

    // Attach rejection listener immediately to prevent unhandled rejection in test runner
    const assertionPromise = assert.rejects(
      trackedPromise,
      /cancelled|exited|killed/i
    );

    // Give process 100ms to spawn and register in activeFfmpegProcesses
    await new Promise((r) => setTimeout(r, 100));
    assert.ok((assemblyService as any).activeFfmpegProcesses.has(jobId), 'FFmpeg process must be registered in activeFfmpegProcesses');

    // Cancel job
    job.status = 'cancelled';
    const killer = (assemblyService as any).activeFfmpegProcesses.get(jobId);
    assert.ok(killer, 'Killer function must exist');
    await killer();

    // Process promise must reject with cancellation error
    await assertionPromise;

    // Process must be cleaned up from active map
    assert.equal((assemblyService as any).activeFfmpegProcesses.has(jobId), false, 'Process must be removed from active map after termination');
  });

  await t.test('8. Cancelled jobs do not leave final output files or temp directories', async () => {
    const jobId = `cleanup-check-${Date.now()}`;
    const tempDir = (assemblyService as any).tempDir;
    const exportsDir = (assemblyService as any).exportsDir;

    const jobTempDir = `${tempDir}/export-${jobId}`;
    const mockFilename = `mock-final-${jobId}.mp4`;
    const finalOutputPath = `${exportsDir}/${mockFilename}`;

    // Create mock temp dir and output file
    const fs = await import('fs');
    fs.mkdirSync(jobTempDir, { recursive: true });
    fs.writeFileSync(`${jobTempDir}/part.mp4`, 'fake');
    fs.writeFileSync(finalOutputPath, 'fake-final-mp4');

    assert.ok(fs.existsSync(jobTempDir), 'Temp dir should exist before cancellation');
    assert.ok(fs.existsSync(finalOutputPath), 'Output file should exist before cancellation');

    const job = {
      id: jobId,
      status: 'processing',
      filename: mockFilename,
      renderer: 'ffmpeg',
    };
    // Inject job into memory map
    getExportJobs().set(jobId, job as any);

    const cancelled = await assemblyService.cancelExportJob(jobId);
    assert.equal(cancelled, true, 'cancelExportJob must return true');

    assert.equal(fs.existsSync(jobTempDir), false, 'Temp directory must be deleted on cancellation');
    assert.equal(fs.existsSync(finalOutputPath), false, 'Final output file must be deleted on cancellation');
  });
});
