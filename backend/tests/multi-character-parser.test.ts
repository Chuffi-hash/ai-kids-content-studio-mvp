import test from 'node:test';
import assert from 'node:assert';
import {
  IntelligentScriptParser,
  normalizeAnimationAction,
} from '../src/services/story-generation/parser/intelligent-script-parser.js';
import { PromptSynthesizer } from '../src/services/story-generation/parser/prompt-synthesizer.js';
import { StoryImporterService } from '../src/services/story-generation/story-importer.service.js';

test('1. Multi-Character Script - Krishna and Radha (Zero Earth Fabrication)', async () => {
  const script = `# Title: Krishna and Radha in Vrindavan
Language: Hindi
Target Duration: 40s

**Scene 1: Yamuna River Bank**
Visual: Vibrant green riverbank along Yamuna with blooming lotus flowers and morning mist.
Narration: सुबह की ठंडी हवा में यमुना का किनारा बहुत सुंदर लग रहा है।
Krishna (smiling): राधा, देखो मोर कैसे नाच रहे हैं!
Krishna Character Action: Point towards the dancing peacocks
Radha (joyful): कान्हा, तुम्हारी बांसुरी की धुन सुनकर ही तो सब झूम रहे हैं।
Radha Character Action: Wave happily to the forest birds
Effects: moving_clouds

**Scene 2: Under the Kadamba Tree**
Visual: Sacred Kadamba tree shade with soft sunlight filtering through green leaves.
Narration: दोनों मित्र कदम के पेड़ की छांव में बैठ जाते हैं।
Krishna (calm): आओ राधा, हम सब मिलकर प्रकृति का धन्यवाद करें।
Krishna Character Action: Idle
Radha (peaceful): हाँ, यह वन कितना शांत और पावन है।
Radha Character Action: Idle
Effects: falling_leaves
`;

  const ir = await IntelligentScriptParser.parse(script, {
    title: 'Krishna and Radha in Vrindavan',
    language: 'Hindi',
    targetDurationSeconds: 40,
  });

  // Verify Characters IR
  assert.strictEqual(ir.scenes.length, 2);
  const charNames = ir.characters.map((c) => c.name);
  assert.ok(charNames.includes('Krishna'), 'Must contain Krishna');
  assert.ok(charNames.includes('Radha'), 'Must contain Radha');
  assert.ok(!charNames.includes('Earth'), 'Must NOT contain Earth');

  // Verify Scene 1
  const s1 = ir.scenes[0];
  assert.strictEqual(s1.dialogue.length, 2);
  assert.strictEqual(s1.dialogue[0].characterName, 'Krishna');
  assert.strictEqual(s1.dialogue[0].text, 'राधा, देखो मोर कैसे नाच रहे हैं!');
  assert.strictEqual(s1.dialogue[1].characterName, 'Radha');
  assert.strictEqual(s1.dialogue[1].text, 'कान्हा, तुम्हारी बांसुरी की धुन सुनकर ही तो सब झूम रहे हैं।');

  // Verify Scene 1 Character Actions
  assert.ok(s1.characterActions.length >= 2, 'Must extract both character actions');
  const krishnaAction1 = s1.characterActions.find((a) => a.characterName === 'Krishna');
  const radhaAction1 = s1.characterActions.find((a) => a.characterName === 'Radha');
  assert.ok(krishnaAction1, 'Krishna action must be present');
  assert.strictEqual(krishnaAction1?.action, 'point');
  assert.ok(radhaAction1, 'Radha action must be present');
  assert.strictEqual(radhaAction1?.action, 'wave');

  // Verify adaptIRToDraftStoryboardResult
  const draft = IntelligentScriptParser.adaptIRToDraftStoryboardResult(ir);
  assert.strictEqual(draft.title, 'Krishna and Radha in Vrindavan');
  assert.strictEqual(draft.characters.length, 2);
  assert.ok(!draft.characters.some((c) => c.name.toLowerCase().includes('earth')));

  const draftS1 = draft.scenes[0];
  assert.strictEqual(draftS1.dialogue[0].characterName, 'Krishna');
  assert.strictEqual(draftS1.dialogue[1].characterName, 'Radha');
  assert.ok(
    draftS1.characterActions.some(
      (a) => a.characterName === 'Krishna' && a.action === 'point'
    )
  );
  assert.ok(
    draftS1.characterActions.some(
      (a) => a.characterName === 'Radha' && a.action === 'wave'
    )
  );
});

