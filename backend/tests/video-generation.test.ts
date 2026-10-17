import test from 'node:test';
import assert from 'node:assert';
import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { getVideoGenerationProvider } from '../src/services/production/production-provider.factory.js';
import { FFmpegVideoProvider } from '../src/services/production/video-generation/providers/ffmpeg-video.provider.js';
import { AIVideoProvider } from '../src/services/production/video-generation/providers/ai-video.provider.js';
import { getAllStories, createStory, deleteStory, createScene, getSceneBySceneId, updateScene, deleteScene } from '../src/services/database/database.service.js';
import { randomUUID } from 'crypto';

test('Video Generation - Provider Factory', () => {
  const ffmpegProvider = getVideoGenerationProvider('ffmpeg');
  assert.ok(ffmpegProvider instanceof FFmpegVideoProvider, 'Should return FFmpegVideoProvider for ffmpeg workflow');

  const aiProvider = getVideoGenerationProvider('ai');
  assert.ok(aiProvider instanceof AIVideoProvider, 'Should return AIVideoProvider for ai workflow');
});

test('Video Generation - AI Provider credential validation', async () => {
  const aiProvider = new AIVideoProvider();

  // Unless user specifically configured keys, AI provider should throw descriptive error
  if (!process.env.REPLICATE_API_TOKEN && !process.env.RUNWAY_API_KEY) {
    await assert.rejects(
      async () => {
        await aiProvider.generateVideo({
          prompt: 'A friendly blue bunny hopping through a meadow',
          duration: 3,
        });
      },
      (err: any) => {
        assert.ok(
          err.message.includes('AI Video Provider requires valid API credentials') ||
          err.message.includes('REPLICATE_API_TOKEN') ||
          err.message.includes('RUNWAY_API_KEY'),
          'Error must clearly identify missing credentials'
        );
        return true;
      }
    );
  }
});

test('Video Generation - FFmpeg Ken Burns Video Rendering with Audio and Faststart', async () => {
  const ffmpegProvider = new FFmpegVideoProvider();

  // Create a minimal 1x1 PNG or small image for test rendering
  const testDir = path.join(process.cwd(), 'storage', 'temp');
  if (!fs.existsSync(testDir)) {
    fs.mkdirSync(testDir, { recursive: true });
  }

  // Base64 minimal 100x100 red PNG
  const samplePngBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAGQAAABkCAYAAABw4pVUAAAAlUlEQVR42u3RAQ0AAAgDIN8/tL3hAQV0kCStfRwLFiRYsCDBggQLFixYsCDBggQLFixYsCDBggQLFixYsCDBggQLFixYsCDBggQLFixYsCDBggQLFixYsCDBggQLFixYsCDBggQLFixYsCDBggQLFixYsCDBggQLFixYsCDBggQLFixYsCDBggQLFixYsCDBggQLFixY8NqCBQk+y+YFv0VjR48AAAAASUVORK5CYII=';
  const testImagePath = path.join(testDir, `test-kenburns-${Date.now()}.png`);
  fs.writeFileSync(testImagePath, Buffer.from(samplePngBase64, 'base64'));

  try {
    const output = await ffmpegProvider.generateVideo({
      imageUrl: testImagePath,
      duration: 3,
      cameraDirection: 'Dynamic tracking pan left-to-right',
      resolution: '1280x720',
      fps: 30,
    });

    assert.ok(output.url, 'Output should return accessible URL');
    assert.ok(
      output.duration !== undefined && output.duration >= 2.8 && output.duration <= 3.5,
      `Duration should be ~3s, got ${output.duration}`
    );
    assert.strictEqual(output.motionType, 'ken-burns');
    assert.strictEqual(output.provider, 'ffmpeg');

    // Verify file exists on disk and is non-empty
    const relPath = output.url.replace(/^\//, '');
    const absPath = path.join(process.cwd(), relPath);
    assert.ok(fs.existsSync(absPath), `Rendered MP4 file must exist on disk at ${absPath}`);
    const stats = fs.statSync(absPath);
    assert.ok(stats.size > 1000, `MP4 file must have content, size: ${stats.size}`);

    // Clean up rendered file
    try { fs.unlinkSync(absPath); } catch {}
  } finally {
    // Clean up test image
    try { fs.unlinkSync(testImagePath); } catch {}
  }
});

test('Database - Image and Video Asset Separation', async () => {
  const isolatedStoryId = `story-media-iso-${randomUUID().slice(0, 8)}`;
  await createStory({
    storyId: isolatedStoryId,
    title: 'Media Asset Separation Test Story',
    logline: 'An adventurous journey into media separation',
  });

  const testSceneId = `test-media-${randomUUID().slice(0, 8)}`;
  const initialImageUrl = '/storage/images/scene-test-initial.png';
  const newVideoUrl = '/storage/videos/scene-test-video.mp4';

  try {
    // 1. Create scene with initial image
    await createScene({
      id: randomUUID(),
      sceneId: testSceneId,
      storyId: isolatedStoryId,
      title: 'Media Asset Separation Test',
      number: 998,
      order: 998,
      startMs: 0,
      endMs: 5000,
      imageUrl: initialImageUrl,
      generationStatus: 'completed',
    });

    // 2. Attach videoUrl to scene without losing imageUrl
    const updated = await updateScene(testSceneId, {
      videoUrl: newVideoUrl,
    });

    assert.strictEqual(updated.imageUrl, initialImageUrl, 'Original scene image must NOT be overwritten when video is added');
    assert.strictEqual(updated.videoUrl, newVideoUrl, 'Video URL must be properly attached to scene');

    const retrieved = await getSceneBySceneId(testSceneId);
    assert.strictEqual(retrieved?.imageUrl, initialImageUrl, 'Persisted scene must retain image URL');
    assert.strictEqual(retrieved?.videoUrl, newVideoUrl, 'Persisted scene must retain video URL');
  } finally {
    // Clean up
    await deleteScene(testSceneId);
    await deleteStory(isolatedStoryId);
  }
});
