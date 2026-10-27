import test from 'node:test';
import assert from 'node:assert/strict';
import { StoryGenerationService } from '../src/services/story-generation/story-generation.service.js';
import { StoryImporterService } from '../src/services/story-generation/story-importer.service.js';
import { prisma, getStoryByStoryId, getScenesByStoryId } from '../src/services/database/database.service.js';

test('AI Story Creation - Generate Hindi Draft Story with Earth', async () => {
  const draft = await StoryGenerationService.generateDraftStory({
    topic: 'Earth teaches children how the four seasons bring balance, beauty, and life to our planet',
    desiredDurationSeconds: 60,
    language: 'Hindi',
    genre: 'Educational',
    audience: '4-7 years',
  });

  assert.ok(draft.title, 'Draft must have a title');
  assert.equal(draft.language, 'Hindi', 'Language must be Hindi');
  assert.ok(draft.scenes.length >= 3, 'Must have at least 3 scenes');
  assert.equal(draft.targetDurationSeconds, 60, 'Target duration must be 60');

  // Verify Earth character resolution
  const earthChar = draft.characters.find((c) => c.name.toLowerCase() === 'earth');
  assert.ok(earthChar, 'Earth must be present in characters');
  assert.equal(earthChar.voice, 'hf_alpha', 'Earth must have female Hindi voice hf_alpha');

  // Verify scene separation of narration and dialogue
  for (const scene of draft.scenes) {
    assert.ok(scene.title, 'Scene must have title');
    assert.ok(scene.visualPrompt, 'Scene must have visualPrompt');
    assert.ok(scene.narration, 'Scene must have narration');
    assert.ok(scene.dialogue.length > 0, 'Scene must have dialogue');

    // Narration must not be identical to dialogue
    const allDialogueText = scene.dialogue.map((d) => d.text).join(' ');
    assert.notEqual(scene.narration, allDialogueText, 'Narration must be separate from dialogue');

    // Earth dialogue must use female voice
    const earthLines = scene.dialogue.filter((d) => d.characterName.toLowerCase() === 'earth');
    for (const line of earthLines) {
      assert.equal(line.voice, 'hf_alpha', 'Earth dialogue lines must be assigned hf_alpha');
    }
  }

  // Verify atmosphere overlays are suggested
  const allOverlays = draft.scenes.flatMap((s) => s.suggestedOverlays);
  assert.ok(allOverlays.length > 0, 'Must have auto-suggested atmosphere overlays');
});

test('Story Importer - Create Story from Draft without Auto-Generating Media', async () => {
  const draft = await StoryGenerationService.generateDraftStory({
    topic: 'Earth teaches children about seasons',
    desiredDurationSeconds: 60,
    language: 'Hindi',
  });

  const createdResult = await StoryImporterService.createStoryFromDraft({
    title: draft.title,
    targetDurationSeconds: draft.targetDurationSeconds,
    language: draft.language,
    logline: draft.logline,
    lesson: draft.lesson,
    characters: draft.characters,
    scenes: draft.scenes,
  });

  assert.ok(createdResult.storyId, 'Must return created storyId');
  assert.ok(createdResult.story, 'Must return created story record');
  assert.equal(createdResult.scenes.length, draft.scenes.length, 'Must have created all draft scenes');

  // Verify in database
  const storyInDb = await getStoryByStoryId(createdResult.storyId);
  assert.ok(storyInDb, 'Story must exist in database');
  assert.equal(storyInDb.title, draft.title, 'Story title must match draft');
  assert.ok(storyInDb.targetDuration! > 0, 'Target duration must be set');

  const scenesInDb = await getScenesByStoryId(createdResult.storyId, false);
  assert.equal(scenesInDb.length, draft.scenes.length, 'All scenes must be persisted in database');

  for (const sc of scenesInDb) {
    assert.equal(sc.generationStatus, 'draft', 'Status must be draft');
    assert.equal(sc.imageUrl, null, 'Image must NOT be auto-generated');
    assert.equal(sc.audioUrl, null, 'Audio must NOT be auto-generated');
    assert.equal(sc.videoUrl, null, 'Video must NOT be auto-generated');

    const animData = sc.animationData as any;
    assert.ok(animData, 'Animation data must exist');
    assert.ok(animData.dialogueLines.length > 0, 'Dialogue lines must exist');

    const earthDialogue = animData.dialogueLines.find((d: any) => d.characterName.toLowerCase() === 'earth');
    if (earthDialogue) {
      assert.equal(earthDialogue.voice, 'hf_alpha', 'Persisted Earth dialogue must have voice hf_alpha');
    }
  }

  // Cleanup
  await (prisma as any).storyCharacter.deleteMany({ where: { storyId: createdResult.storyId } });
  await (prisma as any).scene.deleteMany({ where: { storyId: createdResult.storyId } });
  await (prisma as any).story.deleteMany({ where: { storyId: createdResult.storyId } });
});
