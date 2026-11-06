import test from 'node:test';
import assert from 'node:assert';
import 'dotenv/config';
import express from 'express';
import { AddressInfo } from 'net';
import { contentRouter } from '../src/routes/content.js';
import {
  createStory,
  createScene,
  getSceneBySceneId,
  deleteStory,
  getStoryByStoryId,
  updateStoryVisualBible,
  getStoryVisualBible,
} from '../src/services/database/database.service.js';
import { VisualBibleService } from '../src/services/story-generation/visual-bible.service.js';
import { LocationContinuityService } from '../src/services/story-generation/location-continuity.service.js';
import { ScenePromptV2Service } from '../src/services/story-generation/scene-prompt-v2.service.js';
import { StoryVisualBible } from '../src/services/story-generation/visual-bible.types.js';

// Minimal 1x1 valid PNG buffer
const VALID_1X1_PNG = Buffer.from(
  '89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000a49444154789c63000100000500010d0a2d420000000049454e44ae426082',
  'hex'
);

function createTestServer() {
  const app = express();
  app.use(express.json({ limit: '50mb' }));
  app.use('/api/content', contentRouter);
  const server = app.listen(0);
  const port = (server.address() as AddressInfo).port;
  const baseUrl = `http://localhost:${port}`;
  return {
    baseUrl,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}

test('V2 Intelligent Scene Background Prompt Generator Suite', async (t) => {
  const { baseUrl, close } = createTestServer();
  const testStoryId = `test-v2-story-${Date.now()}`;
  const scene1Id = `test-v2-scene-1-${Date.now()}`;
  const scene2Id = `test-v2-scene-2-${Date.now()}`;
  const scene3Id = `test-v2-scene-3-${Date.now()}`;

  t.after(async () => {
    try {
      await deleteStory(testStoryId);
    } catch {
      // ignore
    }
    await close();
  });

  // Setup test story with 3 scenes in the same recurring forest
  await t.test('Setup: Create Story and Multi-Scene Narrative', async () => {
    const story = await createStory({
      storyId: testStoryId,
      title: 'जादुई जंगल की सैर (Magical Forest Journey)',
      targetAge: '5-8',
      moralLesson: 'Protect nature and stay curious',
      visualStyle: 'Cinematic Storybook',
    });
    assert.strictEqual(story.storyId, testStoryId);

    // Scene 1: Morning in the magical forest
    await createScene({
      sceneId: scene1Id,
      storyId: testStoryId,
      number: 1,
      title: 'Scene 1: Morning in Ancient Oak Forest (जादुई जंगल)',
      narration: 'The morning sun rose over the giant ancient oak trees, casting golden rays upon the mossy forest floor.',
      cameraDirection: 'Eye-level wide shot',
      animationData: {
        version: 1,
        viewport: { width: 1280, height: 720 },
        characterInstances: [
          {
            instanceId: 'char-arjun',
            characterId: 'char-1',
            name: 'Arjun',
            position: { x: 640, y: 500 },
            scale: { x: 1, y: 1 },
          },
        ],
        animationClips: [],
      } as any,
    });

    // Scene 2: Rain storm in the same forest
    await createScene({
      sceneId: scene2Id,
      storyId: testStoryId,
      number: 2,
      title: 'Scene 2: Gentle Rain in Ancient Oak Forest',
      narration: 'Gentle raindrops fell through the oak canopy, making the river sparkle in the misty afternoon.',
      cameraDirection: 'High angle / Bird\'s eye view',
      animationData: {
        version: 1,
        viewport: { width: 1280, height: 720 },
        characterInstances: [],
        animationClips: [],
      } as any,
    });

    // Scene 3: Sunset in the same forest
    await createScene({
      sceneId: scene3Id,
      storyId: testStoryId,
      number: 3,
      title: 'Scene 3: Twilight at Ancient Oak Forest',
      narration: 'As evening arrived, fireflies lit up around the ancient oak trees under a purple twilight sky.',
      cameraDirection: 'Low-angle shot',
      animationData: {
        version: 1,
        viewport: { width: 1280, height: 720 },
        characterInstances: [],
        animationClips: [],
      } as any,
    });
  });

  // 1. Story Visual Bible Tests
  await t.test('1. Story Visual Bible — Generation, Persistence and API', async () => {
    // GET /api/content/stories/:storyId/visual-bible (auto-initializes)
    const res = await fetch(`${baseUrl}/api/content/stories/${testStoryId}/visual-bible`);
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.strictEqual(data.success, true);
    assert.ok(data.visualBible);

    const bible: StoryVisualBible = data.visualBible;
    assert.ok(bible.artDirection.style.toLowerCase().includes('cinematic'));
    assert.ok(bible.artDirection.renderingTechnique.length > 5);
    assert.ok(bible.exclusionRules.prohibitedElements.length >= 3);
    assert.ok(
      bible.exclusionRules.negativePrompt.toLowerCase().includes('no humans') ||
      bible.exclusionRules.negativePrompt.toLowerCase().includes('environment plate only')
    );

    // Update Visual Bible via PUT
    const putRes = await fetch(`${baseUrl}/api/content/stories/${testStoryId}/visual-bible`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        lightingAndColorIdentity: {
          lightingQuality: 'Enchanted Golden Hour',
          dominantColors: ['#f59e0b', '#10b981', '#3b82f6'],
        },
      }),
    });
    assert.strictEqual(putRes.status, 200);
    const putData = await putRes.json();
    assert.strictEqual(putData.success, true);
    assert.strictEqual(putData.visualBible.lightingAndColorIdentity.lightingQuality, 'Enchanted Golden Hour');
    assert.strictEqual(putData.visualBible.version, 2);
  });

  // 2. Location Continuity Tests
  await t.test('2. Location Continuity — Stable ID and Multi-Scene Anchors', async () => {
    const locName1 = LocationContinuityService.extractLocationName('Morning in Ancient Oak Forest (जादुई जंगल)');
    const locName2 = LocationContinuityService.extractLocationName('Gentle Rain in Ancient Oak Forest');
    const locName3 = LocationContinuityService.extractLocationName('Twilight at Ancient Oak Forest');

    const locId1 = LocationContinuityService.resolveLocationId(locName1);
    const locId2 = LocationContinuityService.resolveLocationId(locName2);
    const locId3 = LocationContinuityService.resolveLocationId(locName3);

    // All three should map to the ancient oak forest location anchor
    assert.strictEqual(locId1, locId2);
    assert.strictEqual(locId2, locId3);
    assert.ok(locId1.includes('ancient-oak-forest') || locId1.includes('forest'));

    // Test Devanagari Hindi Location Name extraction
    const hindiLocName = LocationContinuityService.extractLocationName('सुंदर घना जादुई जंगल की गुफा');
    const hindiLocId = LocationContinuityService.resolveLocationId(hindiLocName);
    assert.ok(hindiLocId.length > 0);

    // Verify dynamic attribute differences across the 3 scenes
    const tod1 = LocationContinuityService.detectTimeOfDay('The morning sun rose warmly');
    assert.strictEqual(tod1, 'MORNING');

    const weather2 = LocationContinuityService.detectWeather('Gentle raindrops fell in the afternoon mist');
    assert.strictEqual(weather2, 'RAINY');

    const tod3 = LocationContinuityService.detectTimeOfDay('Purple twilight and night fireflies appeared');
    assert.ok(tod3 === 'TWILIGHT' || tod3 === 'NIGHT');
  });

  // 3. V2 Scene Background Prompt Generation (Workflow A - Zero Image Credits)
  await t.test('3. Workflow A — Generate Character-Free Environment Prompts (0 Credits Consumed)', async () => {
    // Generate prompt for Scene 1
    const res1 = await fetch(`${baseUrl}/api/content/scenes/${scene1Id}/background-prompt/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        aspectRatio: '16:9',
        cameraDirection: 'Eye-level wide shot',
      }),
    });
    assert.strictEqual(res1.status, 200);
    const data1 = await res1.json();
    assert.strictEqual(data1.success, true);
    assert.ok(data1.prompt);
    assert.strictEqual(data1.validation.isValid, true);

    const prompt1: string = data1.prompt;

    // Strict requirements verification:
    // a. Environment Plate Only
    assert.ok(prompt1.includes('Environment plate only'), 'Prompt must specify environment plate only');
    // b. Negative exclusions (no humans, no characters, no animals)
    assert.ok(
      prompt1.toLowerCase().includes('no humans') &&
      prompt1.toLowerCase().includes('characters') &&
      prompt1.toLowerCase().includes('people'),
      'Prompt must contain strict negative exclusions'
    );
    // c. Character name 'Arjun' MUST NOT appear anywhere in the background prompt
    assert.ok(!prompt1.includes('Arjun'), 'Character names must never appear in generated background prompt');
    // d. Central middleground open directive for 2D vector rigs
    assert.ok(
      prompt1.toLowerCase().includes('middleground clear') ||
      prompt1.toLowerCase().includes('open middleground') ||
      prompt1.toLowerCase().includes('empty middle ground') ||
      prompt1.toLowerCase().includes('clear'),
      'Prompt must reserve middleground for vector rigs'
    );
    // e. Aspect ratio tag
    assert.ok(prompt1.includes('--ar 16:9'), 'Prompt must specify aspect ratio');
    // f. Camera Perspective
    assert.ok(prompt1.toLowerCase().includes('eye-level') || prompt1.toLowerCase().includes('wide'), 'Camera perspective must be integrated');

    // Check version entry
    assert.ok(data1.promptEntry);
    assert.strictEqual(data1.promptEntry.version, 1);
    assert.strictEqual(data1.promptEntry.source, 'google_flow_manual');
  });

  // 4. Prompt History & Manual Save / Restore
  await t.test('4. Prompt History — Saving, Listing, and Restoring Versions', async () => {
    // Get history for Scene 1
    const histRes = await fetch(`${baseUrl}/api/content/scenes/${scene1Id}/background-prompt/history`);
    assert.strictEqual(histRes.status, 200);
    const histData = await histRes.json();
    assert.ok(histData.history.length >= 1);
    const v1Id = histData.history[0].id;

    // Save a manual edit version (e.g. user tweaks the prompt text)
    const manualPrompt = `${histData.history[0].prompt} Added extra bioluminescent mushrooms.`;
    const saveRes = await fetch(`${baseUrl}/api/content/scenes/${scene1Id}/background-prompt/save`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        prompt: manualPrompt,
        cameraPerspective: 'Close-up',
        aspectRatio: '16:9',
      }),
    });
    assert.strictEqual(saveRes.status, 200);
    const saveData = await saveRes.json();
    assert.strictEqual(saveData.promptEntry.version, 2);
    assert.strictEqual(saveData.promptEntry.isManualEdit, true);

    // Verify history now has 2 entries
    assert.strictEqual(saveData.history.length, 2);

    // Restore v1
    const restoreRes = await fetch(`${baseUrl}/api/content/scenes/${scene1Id}/background-prompt/restore`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ versionId: v1Id }),
    });
    assert.strictEqual(restoreRes.status, 200);
    const restoreData = await restoreRes.json();
    assert.strictEqual(restoreData.success, true);
    assert.strictEqual(restoreData.prompt, histData.history[0].prompt);
  });

  // 5. Google Flow Manual Workflow — Import Image with Linked Prompt
  await t.test('5. Workflow A — Import Google Flow Generated Image and Link Prompt', async () => {
    const base64Data = VALID_1X1_PNG.toString('base64');
    const flowPrompt = 'Enchanted ancient oak forest at sunrise, environment plate only. --ar 16:9';

    const uploadRes = await fetch(`${baseUrl}/api/content/scenes/${scene1Id}/background/upload`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        filename: 'flow-generation-oak-forest.png',
        fileData: base64Data,
        fit: 'cover',
        source: 'google_flow_manual',
        prompt: flowPrompt,
      }),
    });
    assert.strictEqual(uploadRes.status, 200);
    const uploadData = await uploadRes.json();
    assert.strictEqual(uploadData.success, true);
    assert.ok(uploadData.background.imageUrl);

    // Verify scene in database has source: 'google_flow_manual' and prompt
    const updatedScene = await getSceneBySceneId(scene1Id);
    assert.ok(updatedScene);
    const bg = (updatedScene.animationData as any)?.background;
    assert.strictEqual(bg.source, 'google_flow_manual');
    assert.strictEqual(bg.prompt, flowPrompt);
    assert.strictEqual(bg.fit, 'cover');
  });

  // 6. Camera Movement Safety: Still background prompts must NOT contain video motion keywords
  await t.test('6. Prompt Safety — Video motion keywords excluded from still prompts', () => {
    const testPromptWithPan = 'A tranquil forest path. Environment plate only. Pan left and tilt down smoothly. No characters. --ar 16:9';
    const validation = ScenePromptV2Service.validatePrompt(testPromptWithPan);
    // Pan and tilt should be flagged or stripped
    assert.ok(
      validation.warnings.some((v) => v.toLowerCase().includes('motion')) ||
      !validation.cleanPrompt.toLowerCase().includes('pan left'),
      'Video motion keywords must be detected or stripped from background prompt'
    );
  });
});
