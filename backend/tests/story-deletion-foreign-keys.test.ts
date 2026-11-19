import test from 'node:test';
import assert from 'node:assert';
import 'dotenv/config';
import { randomUUID } from 'crypto';
import { prisma } from '../src/services/database/database.service.js';
import {
  createStory,
  getStoryByStoryId,
  deleteStory,
  createScene,
  createSceneVersion,
  createShot,
  createCharacter,
  linkStoryCharacter,
  deleteScene,
} from '../src/services/database/database.service.js';

test('Story Deletion - Atomically deletes stories with shots, scenes, versions, images and character links', async () => {
  const storyId = `story-del-test-${randomUUID()}`;
  const sceneId1 = `scene-del-1-${randomUUID()}`;
  const sceneId2 = `scene-del-2-${randomUUID()}`;
  const shotId1 = `shot-del-1-${randomUUID()}`;
  const shotId2 = `shot-del-2-${randomUUID()}`;
  const characterId = `char-del-${randomUUID()}`;

  // 1. Create character & story
  const character = await createCharacter({
    name: `Deletion Tester ${randomUUID().slice(0, 8)}`,
    species: 'Bear',
    personality: 'Friendly',
    visualDescription: 'A friendly brown bear',
    distinctiveFeatures: 'Red scarf',
  });

  const story = await createStory({
    storyId,
    title: 'Story to Delete',
    logline: 'Testing atomic cascade deletion of shots and scenes',
    lesson: 'Cleanliness',
    targetDuration: 60,
  });

  await linkStoryCharacter({
    id: randomUUID(),
    storyId,
    characterId: character.id,
  });

  // 2. Create scenes
  await createScene({
    id: randomUUID(),
    sceneId: sceneId1,
    storyId,
    title: 'Scene 1',
    number: 1,
    narration: 'Scene 1 narration',
  });

  await createScene({
    id: randomUUID(),
    sceneId: sceneId2,
    storyId,
    title: 'Scene 2',
    number: 2,
    narration: 'Scene 2 narration',
  });

  // 3. Create scene version & image for scene 1
  await createSceneVersion({
    id: randomUUID(),
    sceneId: sceneId1,
    versionNumber: 1,
    narration: 'Version 1 narration',
  });

  await prisma.image.create({
    data: {
      id: randomUUID(),
      sceneId: sceneId1,
      provider: 'mock',
      model: 'mock',
      prompt: 'Forest scene',
      storageKey: 'mock/key.png',
      imageUrl: 'http://localhost/mock.png',
      width: 1280,
      height: 720,
      status: 'completed',
    },
  });

  // 4. Create shots referencing scenes and story
  await createShot({
    id: randomUUID(),
    shotId: shotId1,
    storyId,
    sceneId: sceneId1,
    number: 1,
    order: 1,
    title: 'Shot 1 in Scene 1',
  });

  await createShot({
    id: randomUUID(),
    shotId: shotId2,
    storyId,
    sceneId: sceneId2,
    number: 2,
    order: 2,
    title: 'Shot 2 in Scene 2',
  });

  // Verify records exist before deletion
  const preStory = await getStoryByStoryId(storyId);
  assert.ok(preStory, 'Story must exist before deletion');

  const preShots = await prisma.shot.findMany({ where: { storyId } });
  assert.strictEqual(preShots.length, 2, 'Two shots must exist before deletion');

  const preScenes = await prisma.scene.findMany({ where: { storyId } });
  assert.strictEqual(preScenes.length, 2, 'Two scenes must exist before deletion');

  // 5. Delete story - MUST NOT fail with foreign key violation
  const deleted = await deleteStory(storyId);
  assert.strictEqual(deleted.storyId, storyId, 'Deleted story record must be returned');

  // 6. Verify all dependent records are completely cleaned up
  const postStory = await prisma.story.findUnique({ where: { storyId } });
  assert.strictEqual(postStory, null, 'Story must be deleted');

  const postShots = await prisma.shot.findMany({ where: { storyId } });
  assert.strictEqual(postShots.length, 0, 'All dependent shots must be deleted');

  const postScenes = await prisma.scene.findMany({ where: { storyId } });
  assert.strictEqual(postScenes.length, 0, 'All dependent scenes must be deleted');

  const postImages = await prisma.image.findMany({ where: { sceneId: sceneId1 } });
  assert.strictEqual(postImages.length, 0, 'All dependent images must be deleted');

  const postVersions = await prisma.sceneVersion.findMany({ where: { sceneId: sceneId1 } });
  assert.strictEqual(postVersions.length, 0, 'All dependent scene versions must be deleted');

  const postLinks = await prisma.storyCharacter.findMany({ where: { storyId } });
  assert.strictEqual(postLinks.length, 0, 'All story-character links must be deleted');

  // Clean up standalone character
  await prisma.character.delete({ where: { id: character.id } }).catch(() => {});
});

test('Story Deletion - Can delete a story without any scenes or shots', async () => {
  const storyId = `story-empty-${randomUUID()}`;

  const story = await createStory({
    storyId,
    title: 'Empty Story',
    logline: 'Story without scenes',
    lesson: 'Simplicity',
  });

  const deleted = await deleteStory(storyId);
  assert.strictEqual(deleted.storyId, storyId);

  const found = await prisma.story.findUnique({ where: { storyId } });
  assert.strictEqual(found, null, 'Empty story must be deleted successfully');
});

test('Story Deletion - Can delete a story with soft-deleted scenes and shots', async () => {
  const storyId = `story-soft-del-${randomUUID()}`;
  const sceneId = `scene-soft-${randomUUID()}`;
  const shotId = `shot-soft-${randomUUID()}`;

  await createStory({
    storyId,
    title: 'Story with Soft-Deleted Scene',
    logline: 'Testing cleanup of soft-deleted scenes',
    lesson: 'Safety',
  });

  await createScene({
    id: randomUUID(),
    sceneId,
    storyId,
    title: 'Scene to Soft Delete',
    number: 1,
    narration: 'Will be soft deleted',
  });

  await createShot({
    id: randomUUID(),
    shotId,
    storyId,
    sceneId,
    number: 1,
    order: 1,
    title: 'Shot in Scene',
  });

  // Soft-delete the scene
  await deleteScene(sceneId);
  const softScene = await prisma.scene.findUnique({ where: { sceneId } });
  assert.ok(softScene?.deletedAt !== null, 'Scene must be soft deleted');

  // Delete the whole story
  const deleted = await deleteStory(storyId);
  assert.strictEqual(deleted.storyId, storyId);

  const postScene = await prisma.scene.findUnique({ where: { sceneId } });
  assert.strictEqual(postScene, null, 'Soft-deleted scene must be permanently cleaned up with story');

  const postShot = await prisma.shot.findUnique({ where: { shotId } });
  assert.strictEqual(postShot, null, 'Shot must be permanently cleaned up with story');
});