test('2. Pure Narrator-Only Script - Zero Characters, Empty Dialogue & Actions', async () => {
  const script = `# Title: Wonders of the Deep Ocean
Language: Hindi
Target Duration: 30s

**Scene 1: Sunlight Surface Zone**
Visual: Sun-drenched open ocean surface with sparkling waves and crystal turquoise water.
Narration: महासागर की सतह पर सूरज की किरणें पानी को सोने जैसा चमकाती हैं।
Effects: sunshine_rays

**Scene 2: The Twilight Abyss**
Visual: Deep blue twilight zone with bioluminescent jellyfish floating gracefully.
Narration: समुद्र की अतल गहराइयों में जीव अपने प्रकाश से इस संसार को रोशन करते हैं।
Effects: moving_clouds
`;

  const ir = await IntelligentScriptParser.parse(script, {
    title: 'Wonders of the Deep Ocean',
    language: 'Hindi',
    targetDurationSeconds: 30,
  });

  assert.strictEqual(ir.scenes.length, 2);
  // Pure documentary has zero characters
  assert.strictEqual(ir.characters.length, 0, 'Documentary must have zero characters');

  // Verify scenes have empty dialogue and character actions
  for (const sc of ir.scenes) {
    assert.strictEqual(sc.dialogue.length, 0, 'Documentary scenes must have empty dialogue');
    assert.strictEqual(sc.characterActions.length, 0, 'Documentary scenes must have empty characterActions');
    assert.ok(sc.narration.length > 10, 'Narration must be preserved');
  }

  // Verify Draft conversion produces clean empty character lists
  const draft = IntelligentScriptParser.adaptIRToDraftStoryboardResult(ir);
  assert.strictEqual(draft.characters.length, 0, 'Draft characters must be empty array');
  assert.strictEqual(draft.scenes[0].dialogue.length, 0);
  assert.strictEqual(draft.scenes[0].characterActions.length, 0);
  assert.strictEqual(draft.scenes[1].dialogue.length, 0);
  assert.strictEqual(draft.scenes[1].characterActions.length, 0);
});

test('3. Animal/Kid Script - Pip and Sammy (Action Normalization & Synonyms)', async () => {
  const script = `# Title: Pip and Sammy Build a Treehouse
Language: English
Target Duration: 30s

**Scene 1: Building Day**
Visual Prompt: A giant oak tree in sunny woods with wooden planks and rope.
Narration: Pip the bear and Sammy the boy worked together all afternoon.
Pip (excited): Look Sammy, our treehouse ladder is finally sturdy!
Pip Character Action: jumps with immense excitement
Sammy (cheerful): Let us climb up and inspect the top branches!
Sammy Character Action: walking forward along the trail

**Scene 2: High in the Branches**
Visual Prompt: Inside cozy wooden treehouse looking out over forest canopy.
Narration: From high in the leaves, the whole valley looked magnificent.
Pip (happy): We can see the river and all the birds from here!
Pip Character Action: waves both paws at the audience
Sammy (curious): And look at that distant mountain peak!
Sammy Character Action: points upward toward the snowy peak
`;

  const ir = await IntelligentScriptParser.parse(script, {
    title: 'Pip and Sammy Build a Treehouse',
    language: 'English',
    targetDurationSeconds: 30,
  });

  assert.strictEqual(ir.scenes.length, 2);
  const charNames = ir.characters.map((c) => c.name);
  assert.ok(charNames.includes('Pip'));
  assert.ok(charNames.includes('Sammy'));
  assert.ok(!charNames.includes('Earth'));

  // Scene 1 actions
  const s1 = ir.scenes[0];
  const pipA1 = s1.characterActions.find((a) => a.characterName === 'Pip');
  const sammyA1 = s1.characterActions.find((a) => a.characterName === 'Sammy');
  assert.strictEqual(pipA1?.action, 'jump', 'jumps with excitement -> jump');
  assert.strictEqual(sammyA1?.action, 'walk', 'walking forward -> walk');

  // Scene 2 actions
  const s2 = ir.scenes[1];
  const pipA2 = s2.characterActions.find((a) => a.characterName === 'Pip');
  const sammyA2 = s2.characterActions.find((a) => a.characterName === 'Sammy');
  assert.strictEqual(pipA2?.action, 'wave', 'waves both paws -> wave');
  assert.strictEqual(sammyA2?.action, 'point', 'points upward -> point');
});

