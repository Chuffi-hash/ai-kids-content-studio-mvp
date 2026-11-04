import test from 'node:test';
import assert from 'node:assert';
import {
  IntelligentScriptParser,
  normalizeAnimationAction,
} from '../src/services/story-generation/parser/intelligent-script-parser.js';
import { PromptSynthesizer } from '../src/services/story-generation/parser/prompt-synthesizer.js';
import {
  StoryImporterService,
  cleanSpeakerName,
} from '../src/services/story-generation/story-importer.service.js';
import { prisma, createStory } from '../src/services/database/database.service.js';

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
 
test('11. P0 — Hindi Location ID Collision Resilience & Unicode NFC Normalization', async () => {
  const loc1 = 'गर्मी का कमाल';
  const loc2 = 'मानसून की मस्ती';
  const loc3 = 'सर्दी का रहस्य';

  const id1 = PromptSynthesizer.generateLocationId(loc1);
  const id2 = PromptSynthesizer.generateLocationId(loc2);
  const id3 = PromptSynthesizer.generateLocationId(loc3);

  // Distinct locations must have distinct IDs (no collision)
  assert.notStrictEqual(id1, id2, 'loc1 and loc2 must produce distinct IDs');
  assert.notStrictEqual(id2, id3, 'loc2 and loc3 must produce distinct IDs');
  assert.notStrictEqual(id1, id3, 'loc1 and loc3 must produce distinct IDs');

  // Same location must produce identical ID deterministically
  assert.strictEqual(PromptSynthesizer.generateLocationId(loc1), id1);

  // Unicode NFD vs NFC must produce identical ID
  const nfdLoc = loc1.normalize('NFD');
  const nfcLoc = loc1.normalize('NFC');
  assert.strictEqual(
    PromptSynthesizer.generateLocationId(nfdLoc),
    PromptSynthesizer.generateLocationId(nfcLoc),
    'NFD and NFC forms must produce identical location IDs'
  );

  // Script with distinct Hindi scene headings creates distinct location IDs
  const script = `# Title: Seasons
**Scene 1: गर्मी का कमाल**
Visual: Sunny field.
**Scene 2: मानसून की मस्ती**
Visual: Rainy clouds.
`;
  const ir = await IntelligentScriptParser.parse(script);
  assert.strictEqual(ir.scenes.length, 2);
  assert.notStrictEqual(
    ir.scenes[0].locationId,
    ir.scenes[1].locationId,
    'Scenes with different Hindi locations must have distinct locationIds'
  );
});

test('12. P0 — Character Identity Resolution Safety (Species != Identity)', async () => {
  // Empty or whitespace returns empty string
  assert.strictEqual(cleanSpeakerName(''), '');
  assert.strictEqual(cleanSpeakerName('   '), '');
  assert.strictEqual(cleanSpeakerName(null as any), '');
  assert.strictEqual(cleanSpeakerName(undefined as any), '');

  // Exact preset names
  assert.strictEqual(cleanSpeakerName('Pip the bear'), 'Pip');
  assert.strictEqual(cleanSpeakerName('Maya the little girl'), 'Maya');
  assert.strictEqual(cleanSpeakerName('Sparky the robot'), 'Sparky');
  assert.strictEqual(cleanSpeakerName('Sammy the boy'), 'Sammy');
  assert.strictEqual(cleanSpeakerName('Earth'), 'Earth');
  assert.strictEqual(cleanSpeakerName('धरती'), 'Earth');
  assert.strictEqual(cleanSpeakerName('पृथ्वी'), 'Earth');

  // Species keywords must NOT hijack other characters into Pip/Maya/Sparky
  assert.strictEqual(cleanSpeakerName('Bruno the bear'), 'Bruno');
  assert.strictEqual(cleanSpeakerName('Barnaby the bear'), 'Barnaby');
  assert.strictEqual(cleanSpeakerName('Mama Bear'), 'Mama Bear');
  assert.strictEqual(cleanSpeakerName('Riya the girl'), 'Riya');
  assert.strictEqual(cleanSpeakerName('Aanya the girl'), 'Aanya');
  assert.strictEqual(cleanSpeakerName('Unit 734 the robot'), 'Unit 734');
  assert.strictEqual(cleanSpeakerName('Rohan the curious boy'), 'Rohan');

  // Hindi and unfamiliar names preserved exactly
  assert.strictEqual(cleanSpeakerName('चिंटू भालू'), 'चिंटू');
  assert.strictEqual(cleanSpeakerName('चिंटू'), 'चिंटू');
  assert.strictEqual(cleanSpeakerName('रोहन'), 'रोहन');
  assert.strictEqual(cleanSpeakerName('दादी माँ'), 'दादी माँ');
  assert.strictEqual(cleanSpeakerName('Professor Owl'), 'Professor Owl');

  // Narrator preserved
  assert.strictEqual(cleanSpeakerName('Narrator'), 'Narrator');
  assert.strictEqual(cleanSpeakerName('सूत्रधार'), 'Narrator');
  assert.strictEqual(cleanSpeakerName('कथावाचक'), 'Narrator');
});

