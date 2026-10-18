import test from 'node:test';
import assert from 'node:assert';
import 'dotenv/config';
import {
  estimateSpeechDurationMs,
  validateSceneTiming,
  formatTimeMs,
  formatDurationHuman,
  recalculateContiguousTimeline,
  calculateRippleEdit,
} from '../src/services/timing/timing.service.js';
import {
  getAllStories,
  getStoryByStoryId,
  createStory,
  deleteStory,
  createScene,
  getScenesByStoryId,
  updateScene,
  deleteScene,
  createSceneVersion,
  getSceneVersions,
  batchUpdateSceneTimelines,
  updateStoryMetadata,
} from '../src/services/database/database.service.js';
import { VideoAssemblyService } from '../src/services/video-assembly/video-assembly.service.js';
import { randomUUID } from 'crypto';

test('Timing Engine - speech duration estimation', () => {
  const shortText = 'Hello friend!';
  const est1 = estimateSpeechDurationMs(shortText);
  assert.ok(est1 >= 1500, 'Should be at least minimum duration');

  const longerText = 'Once upon a time, a clever little squirrel named Sammy wanted to climb the highest pine tree in the entire emerald forest.';
  const est2 = estimateSpeechDurationMs(longerText);
  assert.ok(est2 > est1, 'Longer narration should have longer estimated duration');
  assert.ok(est2 > 5000, 'Long sentence should exceed 5 seconds');
});

test('Timing Engine - time formatters', () => {
  assert.strictEqual(formatTimeMs(0), '00:00.000');
  assert.strictEqual(formatTimeMs(65432), '01:05.432');
  assert.strictEqual(formatDurationHuman(4500), '4.5s');
  assert.strictEqual(formatDurationHuman(75000), '1m 15s');
});

test('Timing Engine - contiguous timeline calculation', () => {
  const scenes = [
    { sceneId: 's1', durationMs: 4000 },
    { sceneId: 's2', durationMs: 6000 },
    { sceneId: 's3', durationMs: 5000 },
  ];

  const calculated = recalculateContiguousTimeline(scenes, 0);
  assert.strictEqual(calculated.length, 3);

  assert.strictEqual(calculated[0].startMs, 0);
  assert.strictEqual(calculated[0].endMs, 4000);
  assert.strictEqual(calculated[0].order, 1);

  assert.strictEqual(calculated[1].startMs, 4000);
  assert.strictEqual(calculated[1].endMs, 10000);
  assert.strictEqual(calculated[1].order, 2);

  assert.strictEqual(calculated[2].startMs, 10000);
  assert.strictEqual(calculated[2].endMs, 15000);
  assert.strictEqual(calculated[2].order, 3);
});

test('Timing Engine - ripple edit calculations', () => {
  const scenes = [
    { sceneId: 's1', startMs: 0, endMs: 4000 },
    { sceneId: 's2', startMs: 4000, endMs: 9000 },
    { sceneId: 's3', startMs: 9000, endMs: 14000 },
  ];

  // Increase s1 duration from 4000 to 6000 (+2000ms delta)
  const rippled = calculateRippleEdit(scenes, 's1', 6000);

  assert.strictEqual(rippled[0].startMs, 0);
  assert.strictEqual(rippled[0].endMs, 6000);

  assert.strictEqual(rippled[1].startMs, 6000);
  assert.strictEqual(rippled[1].endMs, 11000);

  assert.strictEqual(rippled[2].startMs, 11000);
  assert.strictEqual(rippled[2].endMs, 16000);
});

test('Timing Engine - audio duration validation and warning', () => {
  // Scenario 1: Audio fits inside scene duration
  const valid = validateSceneTiming({
    startMs: 0,
    endMs: 6000,
    actualAudioDurationMs: 4500,
  });
  assert.strictEqual(valid.isValid, true);
  assert.strictEqual(valid.warning, undefined);

  // Scenario 2: Audio exceeds scene duration
  const invalid = validateSceneTiming({
    startMs: 0,
    endMs: 4000,
    actualAudioDurationMs: 5800,
  });
  assert.strictEqual(invalid.isValid, false);
  assert.ok(invalid.warning?.includes('exceeds scene duration'));
  assert.strictEqual(invalid.overflowMs, 1800);
});

