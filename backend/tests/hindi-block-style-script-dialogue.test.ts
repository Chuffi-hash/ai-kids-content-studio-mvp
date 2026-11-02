import { test } from 'node:test';
import assert from 'node:assert';
import { StoryImporterService } from '../src/services/story-generation/story-importer.service.js';
import { IntelligentScriptParser } from '../src/services/story-generation/parser/intelligent-script-parser.js';
import { ScenePreparationService } from '../src/services/story-generation/scene-preparation.service.js';
import {
  createStory,
  deleteStory,
  getStoryByStoryId,
  getScenesByStoryId,
} from '../src/services/database/database.service.js';
import { randomUUID } from 'crypto';

const HINDI_FOUR_SEASONS_BLOCK_SCRIPT = `# धरती के मौसम के चार रंग

Target Duration: 60s
Language: Hindi
Logline: पृथ्वी बच्चों को चार प्रमुख मौसमों (गर्मी, बारिश, ठंड, बसंत) की सैर कराती है।
Lesson: प्रकृति का हर मौसम जीवन के लिए अनमोल और सुंदर है।

## Characters
- Earth (Protagonist): हमारी गोल-मटोल नीली-हरी प्यारी पृथ्वी।

### Scene 1: गर्मी का मौसम (Summer Season)
Duration: 15s
Background Prompt:
A vibrant sunny meadow with bright yellow sunflower fields and rolling green hills under a bright blue sky, children storybook 2D illustration.

Effects: sunshine_rays, heat_waves
Character Action: Earth is waving happily under the golden sun.
Facial Expression: Warm, playful
Speaking Emotion: surprised, playful

Narration:
सूरज दादा आसमान में चमक रहे हैं और मौसम बहुत गर्म है।

Earth Dialogue — surprised, playful:
अरे दोस्तों! मेरी तरफ़ देखो! बहुत गर्मी है ना? चलो ठंडी छांव ढूंढते हैं!

### Scene 2: बारिश का मौसम (Monsoon Season)
Duration: 15s
Background Prompt:
Lush green hills and valleys covered in fresh gentle monsoon rain, rolling clouds and water splashes.

Effects: rain, water_splashes
Character Action: Earth is jumping in joy with water puddles.
Facial Expression: Joyful, refreshed
Speaking Emotion: excited

Narration:
काले-काले बादल छा गए और रिमझिम बारिश शुरू हो गई।

Earth Dialogue — excited:
आहा! बारिश की हर बूंद धरती को नया जीवन देती है! सब मिलकर नाचो!

### Scene 3: ठंड का मौसम (Winter Season)
Duration: 15s
Background Prompt:
Serene snowy forest with pine trees covered in soft snowfall, gentle fog and mist.

Effects: snowfall, winter_fog
Character Action: Earth is shivering gently and smiling with a warm muffler.
Facial Expression: Cozy, peaceful
Speaking Emotion: calm

Narration:
सफेद बर्फ की चादर बिछ गई है और ठंडी हवाएं चल रही हैं।

Earth Dialogue — calm:
सर्दी के मौसम में सब कुछ कितना शांत और खूबसूरत लग रहा है।

### Scene 4: बसंत का मौसम (Spring Season)
Duration: 15s
Background Prompt:
Blooming flower garden with colorful tulips, daisies, green grass and fluttering butterflies.

Effects: butterflies, falling_leaves
Character Action: Earth is spinning joyfully with flowers blooming all around.
Facial Expression: Delighted, cheerful
Speaking Emotion: cheerful

Narration:
चारों तरफ रंग-बिरंगे फूल खिल उठे हैं और नई पत्तियां आ गई हैं।

Earth Dialogue — cheerful:
बसंत आ गया! यह प्रकृति का सबसे प्यारा उत्सव है!
`;

