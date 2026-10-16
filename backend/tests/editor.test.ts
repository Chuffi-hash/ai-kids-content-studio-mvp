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
  const stories = await getAllStories();
  assert.ok(Array.isArray(stories), 'Should retrieve array of stories');
  assert.ok(stories.length > 0, 'Should have existing stories in database');

  const firstStory = stories[0];
  const story = await getStoryByStoryId(firstStory.storyId);
  assert.ok(story, 'Should load existing story by storyId');
  assert.strictEqual(story?.storyId, firstStory.storyId);

  // Test updating story metadata
  const originalTitle = story?.title || 'Story';
  const testTitle = `${originalTitle} [Editor Test]`;
  await updateStoryMetadata(firstStory.storyId, { title: testTitle, targetDuration: 60000 });

  const updatedStory = await getStoryByStoryId(firstStory.storyId);
  assert.strictEqual(updatedStory?.title, testTitle);
  assert.strictEqual(updatedStory?.targetDuration, 60000);

  // Restore original title
  await updateStoryMetadata(firstStory.storyId, { title: originalTitle });

  // Test scene creation, versioning, and cleanup
  const testSceneId = `test-scene-${randomUUID().slice(0, 8)}`;
  const created = await createScene({
    id: randomUUID(),
    sceneId: testSceneId,
    storyId: firstStory.storyId,
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

  // Clean up: delete test scene
  await deleteScene(testSceneId);
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