test('Database - Story and Scene Operations', async () => {
  const isolatedStoryId = `story-editor-iso-${randomUUID().slice(0, 8)}`;
  await createStory({
    storyId: isolatedStoryId,
    title: 'The Brave Little Explorer [Isolated Test]',
    logline: 'An adventurous journey into the deep forest',
  });

  const story = await getStoryByStoryId(isolatedStoryId);
  assert.ok(story, 'Should load existing story by storyId');
  assert.strictEqual(story?.storyId, isolatedStoryId);

  // Test updating story metadata
  const originalTitle = story?.title || 'Story';
  const testTitle = `${originalTitle} [Updated]`;
  await updateStoryMetadata(isolatedStoryId, { title: testTitle, targetDuration: 60000 });

  const updatedStory = await getStoryByStoryId(isolatedStoryId);
  assert.strictEqual(updatedStory?.title, testTitle);
  assert.strictEqual(updatedStory?.targetDuration, 60000);

  // Test scene creation, versioning, and cleanup
  const testSceneId = `test-scene-${randomUUID().slice(0, 8)}`;
  const created = await createScene({
    id: randomUUID(),
    sceneId: testSceneId,
    storyId: isolatedStoryId,
    title: 'Test Integration Scene',
    number: 999,
    order: 999,
    startMs: 60000,
    endMs: 65000,
    narration: 'This is a test narration for the automated test suite.',
    visualPrompt: 'A glowing robot writing code in a cozy workshop.',
    cameraDirection: 'Medium shot',
    estimatedDurationMs: 5000,
    generationStatus: 'draft',
  });

  assert.strictEqual(created.sceneId, testSceneId);
  assert.strictEqual(created.title, 'Test Integration Scene');

  // Test updating scene
  const updatedScene = await updateScene(testSceneId, {
    title: 'Updated Integration Scene',
    startMs: 60000,
    endMs: 67000,
    estimatedDurationMs: 7000,
  });
  assert.strictEqual(updatedScene.title, 'Updated Integration Scene');
  assert.strictEqual(updatedScene.endMs, 67000);

  // Test scene versioning
  const version = await createSceneVersion({
    id: randomUUID(),
    sceneId: testSceneId,
    prompt: 'Version 1 prompt description',
    narration: 'Version 1 narration text',
    cameraDirection: 'Wide establishing',
    durationMs: 7000,
  });
  assert.ok(version.id);

  const versions = await getSceneVersions(testSceneId);
  assert.ok(versions.length >= 1);
  assert.strictEqual(versions[0].prompt, 'Version 1 prompt description');

  // Clean up: delete test scene and isolated test story
  await deleteScene(testSceneId);
  await deleteStory(isolatedStoryId);
});

test('Video Assembly Service - Export Job Creation and Status', () => {
  const service = new VideoAssemblyService();
  const job = service.startExportJob({
    storyId: 'non-existent-story-for-test',
    resolution: '720p',
    fps: 30,
  });

  assert.ok(job.id, 'Job should have an ID');
  assert.ok(job.status === 'queued' || job.status === 'processing' || job.status === 'failed');

  const retrieved = service.getJob(job.id);
  assert.ok(retrieved, 'Should retrieve job by ID');
  assert.strictEqual(retrieved?.id, job.id);
});

test('Timing Engine - Ripple edit preserves dialogue relative startMs and shifts downstream', () => {
  const scenes = [
    {
      sceneId: 'sc1',
      startMs: 0,
      endMs: 5000,
      animationData: {
        dialogueLines: [{ id: 'd1', startMs: 1200, durationMs: 2500, text: 'Hello' }],
      },
    },
    {
      sceneId: 'sc2',
      startMs: 5000,
      endMs: 10000,
      animationData: {
        dialogueLines: [{ id: 'd2', startMs: 500, durationMs: 2000, text: 'World' }],
      },
    },
  ];

  // Extend sc1 from 5000 to 7000ms (+2000ms delta)
  const rippled = calculateRippleEdit(scenes as any, 'sc1', 7000);
  assert.strictEqual(rippled[0].startMs, 0);
  assert.strictEqual(rippled[0].endMs, 7000);
  assert.strictEqual(rippled[1].startMs, 7000);
  assert.strictEqual(rippled[1].endMs, 12000);
  // sc1 dialogue relative startMs is preserved at 1200ms
  assert.strictEqual((rippled[0] as any).animationData.dialogueLines[0].startMs, 1200);
  // sc2 dialogue relative startMs is preserved at 500ms
  assert.strictEqual((rippled[1] as any).animationData.dialogueLines[0].startMs, 500);
});