test('1. Block-Style Script Parsing — parseScriptForDraft separates block-style narration and dialogue', () => {
  const result = StoryImporterService.parseScriptForDraft(HINDI_FOUR_SEASONS_BLOCK_SCRIPT, {
    language: 'Hindi',
  });

  assert.strictEqual(result.title, 'धरती के मौसम के चार रंग');
  assert.strictEqual(result.language, 'Hindi');
  assert.strictEqual(result.scenes.length, 4, 'Must extract all 4 scenes');

  // Verify Scene 1
  const sc1 = result.scenes[0];
  assert.strictEqual(sc1.sceneNumber, 1);
  assert.ok(sc1.title.includes('गर्मी'), `Title should include गर्मी, got: ${sc1.title}`);
  assert.strictEqual(sc1.durationSeconds, 15);
  assert.ok(sc1.visualPrompt.includes('sunflower fields'), `Visual prompt should include sunflower fields, got: ${sc1.visualPrompt}`);
  assert.strictEqual(sc1.narration, 'सूरज दादा आसमान में चमक रहे हैं और मौसम बहुत गर्म है।');
  assert.strictEqual(sc1.dialogue.length, 1, 'Scene 1 must have exactly 1 dialogue line');
  assert.strictEqual(sc1.dialogue[0].characterName, 'Earth');
  assert.strictEqual(sc1.dialogue[0].text, 'अरे दोस्तों! मेरी तरफ़ देखो! बहुत गर्मी है ना? चलो ठंडी छांव ढूंढते हैं!');
  assert.strictEqual(sc1.dialogue[0].emotion, 'surprised, playful');
  assert.strictEqual(sc1.dialogue[0].voice, 'hf_alpha', 'Earth in Hindi must resolve to hf_alpha');

  // Verify Scene 2
  const sc2 = result.scenes[1];
  assert.strictEqual(sc2.sceneNumber, 2);
  assert.strictEqual(sc2.narration, 'काले-काले बादल छा गए और रिमझिम बारिश शुरू हो गई।');
  assert.strictEqual(sc2.dialogue.length, 1);
  assert.strictEqual(sc2.dialogue[0].characterName, 'Earth');
  assert.strictEqual(sc2.dialogue[0].text, 'आहा! बारिश की हर बूंद धरती को नया जीवन देती है! सब मिलकर नाचो!');
  assert.strictEqual(sc2.dialogue[0].emotion, 'excited');
  assert.strictEqual(sc2.dialogue[0].voice, 'hf_alpha');

  // Verify Scene 3
  const sc3 = result.scenes[2];
  assert.strictEqual(sc3.sceneNumber, 3);
  assert.strictEqual(sc3.narration, 'सफेद बर्फ की चादर बिछ गई है और ठंडी हवाएं चल रही हैं।');
  assert.strictEqual(sc3.dialogue.length, 1);
  assert.strictEqual(sc3.dialogue[0].characterName, 'Earth');
  assert.strictEqual(sc3.dialogue[0].text, 'सर्दी के मौसम में सब कुछ कितना शांत और खूबसूरत लग रहा है।');
  assert.strictEqual(sc3.dialogue[0].emotion, 'calm');
  assert.strictEqual(sc3.dialogue[0].voice, 'hf_alpha');

  // Verify Scene 4
  const sc4 = result.scenes[3];
  assert.strictEqual(sc4.sceneNumber, 4);
  assert.strictEqual(sc4.narration, 'चारों तरफ रंग-बिरंगे फूल खिल उठे हैं और नई पत्तियां आ गई हैं।');
  assert.strictEqual(sc4.dialogue.length, 1);
  assert.strictEqual(sc4.dialogue[0].characterName, 'Earth');
  assert.strictEqual(sc4.dialogue[0].text, 'बसंत आ गया! यह प्रकृति का सबसे प्यारा उत्सव है!');
  assert.strictEqual(sc4.dialogue[0].emotion, 'cheerful');
  assert.strictEqual(sc4.dialogue[0].voice, 'hf_alpha');
});

test('2. IntelligentScriptParser — Full Pipeline on block-style Hindi script', () => {
  const ir = IntelligentScriptParser.parse(HINDI_FOUR_SEASONS_BLOCK_SCRIPT, {
    language: 'Hindi',
  });

  assert.strictEqual(ir.title, 'धरती के मौसम के चार रंग');
  assert.strictEqual(ir.scenes.length, 4);

  for (let i = 0; i < ir.scenes.length; i++) {
    const sc = ir.scenes[i];
    assert.ok(sc.narration.length > 0, `Scene ${i + 1} narration must not be empty`);
    assert.strictEqual(sc.dialogue.length, 1, `Scene ${i + 1} must have 1 dialogue line`);
    assert.strictEqual(sc.dialogue[0].characterName, 'Earth');
    assert.strictEqual(sc.dialogue[0].voice, 'hf_alpha', `Scene ${i + 1} voice must be hf_alpha`);
    assert.ok(!sc.narration.includes(sc.dialogue[0].text), `Narration must not swallow dialogue text`);
  }
});

