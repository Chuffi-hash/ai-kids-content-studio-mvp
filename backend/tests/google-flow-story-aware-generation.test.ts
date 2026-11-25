import test, { describe, before, after } from 'node:test';
import assert from 'node:assert';
import { randomUUID } from 'node:crypto';
import { prisma } from '../src/services/database/database.service.js';
import { StoryContextService } from '../src/services/google-flow/story-context.service.js';
import { GenerationPromptService } from '../src/services/google-flow/generation-prompt.service.js';
import { GenerationOrchestratorService } from '../src/services/generation-orchestrator/generation-orchestrator.service.js';

describe('Story-Aware Direct Generation & Context Resolver Test Suite', () => {
  const testStoryId = `test-story-${Date.now()}`;
  const char1Id = `test-char1-${Date.now()}`;
  const char2Id = `test-char2-${Date.now()}`;
  const scene1Id = `scene-1-${Date.now()}`;
  const scene2Id = `scene-2-${Date.now()}`;
  const scene3Id = `scene-3-${Date.now()}`;

  before(async () => {
    // 1. Create Test Characters
    await prisma.character.create({
      data: {
        id: char1Id,
        name: 'Barnaby Owl',
        species: 'Owl',
        personality: 'Wise, gentle, and curious',
        visualDescription: 'A round tawny owl with golden feathered tufts and large amber eyes',
        distinctiveFeatures: 'Wearing a tiny woven acorn cap',
        referenceImageUrl: 'https://storage.local/test/barnaby-master.png',
      },
    });

    await prisma.character.create({
      data: {
        id: char2Id,
        name: 'Luna Rabbit',
        species: 'Rabbit',
        personality: 'Brave, energetic, and playful',
        visualDescription: 'A nimble snow-white rabbit with long ears and bright blue eyes',
        distinctiveFeatures: 'Wearing a bright blue woolen vest',
        referenceImageUrl: null, // Missing master reference
      },
    });

    // 2. Create Story
    await prisma.story.create({
      data: {
        storyId: testStoryId,
        title: 'The Great Meadow Expedition',
        logline: 'Two forest friends explore beyond the ancient oaks to find the Whispering Falls.',
        lesson: 'Teamwork and curiosity light the way through the unknown.',
        genre: 'Nature Adventure',
        visualStyle: 'storybook_illustrated',
        visualBible: {
          aspectRatio: '16:9',
          artStyle: 'storybook_illustrated',
        },
      },
    });

    // 3. Link Story Characters
    await prisma.storyCharacter.createMany({
      data: [
        { storyId: testStoryId, characterId: char1Id },
        { storyId: testStoryId, characterId: char2Id },
      ],
    });

    // 4. Create Scenes with Characters and Backgrounds
    await prisma.scene.create({
      data: {
        sceneId: scene1Id,
        storyId: testStoryId,
        number: 1,
        title: 'The Ancient Hollow Oak',
        narration: 'Deep in the heart of Whispering Woods, gentle morning sunbeams filtered through dew-kissed leaves.',
        visualPrompt: 'A massive ancient mossy oak tree with a warm hollow doorway, morning sunbeams, wildflowers and mushrooms on the forest floor.',
        cameraDirection: 'Eye-level wide shot',
        characterIds: JSON.stringify([char1Id]),
        imageUrl: 'https://storage.local/test/scene1-bg.png', // Already has background
        animationData: {
          background: {
            imageUrl: 'https://storage.local/test/scene1-bg.png',
            aspectRatio: '16:9',
          },
        },
      },
    });

    await prisma.scene.create({
      data: {
        sceneId: scene2Id,
        storyId: testStoryId,
        number: 2,
        title: 'The Crystal Brook Bridge',
        narration: 'Barnaby and Luna arrived at a babbling brook with a mossy stone bridge under warm afternoon light.',
        visualPrompt: 'A sparkling clear river with smooth stepping stones, a wooden footbridge, weeping willows and dancing dragonflies under golden afternoon sky.',
        cameraDirection: 'Medium landscape view',
        characterIds: JSON.stringify([char1Id, char2Id]),
        imageUrl: null, // Missing background
      },
    });

    await prisma.scene.create({
      data: {
        sceneId: scene3Id,
        storyId: testStoryId,
        number: 3,
        title: 'Nightfall at Whispering Falls',
        narration: 'As twilight fell, a bioluminescent waterfall glowed softly under a starry night sky.',
        visualPrompt: 'A breathtaking sparkling waterfall cascading into a still pool with glowing blue flowers, starry night sky and crescent moon.',
        cameraDirection: 'Wide panoramic establishing shot',
        characterIds: JSON.stringify([char2Id]),
        imageUrl: null, // Missing background
      },
    });
  });

  after(async () => {
    try {
      await prisma.image.deleteMany({ where: { sceneId: { in: [scene1Id, scene2Id, scene3Id] } } });
      await prisma.scene.deleteMany({ where: { storyId: testStoryId } });
      await prisma.storyCharacter.deleteMany({ where: { storyId: testStoryId } });
      await prisma.story.deleteMany({ where: { storyId: testStoryId } });
      await prisma.character.deleteMany({ where: { id: { in: [char1Id, char2Id] } } });
    } catch (cleanupErr) {
      console.warn('Cleanup error:', cleanupErr);
    }
  });

  test('1. StoryContextService: Resolves complete canonical story, scenes, and character appearances', async () => {
    const context = await StoryContextService.resolveStoryContext(testStoryId);

    // Verify Story metadata
    assert.strictEqual(context.story.storyId, testStoryId);
    assert.strictEqual(context.story.title, 'The Great Meadow Expedition');
    assert.strictEqual(context.story.visualStyle, 'storybook_illustrated');
    assert.strictEqual(context.story.aspectRatio, '16:9');

    // Verify Scenes resolution & ordering
    assert.strictEqual(context.scenes.length, 3);
    assert.strictEqual(context.scenes[0].sceneId, scene1Id);
    assert.strictEqual(context.scenes[0].number, 1);
    assert.strictEqual(context.scenes[0].hasBackground, true);
    assert.strictEqual(context.scenes[0].backgroundUrl, 'https://storage.local/test/scene1-bg.png');
    assert.strictEqual(context.scenes[0].location, 'Lush Storybook Forest');

    assert.strictEqual(context.scenes[1].sceneId, scene2Id);
    assert.strictEqual(context.scenes[1].number, 2);
    assert.strictEqual(context.scenes[1].hasBackground, false);
    assert.strictEqual(context.scenes[1].location, 'Sparkling Riverbank');

    assert.strictEqual(context.scenes[2].sceneId, scene3Id);
    assert.strictEqual(context.scenes[2].number, 3);
    assert.strictEqual(context.scenes[2].hasBackground, false);
    assert.strictEqual(context.scenes[2].timeOfDay, 'Night');

    // Verify Characters & Appearances mapping from actual database relationships
    assert.strictEqual(context.characters.length, 2);
    const barnaby = context.characters.find((c) => c.id === char1Id);
    const luna = context.characters.find((c) => c.id === char2Id);

    assert.ok(barnaby);
    assert.strictEqual(barnaby.name, 'Barnaby Owl');
    assert.strictEqual(barnaby.hasMasterReference, true);
    // Barnaby appears in Scene 1 and Scene 2
    assert.strictEqual(barnaby.scenesCount, 2);
    assert.deepStrictEqual(
      barnaby.scenesAppearedIn.map((s) => s.sceneId).sort(),
      [scene1Id, scene2Id].sort()
    );

    assert.ok(luna);
    assert.strictEqual(luna.name, 'Luna Rabbit');
    assert.strictEqual(luna.hasMasterReference, false);
    // Luna appears in Scene 2 and Scene 3
    assert.strictEqual(luna.scenesCount, 2);
    assert.deepStrictEqual(
      luna.scenesAppearedIn.map((s) => s.sceneId).sort(),
      [scene2Id, scene3Id].sort()
    );

    // Verify Overall Readiness Summary
    assert.strictEqual(context.summary.totalScenes, 3);
    assert.strictEqual(context.summary.scenesWithBackground, 1);
    assert.strictEqual(context.summary.missingBackgroundCount, 2);
    assert.deepStrictEqual(context.summary.missingBackgroundSceneIds.sort(), [scene2Id, scene3Id].sort());

    assert.strictEqual(context.summary.totalCharacters, 2);
    assert.strictEqual(context.summary.charactersWithMasterReference, 1);
    assert.strictEqual(context.summary.missingReferenceCount, 1);
    assert.deepStrictEqual(context.summary.missingReferenceCharacterIds, [char2Id]);
  });

  test('2. GenerationPromptService: Enforces environment-only background prompts without characters', async () => {
    const context = await StoryContextService.resolveStoryContext(testStoryId);
    const scene2 = context.scenes.find((s) => s.sceneId === scene2Id)!;

    const bgPrompt = GenerationPromptService.buildSceneBackgroundPrompt(context.story, scene2);

    assert.ok(bgPrompt.prompt.includes('STRICT INSTRUCTION: Environment only! Empty scenic background plate'));
    assert.ok(bgPrompt.prompt.includes('Absolutely NO characters, NO humans, NO animals'));
    assert.ok(bgPrompt.negativePrompt.includes('characters, people, humans, animals'));
    assert.strictEqual(bgPrompt.aspectRatio, '16:9');
    assert.strictEqual(bgPrompt.width, 1024);
    assert.strictEqual(bgPrompt.height, 576);
  });

  test('3. GenerationPromptService: Builds canonical character references, turnarounds, and expressions', async () => {
    const context = await StoryContextService.resolveStoryContext(testStoryId);
    const luna = context.characters.find((c) => c.id === char2Id)!;

    // Master Reference: the character name remains metadata, never visible artwork text.
    const masterPrompt = GenerationPromptService.buildCharacterPrompt(context.story, luna, 'master_reference');
    assert.ok(masterPrompt.prompt.includes('Create one canonical full-body character reference illustration'));
    assert.ok(masterPrompt.prompt.includes('straight-on front view'));
    assert.ok(masterPrompt.prompt.includes('The character name is application metadata only'));
    assert.ok(masterPrompt.prompt.includes('No text, letters, numbers, typography'));
    assert.ok(!masterPrompt.prompt.includes('Luna Rabbit'));
    assert.ok(!/reference sheet|model sheet|contact sheet/i.test(masterPrompt.prompt));
    assert.ok(masterPrompt.negativePrompt.includes('character name'));

    const staleMappingWithoutFlowId = {
      ...luna,
      flowMapping: {
        flowCharacterName: 'Luna Flow',
        flowProjectId: 'flow-project',
        flowCharacterId: null,
        syncStatus: 'synced',
        lastSyncedAt: null,
      },
    } as any;
    const noIdPrompt = GenerationPromptService.buildCharacterPrompt(
      context.story,
      staleMappingWithoutFlowId,
      'turnaround',
      { variation: 'front' },
    );
    assert.ok(!noIdPrompt.prompt.includes('@Luna Flow'));
    assert.ok(noIdPrompt.prompt.includes('visual identity details'));

    // Directional view: each call requests one standalone angle, not a labelled sheet.
    const turnaroundPrompt = GenerationPromptService.buildCharacterPrompt(context.story, luna, 'turnaround', {
      variation: 'front-left',
    });
    assert.ok(turnaroundPrompt.prompt.includes('front three-quarter view'));
    assert.ok(turnaroundPrompt.prompt.includes('Generate only the requested camera angle in this image'));
    assert.ok(turnaroundPrompt.prompt.includes('Never place several angles together'));
    assert.ok(!turnaroundPrompt.prompt.includes('Luna Rabbit'));
    assert.ok(!/turnaround sheet|multiple views|collage/i.test(turnaroundPrompt.prompt));

    const backPrompt = GenerationPromptService.buildCharacterPrompt(context.story, luna, 'turnaround', {
      variation: 'back',
    });
    assert.ok(backPrompt.prompt.includes('full rear view'));
    assert.ok(backPrompt.prompt.includes('same neutral standing pose'));

    // Google Flow uses the selected editor image as context. Keep these
    // prompts short, natural, and free of plain-text @mentions.
    const mappedFlowCharacter = {
      ...luna,
      flowMapping: {
        flowCharacterName: 'भोलू',
        flowProjectId: 'flow-project',
        flowCharacterId: 'flow-character-123',
        flowCharacterUrl: 'https://flow.google.com/project/flow-project/character/flow-character-123',
        syncStatus: 'synced',
        lastSyncedAt: new Date().toISOString(),
      },
    } as any;

    const expectedFlowDirections: Record<string, string> = {
      front: 'Front view:',
      'front-left': 'Front three-quarter LEFT view:',
      'front-right': 'Front three-quarter RIGHT view:',
      left: 'LEFT side profile:',
      right: 'RIGHT side profile:',
      'back-left': 'BACK three-quarter LEFT view:',
      'back-right': 'BACK three-quarter RIGHT view:',
      back: 'Direct BACK view:',
    };

    for (const [view, expectedText] of Object.entries(expectedFlowDirections)) {
      const flowPrompt = GenerationPromptService.buildGoogleFlowCharacterPrompt(
        context.story,
        mappedFlowCharacter,
        'turnaround',
        { variation: view, isExistingFlowCharacter: true },
      );

      assert.ok(flowPrompt.prompt.includes('image currently selected in this Google Flow editor'), view);
      assert.ok(flowPrompt.prompt.includes(expectedText), view);
      assert.ok(flowPrompt.prompt.length < 1600, `${view} prompt should stay concise`);
      assert.ok(!flowPrompt.prompt.includes('@'), `${view} prompt must not use plain-text @mentions`);
      assert.ok(!flowPrompt.prompt.includes('भोलू'), `${view} prompt must not use the character name as a token`);
      assert.ok(!/character reference sheet|contact sheet|reference sheet/i.test(flowPrompt.prompt), view);\n      assert.ok(flowPrompt.prompt.includes('one image only'), view);\n      assert.ok(flowPrompt.prompt.includes('Show the complete character from head to toe'), view);
    }

    const unlinkedFlowMasterPrompt = GenerationPromptService.buildGoogleFlowCharacterPrompt(
      context.story,
      luna,
      'master_reference',
      { isExistingFlowCharacter: false },
    );
    assert.ok(unlinkedFlowMasterPrompt.prompt.includes('Create one clean canonical full-body character reference'));
    assert.ok(unlinkedFlowMasterPrompt.prompt.includes('Create the character described here:'));
    assert.ok(unlinkedFlowMasterPrompt.prompt.length < 1600);

    // Expression
    const exprPrompt = GenerationPromptService.buildCharacterPrompt(context.story, luna, 'expression', {
      variation: 'surprised and curious',
    });
    assert.ok(exprPrompt.prompt.includes('surprised and curious'));
  });

  const validPngBuffer = Buffer.from([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, // PNG signature
    0x00, 0x00, 0x00, 0x0d, // IHDR chunk length (13 bytes)
    0x49, 0x48, 0x44, 0x52, // "IHDR"
    0x00, 0x00, 0x07, 0x80, // width: 1920
    0x00, 0x00, 0x04, 0x38, // height: 1080
    0x08, 0x06, 0x00, 0x00, 0x00, // bit depth, color type, compression, filter, interlace
    0x5d, 0xb7, 0x54, 0xef, // CRC
  ]);

  test('4. GenerationOrchestratorService: Direct scene background generation updates Scene and Image records', async () => {
    // Verify that without API key or mock, it rejects with descriptive error (Finding-002: no fake placeholders)
    if (!process.env.GEMINI_API_KEY) {
      await assert.rejects(
        async () => {
          await GenerationOrchestratorService.generateSceneBackground({
            storyId: testStoryId,
            sceneId: scene2Id,
            provider: 'gemini_api',
          });
        },
        /GEMINI_API_KEY is not configured/
      );
    }

    const res = await GenerationOrchestratorService.generateSceneBackground({
      storyId: testStoryId,
      sceneId: scene2Id,
      provider: 'gemini_api',
      testMockBuffer: validPngBuffer,
    });

    assert.strictEqual(res.success, true);
    assert.strictEqual(res.target, 'scene_background');
    assert.ok(res.imageUrl && res.imageUrl.length > 0);

    // Verify Scene record was updated in PostgreSQL
    const updatedScene = await prisma.scene.findUnique({ where: { sceneId: scene2Id } });
    assert.ok(updatedScene);
    assert.strictEqual(updatedScene.imageUrl, res.imageUrl);

    const animData = updatedScene.animationData as any;
    assert.ok(animData?.background);
    assert.strictEqual(animData.background.imageUrl, res.imageUrl);
    assert.strictEqual(animData.background.removed, false);

    // Verify Image record was created in database
    const images = await prisma.image.findMany({ where: { sceneId: scene2Id } });
    assert.ok(images.length > 0);
    assert.strictEqual(images[0].imageUrl, res.imageUrl);
  });

  test('5. GenerationOrchestratorService: Direct character master reference generation updates Character record', async () => {
    const res = await GenerationOrchestratorService.generateCharacterAsset({
      storyId: testStoryId,
      characterId: char2Id,
      provider: 'gemini_api',
      assetType: 'master_reference',
      testMockBuffer: validPngBuffer,
    });

    assert.strictEqual(res.success, true);
    assert.ok(res.imageUrl && res.imageUrl.length > 0);

    // Verify Character record was updated with master reference
    const updatedChar = await prisma.character.findUnique({ where: { id: char2Id } });
    assert.ok(updatedChar);
    assert.strictEqual(updatedChar.referenceImageUrl, res.imageUrl);
  });

  test('5b. A front directional view is saved separately and never replaces the master reference', async () => {
    const before = await prisma.character.findUnique({ where: { id: char2Id } });
    assert.ok(before?.referenceImageUrl);
    const masterReferenceBefore = before.referenceImageUrl;

    const result = await GenerationOrchestratorService.generateCharacterAsset({
      storyId: testStoryId,
      characterId: char2Id,
      provider: 'gemini_api',
      assetType: 'turnaround',
      variation: 'front',
      testMockBuffer: validPngBuffer,
    });

    assert.strictEqual(result.success, true);
    assert.strictEqual(result.target, 'character_view');
    assert.ok(result.imageUrl);

    const after = await prisma.character.findUnique({ where: { id: char2Id } });
    assert.ok(after);
    assert.strictEqual(after.referenceImageUrl, masterReferenceBefore);

    const canonical = after.canonicalAppearance as any;
    assert.strictEqual(canonical.references.directionalViews.front, result.imageUrl);
    assert.ok(
      canonical.assets.some(
        (asset: any) =>
          asset.url === result.imageUrl &&
          asset.direction === 'front' &&
          asset.assetType === 'turnaround' &&
          asset.isMasterReference === false,
      ),
    );
  });

  test('6. GenerationOrchestratorService: Batch missing generation executes across remaining targets', async () => {
    // Scene 3 is still missing a background
    const batchBg = await GenerationOrchestratorService.generateAllMissingBackgrounds(
      testStoryId,
      'gemini_api',
      { testMockBuffer: validPngBuffer }
    );
    assert.strictEqual(batchBg.total, 1);
    assert.strictEqual(batchBg.generated, 1);
    assert.strictEqual(batchBg.failed, 0);

    const updatedScene3 = await prisma.scene.findUnique({ where: { sceneId: scene3Id } });
    assert.ok(updatedScene3?.imageUrl);

    // After batch generation, verify 100% background readiness in StoryContextService
    const refreshedContext = await StoryContextService.resolveStoryContext(testStoryId);
    assert.strictEqual(refreshedContext.summary.scenesWithBackground, 3);
    assert.strictEqual(refreshedContext.summary.missingBackgroundCount, 0);
  });
});