test('13. P0 — Hindi Action Table Exhaustive Normalization', async () => {
  const table: Record<string, string> = {
    'हाथ हिलाता है': 'wave',
    'हाथ हिलाती है': 'wave',
    'हाथ हिलाकर स्वागत करता है': 'wave',
    'आगे चलता है': 'walk',
    'आगे बढ़ता है': 'walk',
    'धीरे-धीरे आगे बढ़ती है': 'walk',
    'ऊपर कूदता है': 'jump',
    'उछलता है': 'jump',
    'खुशी से ऊपर कूदती है': 'jump',
    'इशारा करता है': 'point',
    'उंगली से इशारा करती है': 'point',
    'मुस्कुराता है': 'idle',
    'हंसती है': 'idle',
    'चारों ओर देखता है': 'idle',
    'आसमान की ओर देखती है': 'idle',
  };

  for (const [hindiAction, expected] of Object.entries(table)) {
    const res = normalizeAnimationAction(hindiAction);
    assert.strictEqual(
      res.action,
      expected,
      `Action "${hindiAction}" must normalize to "${expected}", got "${res.action}"`
    );
  }
});

test('14. P0 — Project Look DNA Prompt Composition (Format, Camera, Lensing, Lighting, Palette, Framing, Negatives)', async () => {
  const look = {
    format: 'cinematic 3D animation',
    camera: 'medium close-up, eye level',
    lensing: 'shallow depth of field, 50mm lens',
    lighting: 'warm golden-hour rim lighting',
    palette: 'vibrant saturated warm tones',
    aspect: '9:16',
    avoid: 'no text, no captions, no watermark, no characters',
  };

  // 1. English scene prompt
  const englishPrompt = PromptSynthesizer.synthesizeBackgroundPrompt({
    explicitPrompt: 'A lush forest with sunbeams filtering through ancient trees',
    sceneTitle: 'Ancient Forest',
    look,
  });
  assert.ok(englishPrompt.includes('cinematic 3D animation'));
  assert.ok(englishPrompt.includes('medium close-up, eye level'));
  assert.ok(englishPrompt.includes('shallow depth of field, 50mm lens'));
  assert.ok(englishPrompt.includes('warm golden-hour rim lighting'));
  assert.ok(englishPrompt.includes('vibrant saturated warm tones'));
  assert.ok(englishPrompt.includes('Vertical 9:16 composition'));
  assert.ok(englishPrompt.includes('no text, no captions, no watermark, no characters'));

  // 2. Hindi scene prompt
  const hindiPrompt = PromptSynthesizer.synthesizeBackgroundPrompt({
    explicitPrompt: 'एक हरा-भरा जंगल जहाँ पुराने पेड़ों से धूप छनकर आ रही है',
    sceneTitle: 'हरा-भरा जंगल',
    look,
  });
  assert.ok(hindiPrompt.includes('cinematic 3D animation'));
  assert.ok(hindiPrompt.includes('Vertical 9:16 composition'));
  assert.ok(hindiPrompt.includes('एक हरा-भरा जंगल'));

  // 3. Negative constraint blending
  assert.ok(hindiPrompt.includes('no text, no captions, no watermark, no characters'));
});

test('15. P0 — Unresolved Speaker Handling (Defaults to Narrator, Emits Warning, No Phantom Earth)', async () => {
  const script = `# Title: Unlabelled Dialogue Script
Language: Hindi

**Scene 1: Whispering Woods**
Visual: Ancient misty woods.
"किसने पुकारा मुझे इस घने जंगल में?"
`;

  const draft = StoryImporterService.parseScriptForDraft(script);

  // Must not fabricate Earth
  assert.strictEqual(draft.characters.length, 0, 'Must have 0 characters for unlabelled single dialogue');
  assert.strictEqual(draft.scenes.length, 1);

  const s1 = draft.scenes[0];
  assert.strictEqual(s1.dialogue.length, 1);
  assert.strictEqual(s1.dialogue[0].characterName, 'Narrator', 'Unlabelled dialogue must default to Narrator');

  // Must emit UNRESOLVED_SPEAKER diagnostic warning
  assert.ok(
    draft.warnings?.some((w) => w.code === 'UNRESOLVED_SPEAKER'),
    'Must emit UNRESOLVED_SPEAKER warning'
  );
});