test('4. StoryImporterService - parseScriptForDraft Full Canonical Pipeline', async () => {
  const script = `# Title: Maya and the Flying Kite
Language: Hindi
Target Duration: 30s

**Scene 1: Windy Hilltop**
Visual: Grassy green hilltop under wide blue sky with gusty breeze.
Narration: माया अपनी रंग-बिरंगी पतंग लेकर पहाड़ी पर पहुंची।
Maya (cheerful): आज हवा बहुत तेज़ है, पतंग आसमान छू लेगी!
Maya Character Action: Point towards the clouds
`;

  const draft = StoryImporterService.parseScriptForDraft(script, {
    language: 'Hindi',
    targetDuration: 30,
  });

  assert.strictEqual(draft.title, 'Maya and the Flying Kite');
  assert.strictEqual(draft.scenes.length, 1);
  assert.strictEqual(draft.characters.length, 1);
  assert.strictEqual(draft.characters[0].name, 'Maya');
  assert.ok(!draft.characters.some((c) => c.name.toLowerCase().includes('earth')));

  const scene = draft.scenes[0];
  assert.strictEqual(scene.dialogue.length, 1);
  assert.strictEqual(scene.dialogue[0].characterName, 'Maya');
  assert.strictEqual(scene.dialogue[0].text, 'आज हवा बहुत तेज़ है, पतंग आसमान छू लेगी!');

  assert.strictEqual(scene.characterActions.length, 1);
  assert.strictEqual(scene.characterActions[0].characterName, 'Maya');
  assert.strictEqual(scene.characterActions[0].action, 'point');
});

test('5. Unsupported Action Normalization Emits Warning and Falls Back to Idle', async () => {
  const script = `# Title: Sparky the Robot
Language: English
Target Duration: 20s

**Scene 1: Laboratory**
Visual: High tech workshop with computers and glowing screens.
Narration: Sparky prepared to reboot its main operating systems.
Sparky (calm): Diagnostic sequence initiated.
Sparky Character Action: somersaults backflip into the air
`;

  const ir = await IntelligentScriptParser.parse(script, {
    title: 'Sparky the Robot',
    language: 'English',
    targetDurationSeconds: 20,
  });

  const s1 = ir.scenes[0];
  const sparkyAction = s1.characterActions.find((a) => a.characterName === 'Sparky');
  assert.strictEqual(sparkyAction?.action, 'idle', 'Unsupported somersault backflip must fall back to idle');

  // Verify warning was emitted
  const actionWarning = ir.warnings.find((w) => w.code === 'UNSUPPORTED_ACTION');
  assert.ok(actionWarning, 'Must emit UNSUPPORTED_ACTION warning');
  assert.ok(actionWarning?.message.includes('somersaults backflip'));
});

test('6. PromptSynthesizer - Blends Look DNA into Explicit User Prompt without Duplicates', () => {
  // Case A: User provides explicit scene prompt without style
  const explicit = 'A vibrant Indian village fair with wooden toy stalls, cotton candy carts, and spinning Ferris wheel under evening skies';
  const synthesized = PromptSynthesizer.synthesizeBackgroundPrompt({
    explicitPrompt: explicit,
    sceneTitle: 'Village Fair',
    locationName: 'Village Ground',
    timeOfDay: 'GOLDEN_HOUR',
  });

  assert.ok(synthesized.startsWith(explicit), 'Must preserve user explicit description');
  assert.ok(synthesized.includes('Cinematic 3D storybook animation'), 'Must weave in 3D storybook art style');
  assert.ok(synthesized.includes('Vertical 9:16 composition'), 'Must include 9:16 framing');
  assert.ok(synthesized.includes('Environment only'), 'Must enforce environment only negative constraint');
  assert.ok(synthesized.includes('No characters, people, figures'), 'Must enforce no characters negative constraint');

  // Case B: User prompt already specifies Pixar style and environment only
  const explicitWithStyle = 'Pixar style 3D animation of a quiet river bank with lotus flowers. Environment only. No characters.';
  const synthesized2 = PromptSynthesizer.synthesizeBackgroundPrompt({
    explicitPrompt: explicitWithStyle,
    sceneTitle: 'Lotus Pond',
  });

  // Verify no duplicate "Pixar" or double negative constraints
  const pixarMatches = (synthesized2.match(/Pixar/gi) || []).length;
  assert.strictEqual(pixarMatches, 1, 'Must not duplicate Pixar style instruction');
  const envMatches = (synthesized2.match(/Environment only/gi) || []).length;
  assert.strictEqual(envMatches, 1, 'Must not duplicate Environment only constraint');
});