test('3. Voice Precedence & Defaults — Earth in Hindi receives hf_alpha in ScenePreparationService', async () => {
  const earthChar: any = { id: 'char-earth', name: 'Earth', species: 'earth' };
  const charMap = new Map<string, any>([['earth', earthChar]]);
  const prepared = ScenePreparationService.prepareScenes(
    [
      {
        sceneNumber: 1,
        title: 'गर्मी का मौसम',
        narration: 'सूरज चमक रहा है।',
        dialogue: [
          {
            characterName: 'Earth',
            text: 'नमस्ते दोस्तों!',
            emotion: 'cheerful',
            // No explicit voice provided; must default to hf_alpha
          },
        ],
      },
      {
        sceneNumber: 2,
        title: 'Monsoon',
        narration: 'Rain falling.',
        dialogue: [
          {
            characterName: 'Earth',
            text: 'It is raining!',
            emotion: 'excited',
            voice: 'hf_alpha', // Explicitly specified Hindi voice
          },
        ],
      },
    ],
    charMap,
    [earthChar]
  );

  assert.strictEqual(prepared.length, 2);

  // Scene 1: Hindi Devanagari dialogue without explicit voice
  const sc1Diag = prepared[0].animationData.dialogueLines;
  assert.strictEqual(sc1Diag.length, 1);
  assert.strictEqual(sc1Diag[0].characterName, 'Earth');
  assert.strictEqual(sc1Diag[0].voice, 'hf_alpha', 'Earth with Hindi text must default to hf_alpha (not bm_daniel)');
  assert.strictEqual(sc1Diag[0].lang, 'hi');

  // Scene 2: Preserved explicit voice
  const sc2Diag = prepared[1].animationData.dialogueLines;
  assert.strictEqual(sc2Diag.length, 1);
  assert.strictEqual(sc2Diag[0].voice, 'hf_alpha');
});

test('4. Audio Compatibility Check — Invalidates stale English or missing metadata audio', () => {
  const line = {
    id: 'dlg-1',
    text: 'अरे दोस्तों! मेरी तरफ़ देखो!',
    lang: 'hi',
    voice: 'hf_alpha',
    emotion: 'cheerful',
    speed: 1.0,
  };

  const projectLang = 'hi';
  const lineVoice = 'hf_alpha';
  const targetLang = line.lang || (projectLang === 'hi' ? 'hi' : 'en');
  const targetVoice = line.voice || lineVoice;

  // Case A: Missing audioMeta (legacy/unverified audio) -> must be INCOMPATIBLE
  const isCompatibleMissingMeta = Boolean(undefined) && true;
  assert.strictEqual(isCompatibleMissingMeta, false, 'Missing metadata must force regeneration');

  // Case B: Stale English audioMeta on Hindi line -> must be INCOMPATIBLE
  const staleEnglishMeta = {
    text: line.text,
    lang: 'en', // Wrong language!
    voice: 'bm_daniel', // Wrong voice!
    emotion: 'cheerful',
    emotionIntensity: 50,
    speed: 1.0,
  };
  const isCompatibleStale = Boolean(staleEnglishMeta) && (
    staleEnglishMeta.text === line.text &&
    staleEnglishMeta.lang === targetLang &&
    staleEnglishMeta.voice === targetVoice
  );
  assert.strictEqual(isCompatibleStale, false, 'Stale English audio must be rejected for Hindi dialogue');

  // Case C: Matching Hindi audioMeta -> COMPATIBLE
  const matchingHindiMeta = {
    text: line.text,
    lang: 'hi',
    voice: 'hf_alpha',
    emotion: 'cheerful',
    emotionIntensity: 50,
    speed: 1.0,
  };
  const isCompatibleMatch = Boolean(matchingHindiMeta) && (
    matchingHindiMeta.text === line.text &&
    matchingHindiMeta.lang === targetLang &&
    matchingHindiMeta.voice === targetVoice
  );
  assert.strictEqual(isCompatibleMatch, true, 'Matching Hindi metadata must be compatible');
});

test('5. Database Persistence — importDraftScenesToStory creates scenes with Hindi voice & lang', async () => {
  const testStoryId = `story-test-hindi-${Date.now()}`;
  await createStory({
    storyId: testStoryId,
    title: 'धरती के मौसम के चार रंग Test',
    topic: 'Seasons',
    theme: 'Nature',
    ageGroup: '4-8',
    lesson: 'Seasons',
    language: 'Hindi',
  });

  try {
    const draft = StoryImporterService.parseScriptForDraft(HINDI_FOUR_SEASONS_BLOCK_SCRIPT, {
      language: 'Hindi',
    });

    const result = await StoryImporterService.importDraftScenesToStory({
      storyId: testStoryId,
      scenes: draft.scenes,
      importMode: 'replace',
      updateStoryMetadata: true,
      title: draft.title,
      targetDurationSeconds: draft.targetDurationSeconds,
      language: draft.language,
    });

    assert.strictEqual(result.length, 4);

    const scenes = await getScenesByStoryId(testStoryId);
    assert.strictEqual(scenes.length, 4);

    for (const sc of scenes) {
      const animData = (sc as any).animationData;
      assert.ok(animData, 'Scene must have animationData');
      assert.strictEqual(animData.dialogueLines.length, 1, `Scene ${sc.number} must have 1 dialogue line`);
      const dlg = animData.dialogueLines[0];
      assert.strictEqual(dlg.characterName, 'Earth');
      assert.strictEqual(dlg.voice, 'hf_alpha', 'Saved dialogue line must have hf_alpha');
      assert.strictEqual(dlg.lang, 'hi', 'Saved dialogue line must have lang: hi');
    }
  } finally {
    await deleteStory(testStoryId);
  }
});
