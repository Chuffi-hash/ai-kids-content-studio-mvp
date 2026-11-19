import { describe, test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { IntelligentScriptParser } from '../src/services/story-generation/parser/intelligent-script-parser.js';
import { StoryImporterService } from '../src/services/story-generation/story-importer.service.js';
import { prisma } from '../src/services/database/database.service.js';
import { randomUUID } from 'crypto';

describe('Script Parser False Character Rejection & Scene Cast Isolation Suite', () => {
  const TEST_STORY_ID = `test-story-parser-regression-${Date.now()}`;

  before(async () => {
    // Ensure test story exists in database
    await (prisma as any).story.create({
      data: {
        storyId: TEST_STORY_ID,
        title: 'Regression Test Story',
        logline: 'Testing script parser character isolation and metadata rejection.',
        lesson: 'Kindness and accuracy matter in every story.',
        audience: 'kids',
      },
    });
  });

  after(async () => {
    // Cleanup test data
    try {
      const scenes = await (prisma as any).scene.findMany({
        where: { storyId: TEST_STORY_ID },
        select: { sceneId: true },
      });
      const sceneIds = scenes.map((s: any) => s.sceneId);
      if (sceneIds.length > 0) {
        await (prisma as any).image.deleteMany({ where: { sceneId: { in: sceneIds } } });
        await (prisma as any).scene.deleteMany({ where: { storyId: TEST_STORY_ID } });
      }
      await (prisma as any).storyCharacter.deleteMany({ where: { storyId: TEST_STORY_ID } });
      await (prisma as any).story.deleteMany({ where: { storyId: TEST_STORY_ID } });
    } catch (err) {
      console.warn('Cleanup notice:', err);
    }
  });

  test('1. Metadata labels (End Screen Text, Character Consistency, Camera Direction, etc.) never become characters', () => {
    const scriptWithMetadata = `
# Title: The Forest Adventure
Target Duration: 60s
Language: English

## Characters
- Pip (Protagonist): A cheerful little fox.
- Barnaby (Sidekick): A wise old owl.

## Scene 1: The Sunny Clearing (15s)
Visual: A vibrant sunny meadow in the heart of an ancient forest.
Camera Direction: Slow push in on the hollow oak tree.
Narration: Deep in the forest, Pip was looking for acorns.
Pip: Look Barnaby, the golden oak is glowing! (Emotion: excited)
Pip Character Action: points toward the tree
Effects: sunshine_rays, floating_dust
Character Consistency: Pip always wears a red bandana and Barnaby wears small spectacles.
End Screen Text: Thanks for watching! Subscribe for more forest stories.

## Scene 2: The Whispering Stream (15s)
Visual: A sparkling stream winding through smooth mossy pebbles.
Characters Present: Barnaby
Narration: Barnaby landed softly on a mossy branch above the water.
Barnaby: The water remembers every story, young fox. (Emotion: wise)
Barnaby Action: looks around peacefully
Effects: water_splashes
Sound Effects: water_stream, breeze
Visual Style: 3D Storybook Animation with warm volumetric lighting
`;

    const ir = IntelligentScriptParser.parse(scriptWithMetadata);

    assert.ok(ir, 'IR should be generated');
    assert.strictEqual(ir.scenes.length, 2, 'Should parse 2 scenes');

    // Extract all character names from IR
    const characterNames = ir.characters.map((c) => c.name);

    // Verify Pip and Barnaby ARE characters
    assert.ok(characterNames.includes('Pip'), 'Pip should be in character roster');
    assert.ok(characterNames.includes('Barnaby'), 'Barnaby should be in character roster');

    // Verify NONE of the metadata labels are in character roster
    const forbiddenLabels = [
      'End Screen Text',
      'Character Consistency',
      'Camera Direction',
      'Visual Style',
      'Sound Effects',
      'Effects',
      'Narration',
      'Visual',
      'Characters Present',
      'Narrator',
    ];

    for (const label of forbiddenLabels) {
      assert.strictEqual(
        characterNames.some((c) => c.toLowerCase() === label.toLowerCase()),
        false,
        `Metadata label "${label}" must NEVER be parsed as a character!`
      );
    }

    // Verify global continuity and end screen metadata were captured properly
    assert.ok(ir.endScreen?.text?.includes('Thanks for watching'), 'End screen text should be captured in IR');
    assert.ok(
      ir.globalContinuity?.['character_consistency']?.includes('bandana') ||
        ir.globalContinuity?.['visual_style']?.includes('Storybook'),
      'Global continuity should be captured in IR'
    );
  });

  test('2. Scene character isolation: Scene 1 cast does not leak into Scene 2 or Scene 3', () => {
    const multiSceneScript = `
# Title: Cast Isolation Test
Language: English

## Characters
- Pip (Protagonist): Fox
- Barnaby (Sidekick): Owl
- Maya (Friend): Girl

## Scene 1: The Meadow
Characters Present: Pip, Barnaby
Narration: Pip and Barnaby met at dawn.
Pip: Good morning, Barnaby!
Barnaby: A fine morning indeed.

## Scene 2: The High Tree
Characters Present: Barnaby
Narration: Barnaby flew up to his perch alone to read.
Barnaby: Now for some quiet study time.

## Scene 3: The Empty Cave
Narration: Inside the cave, only the sound of water dripping could be heard.
Visual: Dark cave stalactites with gentle mist.

## Scene 4: The Village Path
Characters Present: Maya
Narration: Maya was walking to the market with a basket of apples.
Maya: What a lovely day for a walk!
`;

    const ir = IntelligentScriptParser.parse(multiSceneScript);
    assert.strictEqual(ir.scenes.length, 4, 'Should parse 4 scenes');

    // Scene 1: Pip & Barnaby
    const sc1Chars = ir.scenes[0].charactersPresent || [];
    assert.ok(sc1Chars.includes('Pip'), 'Scene 1 should include Pip');
    assert.ok(sc1Chars.includes('Barnaby'), 'Scene 1 should include Barnaby');
    assert.strictEqual(sc1Chars.includes('Maya'), false, 'Scene 1 should NOT include Maya');

    // Scene 2: Barnaby ONLY (Pip MUST NOT leak into Scene 2!)
    const sc2Chars = ir.scenes[1].charactersPresent || [];
    assert.ok(sc2Chars.includes('Barnaby'), 'Scene 2 should include Barnaby');
    assert.strictEqual(sc2Chars.includes('Pip'), false, 'Scene 2 MUST NOT include Pip!');
    assert.strictEqual(sc2Chars.includes('Maya'), false, 'Scene 2 MUST NOT include Maya');

    // Scene 3: Pure narration (NO characters)
    const sc3Chars = ir.scenes[2].charactersPresent || [];
    assert.strictEqual(sc3Chars.length, 0, 'Scene 3 has no characters, should be empty');

    // Scene 4: Maya ONLY
    const sc4Chars = ir.scenes[3].charactersPresent || [];
    assert.ok(sc4Chars.includes('Maya'), 'Scene 4 should include Maya');
    assert.strictEqual(sc4Chars.includes('Pip'), false, 'Scene 4 MUST NOT include Pip');
    assert.strictEqual(sc4Chars.includes('Barnaby'), false, 'Scene 4 MUST NOT include Barnaby');
  });

  test('3. Canonical JSON script format conforms to schema and parses deterministically', () => {
    const canonicalJsonScript = {
      schemaVersion: '1.0',
      story: {
        title: 'The Starlight Journey',
        language: 'Hindi',
        targetDurationSeconds: 45,
        genre: 'Sci-Fi',
        logline: 'Two robotic friends explore the rings of Saturn.',
        lesson: 'Teamwork solves any mechanical challenge.',
        visualStyle: '3D Pixar Animation with neon glow',
      },
      characters: [
        {
          characterKey: 'sparky',
          name: 'Sparky',
          role: 'protagonist',
          species: 'robot',
          description: 'A cheerful blue robot with solar antennas.',
        },
        {
          characterKey: 'bolt',
          name: 'Bolt',
          role: 'sidekick',
          species: 'robot',
          description: 'A small round hovering robot assistant.',
        },
      ],
      scenes: [
        {
          sceneNumber: 1,
          title: 'Saturn Orbit',
          durationSeconds: 15,
          location: 'Orbit around Saturn rings',
          charactersPresent: ['sparky', 'bolt'],
          narration: 'अंतरिक्ष में स्पार्की और बोल्ट अपने यान से बाहर निकले।',
          dialogue: [
            {
              speakerKey: 'sparky',
              text: 'देखो बोल्ट! शनि के छल्ले कितने सुंदर चमक रहे हैं!',
              emotion: 'excited',
            },
            {
              speakerKey: 'bolt',
              text: 'बीप-बूप! सभी सेंसर सामान्य हैं।',
              emotion: 'happy',
            },
          ],
          characterActions: [
            {
              characterKey: 'sparky',
              action: 'wave',
              description: 'waves at the glittering ice crystals',
            },
          ],
          background: {
            prompt: 'Saturn magnificent rings viewed from orbit, glowing starlight and cosmic dust',
            style: '3D Pixar Animation',
          },
        },
        {
          sceneNumber: 2,
          title: 'The Ice Asteroid',
          durationSeconds: 15,
          location: 'Surface of a sparkling ice asteroid',
          charactersPresent: ['sparky'],
          narration: 'स्पार्की एक बर्फीले उल्कापिंड पर उतरा।',
          dialogue: [
            {
              speakerKey: 'sparky',
              text: 'यहाँ की बर्फ तो कांच जैसी चमकती है!',
              emotion: 'amazed',
            },
          ],
          characterActions: [
            {
              characterKey: 'sparky',
              action: 'walk',
              description: 'walks carefully on the icy surface',
            },
          ],
          background: 'Sparkling crystalline ice asteroid surface with distant stars and Saturn in sky',
        },
      ],
      globalContinuity: {
        characterConsistency: 'Sparky always has a blue metallic chassis and Bolt hovers with golden thrusters.',
      },
      endScreen: {
        text: 'अगले अंतरिक्ष रोमांच के लिए सब्सक्राइब करें!',
      },
    };

    const ir = IntelligentScriptParser.parse(JSON.stringify(canonicalJsonScript));

    assert.strictEqual(ir.title, 'The Starlight Journey');
    assert.strictEqual(ir.genre, 'Sci-Fi');
    assert.strictEqual(ir.language, 'Hindi');
    assert.strictEqual(ir.scenes.length, 2);

    // Character mapping
    assert.strictEqual(ir.characters.length, 2);
    assert.strictEqual(ir.characters[0].name, 'Sparky');
    assert.strictEqual(ir.characters[1].name, 'Bolt');

    // Scene 1 characters
    assert.deepStrictEqual(ir.scenes[0].charactersPresent, ['Sparky', 'Bolt']);
    assert.strictEqual(ir.scenes[0].dialogue.length, 2);
    assert.strictEqual(ir.scenes[0].dialogue[0].characterName, 'Sparky');
    assert.strictEqual(ir.scenes[0].dialogue[1].characterName, 'Bolt');

    // Scene 2 characters (isolated to Sparky only!)
    assert.deepStrictEqual(ir.scenes[1].charactersPresent, ['Sparky']);
    assert.strictEqual(ir.scenes[1].dialogue[0].characterName, 'Sparky');

    // Metadata
    assert.strictEqual(ir.endScreen?.text, 'अगले अंतरिक्ष रोमांच के लिए सब्सक्राइब करें!');
  });

  test('4. Database import: StoryImporterService creates exact scenes without false characters or leaking cast', async () => {
    const rawScript = `
# Title: DB Persistence Regression Story
Language: English

## Characters
- Pip: The little fox
- Barnaby: The owl

## Scene 1: Arrival
Characters Present: Pip, Barnaby
Pip: We made it to the river!
Barnaby: Indeed we did.

## Scene 2: River Crossing
Characters Present: Barnaby
Barnaby: I can fly across easily.

End Screen Text: Join our club!
Character Consistency: Fox red, owl brown.
`;

    const draft = StoryImporterService.parseScriptForDraft(rawScript, {
      title: 'DB Persistence Regression Story',
    });

    assert.strictEqual(draft.scenes.length, 2);
    assert.strictEqual(draft.characters.length, 2);

    // Import into database
    const importedScenes = await StoryImporterService.importDraftScenesToStory({
      storyId: TEST_STORY_ID,
      scenes: draft.scenes,
      importMode: 'replace',
    });

    assert.strictEqual(importedScenes.length, 2);

    // Check database records directly
    const dbCharacters = await (prisma as any).storyCharacter.findMany({
      where: { storyId: TEST_STORY_ID },
      include: { character: true },
    });

    const dbCharNames = dbCharacters.map((sc: any) => sc.character.name);
    assert.ok(dbCharNames.includes('Pip'), 'Database must have Pip');
    assert.ok(dbCharNames.includes('Barnaby'), 'Database must have Barnaby');
    assert.strictEqual(
      dbCharNames.some((n: string) => n.toLowerCase().includes('end screen')),
      false,
      'End screen text must never exist in character table!'
    );
    assert.strictEqual(
      dbCharNames.some((n: string) => n.toLowerCase().includes('consistency')),
      false,
      'Character consistency must never exist in character table!'
    );

    // Check Scene 1 vs Scene 2 character instances
    const dbScene1 = await (prisma as any).scene.findFirst({
      where: { storyId: TEST_STORY_ID, number: 1 },
    });
    const dbScene2 = await (prisma as any).scene.findFirst({
      where: { storyId: TEST_STORY_ID, number: 2 },
    });

    const s1Instances = (dbScene1?.animationData as any)?.characterInstances || [];
    const s2Instances = (dbScene2?.animationData as any)?.characterInstances || [];

    assert.strictEqual(s1Instances.length, 2, 'Scene 1 should have 2 character instances (Pip & Barnaby)');
    assert.strictEqual(s2Instances.length, 1, 'Scene 2 should have 1 character instance (Barnaby only)');
    assert.strictEqual(s2Instances[0].name, 'Barnaby', 'Scene 2 instance must be Barnaby');
  });
});