test('7. Unicode-Aware Devanagari Hindi Action Matching & Normalization', () => {
  // Walk & Run synonyms
  assert.strictEqual(normalizeAnimationAction('चलता है').action, 'walk');
  assert.strictEqual(normalizeAnimationAction('चलती है').action, 'walk');
  assert.strictEqual(normalizeAnimationAction('चलते हैं').action, 'walk');
  assert.strictEqual(normalizeAnimationAction('दौड़ता है').action, 'walk');
  assert.strictEqual(normalizeAnimationAction('भागता है').action, 'walk');

  // Wave synonyms
  assert.strictEqual(normalizeAnimationAction('हाथ हिलाता है').action, 'wave');
  assert.strictEqual(normalizeAnimationAction('हाथ हिलाती है').action, 'wave');
  assert.strictEqual(normalizeAnimationAction('हाथ हिला').action, 'wave');

  // Jump synonyms
  assert.strictEqual(normalizeAnimationAction('कूदता है').action, 'jump');
  assert.strictEqual(normalizeAnimationAction('कूदती है').action, 'jump');
  assert.strictEqual(normalizeAnimationAction('उछलता है').action, 'jump');

  // Point synonyms
  assert.strictEqual(normalizeAnimationAction('इशारा करता है').action, 'point');
  assert.strictEqual(normalizeAnimationAction('इशारा करती है').action, 'point');
  assert.strictEqual(normalizeAnimationAction('दिखाता है').action, 'point');

  // Idle synonyms
  assert.strictEqual(normalizeAnimationAction('खड़ा है').action, 'idle');
  assert.strictEqual(normalizeAnimationAction('बैठा है').action, 'idle');
  assert.strictEqual(normalizeAnimationAction('मुस्कुराता है').action, 'idle');
  assert.strictEqual(normalizeAnimationAction('चारों ओर देखता है').action, 'idle');

  // Unsupported action fallback to idle + warning
  const unsupported = normalizeAnimationAction('कांपता है');
  assert.strictEqual(unsupported.action, 'idle');
  assert.ok(unsupported.warning);
  assert.strictEqual(unsupported.warning?.code, 'UNSUPPORTED_ACTION');
});

test('8. Duration Standardization (targetDurationSeconds, desiredDurationSeconds, targetDuration)', async () => {
  const script = `# Title: Quick Test
Language: English

**Scene 1: Forest Path (25s)**
Visual Prompt: Beautiful sunny woodland path.
Narration: Walking along the path.
`;

  // Explicit scene duration (25s) overrides story target
  const ir = await IntelligentScriptParser.parse(script, {
    targetDurationSeconds: 45,
  });
  assert.strictEqual(ir.targetDurationSeconds, 45, 'Story target duration should be 45');
  assert.strictEqual(ir.scenes[0].durationSeconds, 25, 'Explicit scene duration (25s) must be respected');
  assert.strictEqual(ir.scenes[0].durationConfidence, 'explicit');

  // Test desiredDurationSeconds alias in parseScriptForDraft
  const draftResult = StoryImporterService.parseScriptForDraft(script, {
    desiredDurationSeconds: 90,
  });
  assert.strictEqual(draftResult.targetDurationSeconds, 90, 'Draft should recognize desiredDurationSeconds');
});

test('9. Existing Characters Pass-Through - Preserves Canonical IDs & Species', async () => {
  const script = `# Title: Krishna in Gokul
Language: Hindi

**Scene 1: Gokul Meadow**
Visual: Sunny pasture with cows.
Krishna (cheerful): मैया मोरी मैं नहीं माखन खायो।
Krishna Character Action: खड़ा है
`;

  const existingCharacters = [
    { id: 'char_krishna_canonical_123', name: 'Krishna', species: 'human' },
  ];

  const ir = await IntelligentScriptParser.parse(script, {
    existingCharacters,
  });

  assert.strictEqual(ir.characters.length, 1);
  const krishna = ir.characters[0];
  assert.strictEqual(krishna.name, 'Krishna');
  assert.strictEqual(krishna.id, 'char_krishna_canonical_123', 'Must preserve canonical character id');
  assert.strictEqual(krishna.species, 'human', 'Must preserve canonical character species');
});

test('10. Multi-Character Dialogue Speaker Resolution - No Earth Fallback', async () => {
  const script = `# Title: Two Friends
Language: Hindi

**Scene 1: Courtyard**
Visual: Ancient courtyard.
Aman: नमस्ते दोस्तों!
Rohan: नमस्ते अमन!
`;

  const draft = StoryImporterService.parseScriptForDraft(script);
  assert.strictEqual(draft.characters.length, 2);
  const charNames = draft.characters.map((c) => c.name);
  assert.ok(charNames.includes('Aman'));
  assert.ok(charNames.includes('Rohan'));
  assert.ok(!charNames.includes('Earth'));

  const s1 = draft.scenes[0];
  assert.strictEqual(s1.dialogue.length, 2);
  assert.strictEqual(s1.dialogue[0].characterName, 'Aman');
  assert.strictEqual(s1.dialogue[1].characterName, 'Rohan');
});