test('16. P1 — Story Importer Database Transactions (Replace vs Append & Shared Character Safety)', async () => {
  const storyAId = `test-tx-story-a-${Date.now()}`;
  const storyBId = `test-tx-story-b-${Date.now()}`;

  // Clean up any stale records from previous runs
  await (prisma as any).storyCharacter.deleteMany({ where: { storyId: { in: [storyAId, storyBId] } } });
  await (prisma as any).scene.deleteMany({ where: { storyId: { in: [storyAId, storyBId] } } });
  await (prisma as any).story.deleteMany({ where: { storyId: { in: [storyAId, storyBId] } } });

  // Create stories A and B
  await createStory({ storyId: storyAId, title: 'Story A', targetDuration: 30 });
  await createStory({ storyId: storyBId, title: 'Story B', targetDuration: 30 });

  const scriptA = `# Title: Story A
**Scene 1: Meadow**
Bruno (cheerful): Hello from Bruno!
`;
  const draftA = StoryImporterService.parseScriptForDraft(scriptA);

  // Import Story A (creates Bruno and links to Story A)
  const savedA = await StoryImporterService.importDraftScenesToStory({
    storyId: storyAId,
    scenes: draftA.scenes,
    importMode: 'replace',
    title: 'Story A Updated',
    targetDurationSeconds: 25,
    updateStoryMetadata: true,
  });
  assert.strictEqual(savedA.length, 1);
  assert.strictEqual(savedA[0].number, 1);
  assert.strictEqual(savedA[0].order, 1);

  // Link Bruno also to Story B to make him a shared character
  const bruno = await (prisma as any).character.findFirst({ where: { name: 'Bruno' } });
  assert.ok(bruno, 'Bruno must exist in database');
  await (prisma as any).storyCharacter.create({
    data: { id: `link-${Date.now()}`, storyId: storyBId, characterId: bruno.id },
  });

  // Re-import Story A in replace mode: Bruno is shared with Story B, so Bruno MUST NOT be deleted
  const scriptA2 = `# Title: Story A2
**Scene 1: Beach**
Visual: Sunny beach with waves.
Narration: A sunny day at the beach.
`;
  const draftA2 = StoryImporterService.parseScriptForDraft(scriptA2);
  const replacedA = await StoryImporterService.importDraftScenesToStory({
    storyId: storyAId,
    scenes: draftA2.scenes,
    importMode: 'replace',
  });
  assert.strictEqual(replacedA.length, 1);

  // Verify Bruno still exists in character table because Story B uses him
  const brunoAfterReplace = await (prisma as any).character.findUnique({ where: { id: bruno.id } });
  assert.ok(brunoAfterReplace, 'Shared character Bruno must NOT be deleted in replace mode');

  // Test Append mode: Append a scene to Story A
  const scriptA3 = `# Title: Story A3
**Scene 1: Mountain**
Visual: Snowy peak.
`;
  const draftA3 = StoryImporterService.parseScriptForDraft(scriptA3);
  const appendedScenes = await StoryImporterService.importDraftScenesToStory({
    storyId: storyAId,
    scenes: draftA3.scenes,
    importMode: 'append',
  });

  assert.strictEqual(appendedScenes.length, 2, 'Story A must now have 2 scenes');
  assert.strictEqual(appendedScenes[1].number, 2, 'Appended scene must have sequential number 2');
  assert.strictEqual(appendedScenes[1].order, 2, 'Appended scene must have sequential order 2');
  assert.strictEqual(
    appendedScenes[1].startMs,
    appendedScenes[0].endMs,
    'Appended scene startMs must equal previous scene endMs'
  );

  // Cleanup
  await (prisma as any).storyCharacter.deleteMany({ where: { storyId: { in: [storyAId, storyBId] } } });
  await (prisma as any).scene.deleteMany({ where: { storyId: { in: [storyAId, storyBId] } } });
  await (prisma as any).story.deleteMany({ where: { storyId: { in: [storyAId, storyBId] } } });
  await (prisma as any).character.deleteMany({ where: { id: bruno.id } });
});


