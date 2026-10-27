import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  StoryImporterService,
  isReservedMetadataKey,
  cleanSpeakerName,
  normalizeOverlayType,
  normalizeCharacterAction,
  matchSceneHeader,
  mapEmotionToDirectionAndExpression,
  resolveDefaultVoiceForCharacter,
} from '../src/services/story-generation/story-importer.service.js';
import {
  prisma,
  createStory,
  getStoryByStoryId,
  getScenesByStoryId,
  getCharacterByName,
} from '../src/services/database/database.service.js';
import { randomUUID } from 'crypto';

const HINDI_WEATHER_TEST_SCRIPT = `# धरती के मौसम के चार रंग
Language: Hindi
Target Duration: 90s
Logline: हमारी प्यारी धरती बच्चों को चारों ऋतुओं के रंग और रहस्य सिखाती है।
Lesson: हर मौसम का अपना विशेष महत्व और सौंदर्य होता है।

## Scene 1: गर्मी का कमाल!
Duration: 22 seconds
Background Prompt: Create a cinematic 3D storybook summer meadow with green hills, distant mountains, golden sunlight, lush trees near the sides and a clear blue sky. Keep the central foreground open for a separately animated Earth character. Environment only. No characters, text, captions, logos or watermarks. Vertical 9:16 composition.
Opening Caption: कभी गर्मी, कभी बारिश… ऐसा क्यों?
Narration: बच्चों, क्या तुमने सोचा है कि मौसम क्यों बदलते रहते हैं? चलो, हमारी प्यारी धरती से इसका रहस्य सुनते हैं!
Earth dialogue — surprised, playful: "नमस्ते नन्हे दोस्तों! मैं तुम्हारी प्यारी धरती हूँ। देखो, सूरज की सुनहरी किरणें कितनी तेज़ी से चमक रही हैं!"
Earth Speaking Emotion: Surprised, playful, then curious.
Earth Facial Expression: Raised eyebrows at the beginning, friendly smile at the end.
Character Action: Earth floats gently, looks toward the sun and gestures toward the landscape.
Effects: sunshine_rays, heat_shimmer

## Scene 2: मानसून की मस्ती!
Duration: 23 seconds
Background Prompt: Create a cinematic 3D storybook illustration of a lush Indian countryside valley, a flowing river, deep green hills, dramatic monsoon clouds, wet ground and distant mist. Leave the central foreground open for a separately animated Earth character. Environment only, no characters, text, captions, logos or watermarks. Vertical 9:16 composition. Do not include dense animated rain particles in the image.
Narration: भारत के कई हिस्सों में मानसून बारिश लेकर आता है। यह बारिश खेती, नदियों और पेड़-पौधों के लिए बहुत जरूरी है।
Earth dialogue — amazed, enthusiastic: "अरे वाह! देखो काले-काले बादल घिर आए और झमाझम बारिश शुरू हो गई! पेड़-पौधे कितने खुश हैं!"
Earth Speaking Emotion: Amazed, enthusiastic, then concerned.
Earth Facial Expression: Excited smile changes to a worried expression during the flood warning.
Character Action: Earth looks up at the clouds, gestures toward the river and then raises a hand as a warning.
Effects: rain, moving_clouds, water_splashes

## Scene 3: पतझड़ के रंग!
Duration: 20 seconds
Background Prompt: Create a cinematic 3D storybook autumn forest with orange, yellow and golden trees, a winding path, warm sunlight and distant hills. Place larger trees near the edges and leave the central foreground open for a separately animated Earth character. Fallen leaves may appear on the ground, but do not show flying leaves. No characters, text, captions, logos or watermarks. Vertical 9:16 composition.
Narration: कुछ जगहों पर शरद ऋतु में पेड़ों के पत्ते रंग बदलते हैं और धीरे-धीरे गिरने लगते हैं।
Earth dialogue — curious, delighted: "देखो दोस्तों! चारों तरफ सुनहरे और लाल पत्ते उड़ रहे हैं। प्रकृति अपने पुराने कपड़े बदल रही है!"
Earth Speaking Emotion: Curious, delighted and warm.
Earth Facial Expression: Amazed eyes, a gentle smile and a happy expression at the end.
Character Action: Earth follows a falling leaf with her eyes and points toward the colorful trees.
Effects: sunshine_rays, heat_shimmer, falling_leaves, flying_birds

## Scene 4: सर्दी का रहस्य!
Duration: 23 seconds
Background Prompt: Create a peaceful cinematic 3D storybook winter landscape with snow-covered mountain peaks, evergreen pine trees, a pale-blue sky and soft sunlight reflecting on the snow. Keep the central foreground open for a separately animated Earth character. Do not include dense snowfall particles, characters, text, captions, logos or watermarks. Vertical 9:16 composition.
Narration: सर्दियों में कई जगह तापमान गिरता है। बहुत ठंडे इलाकों में बर्फ भी गिर सकती है।
Earth dialogue — playful, excited: "ब्र्र्र! कितनी ठंडी हवा है! पर बर्फ की सफेद चादर में पहाड़ कितने खूबसूरत लग रहे हैं ना?"
Closing Dialogue: "तो प्यारे दोस्तों, चारों मौसम मिलकर हमारी धरती को जीवन और खुशियां देते हैं!"
Earth Speaking Emotion: Playful, curious, then excited and happy.
Earth Facial Expression: Playful shiver, thoughtful expression, followed by a broad smile.
Character Action: Earth shivers playfully, points toward the snowy mountains and looks toward the viewer at the end.
Effects: snowfall, fog_mist
`;

test('Intelligent Script Parser - Parse 4-Scene Hindi Weather Script with 100% Precision', () => {
  const parsed = StoryImporterService.parseScriptForDraft(HINDI_WEATHER_TEST_SCRIPT, {
    language: 'Hindi',
  });

  assert.equal(parsed.title, 'धरती के मौसम के चार रंग');
  assert.equal(parsed.language, 'Hindi');
  assert.equal(parsed.scenes.length, 4, 'Must have exactly 4 scenes');

  // Verify Scene 1: गर्मी का कमाल!
  const sc1 = parsed.scenes[0];
  assert.equal(sc1.title, 'गर्मी का कमाल!');
  assert.equal(sc1.durationSeconds, 22);
  assert.ok(sc1.visualPrompt.includes('summer meadow'));
  assert.equal(sc1.narration, 'बच्चों, क्या तुमने सोचा है कि मौसम क्यों बदलते रहते हैं? चलो, हमारी प्यारी धरती से इसका रहस्य सुनते हैं!');
  assert.equal(sc1.dialogue.length, 1);
  assert.equal(sc1.dialogue[0].characterName, 'Earth');
  assert.equal(sc1.dialogue[0].text, 'नमस्ते नन्हे दोस्तों! मैं तुम्हारी प्यारी धरती हूँ। देखो, सूरज की सुनहरी किरणें कितनी तेज़ी से चमक रही हैं!');
  assert.equal(sc1.dialogue[0].emotion, 'Surprised, playful, then curious.');
  assert.equal(sc1.dialogue[0].voice, 'hf_alpha', 'Earth must use female Hindi voice hf_alpha');
  assert.equal(sc1.characterActions[0].action, 'point');
  const sc1Effects = sc1.suggestedOverlays.map((o) => o.type);
  assert.ok(sc1Effects.includes('sunshine_rays'));
  assert.ok(sc1Effects.includes('heat_shimmer'));

  // Verify Scene 2: मानसून की मस्ती!
  const sc2 = parsed.scenes[1];
  assert.equal(sc2.title, 'मानसून की मस्ती!');
  assert.equal(sc2.durationSeconds, 23);
  assert.ok(sc2.visualPrompt.includes('countryside valley'));
  assert.ok(sc2.narration.includes('मानसून बारिश लेकर आता है'));
  assert.equal(sc2.dialogue.length, 1);
  assert.equal(sc2.dialogue[0].characterName, 'Earth');
  assert.ok(sc2.dialogue[0].text.includes('काले-काले बादल घिर आए'));
  assert.equal(sc2.dialogue[0].voice, 'hf_alpha');
  const sc2Effects = sc2.suggestedOverlays.map((o) => o.type);
  assert.ok(sc2Effects.includes('rain'));
  assert.ok(sc2Effects.includes('moving_clouds'));
  assert.ok(sc2Effects.includes('water_splashes'));

  // Verify Scene 3: पतझड़ के रंग!
  const sc3 = parsed.scenes[2];
  assert.equal(sc3.title, 'पतझड़ के रंग!');
  assert.equal(sc3.durationSeconds, 20);
  assert.ok(sc3.visualPrompt.includes('autumn forest'));
  assert.ok(sc3.narration.includes('पेड़ों के पत्ते रंग बदलते हैं'));
  assert.equal(sc3.dialogue.length, 1);
  assert.equal(sc3.dialogue[0].characterName, 'Earth');
  assert.ok(sc3.dialogue[0].text.includes('सुनहरे और लाल पत्ते उड़ रहे हैं'));
  assert.equal(sc3.dialogue[0].voice, 'hf_alpha');
  assert.equal(sc3.characterActions[0].action, 'point');
  const sc3Effects = sc3.suggestedOverlays.map((o) => o.type);
  assert.ok(sc3Effects.includes('falling_leaves'));
  assert.ok(sc3Effects.includes('flying_birds'));

  // Verify Scene 4: सर्दी का रहस्य!
  const sc4 = parsed.scenes[3];
  assert.equal(sc4.title, 'सर्दी का रहस्य!');
  assert.equal(sc4.durationSeconds, 23);
  assert.ok(sc4.visualPrompt.includes('winter landscape'));
  assert.ok(sc4.narration.includes('सर्दियों में कई जगह तापमान गिरता है'));
  assert.equal(sc4.dialogue.length, 2, 'Scene 4 has Earth dialogue and Closing Dialogue');
  assert.equal(sc4.dialogue[0].characterName, 'Earth');
  assert.ok(sc4.dialogue[0].text.includes('कितनी ठंडी हवा है'));
  assert.equal(sc4.dialogue[1].characterName, 'Earth', 'Closing dialogue must also map to Earth');
  assert.ok(sc4.dialogue[1].text.includes('चारों मौसम मिलकर हमारी धरती को जीवन और खुशियां देते हैं!'));
  assert.equal(sc4.characterActions[0].action, 'point');
  const sc4Effects = sc4.suggestedOverlays.map((o) => o.type);
  assert.ok(sc4Effects.includes('snowfall'));
  assert.ok(sc4Effects.includes('fog_mist'));

  // Verify character list contains only real characters, no ghost metadata
  for (const char of parsed.characters) {
    assert.equal(isReservedMetadataKey(char.name), false, `Ghost character detected: ${char.name}`);
  }
  const earthInChars = parsed.characters.find((c) => c.name === 'Earth');
  assert.ok(earthInChars, 'Earth must be present in parsed characters');
  assert.equal(earthInChars.voice, 'hf_alpha');
});

test('Intelligent Script Parser - Reserved Metadata and Speaker Normalization', () => {
  assert.equal(isReservedMetadataKey('Duration'), true);
  assert.equal(isReservedMetadataKey('Background Prompt'), true);
  assert.equal(isReservedMetadataKey('Earth Speaking Emotion'), true);
  assert.equal(isReservedMetadataKey('Character Action'), true);
  assert.equal(isReservedMetadataKey('Opening Caption'), true);
  assert.equal(isReservedMetadataKey('Closing Dialogue'), true);
  assert.equal(isReservedMetadataKey('Earth'), false);
  assert.equal(isReservedMetadataKey('Pip'), false);

  assert.equal(cleanSpeakerName('**Earth dialogue — surprised:**'), 'Earth');
  assert.equal(cleanSpeakerName('Earth dialogue'), 'Earth');
  assert.equal(cleanSpeakerName('धरती संवाद'), 'Earth');
  assert.equal(cleanSpeakerName('Pip the bear'), 'Pip');

  assert.equal(normalizeOverlayType('Sunshine Rays'), 'sunshine_rays');
  assert.equal(normalizeOverlayType('falling_leaves'), 'falling_leaves');
  assert.equal(normalizeOverlayType('snowfall'), 'snowfall');
  assert.equal(normalizeOverlayType('heat_shimmer'), 'heat_shimmer');
  assert.equal(normalizeOverlayType('moving_clouds'), 'moving_clouds');

  assert.equal(normalizeCharacterAction('Earth points toward the colorful trees').action, 'point');
  assert.equal(normalizeCharacterAction('Earth floats gently, gestures toward the landscape').action, 'point');
  assert.equal(normalizeCharacterAction('Earth raises a hand as a warning').action, 'wave');
  assert.equal(normalizeCharacterAction('Earth walks across the meadow').action, 'walk');
});

test('Intelligent Script Parser - Import Draft Scenes into Database in Replace Mode', async () => {
  const testStoryId = `story-test-${Date.now()}`;
  await createStory({
    id: randomUUID(),
    storyId: testStoryId,
    title: 'धरती के मौसम के चार रंग',
    topic: 'Seasons',
    ageGroup: '4-7 years',
    audience: '4-7 years',
    genre: 'Educational',
    targetDuration: 90,
  });

  const parsed = StoryImporterService.parseScriptForDraft(HINDI_WEATHER_TEST_SCRIPT, {
    language: 'Hindi',
  });

  const savedScenes = await StoryImporterService.importDraftScenesToStory({
    storyId: testStoryId,
    scenes: parsed.scenes,
    importMode: 'replace',
    updateStoryMetadata: true,
    title: parsed.title,
    targetDurationSeconds: parsed.targetDurationSeconds,
    language: 'Hindi',
  });

  assert.equal(savedScenes.length, 4, 'Must save 4 scenes in DB');

  // Verify Scene 1
  const sc1 = savedScenes[0];
  assert.equal(sc1.title, 'गर्मी का कमाल!');
  assert.equal(sc1.narration, 'बच्चों, क्या तुमने सोचा है कि मौसम क्यों बदलते रहते हैं? चलो, हमारी प्यारी धरती से इसका रहस्य सुनते हैं!');
  assert.ok(sc1.animationData);
  assert.equal(sc1.animationData.dialogueLines.length, 1);
  assert.equal(sc1.animationData.dialogueLines[0].characterName, 'Earth');
  assert.equal(sc1.animationData.dialogueLines[0].voice, 'hf_alpha', 'Earth dialogue must have hf_alpha voice');
  assert.equal(sc1.animationData.animationClips[0].action, 'point');

  // Verify Scene 4
  const sc4 = savedScenes[3];
  assert.equal(sc4.title, 'सर्दी का रहस्य!');
  assert.equal(sc4.animationData.dialogueLines.length, 2);
  assert.equal(sc4.animationData.dialogueLines[0].characterName, 'Earth');
  assert.equal(sc4.animationData.dialogueLines[1].characterName, 'Earth');
  assert.equal(sc4.animationData.dialogueLines[0].voice, 'hf_alpha');
  assert.equal(sc4.animationData.dialogueLines[1].voice, 'hf_alpha');

  // Verify no ghost characters were created in DB
  const ghostChars = await (prisma as any).character.findMany({
    where: {
      name: {
        in: [
          'Duration',
          'Background Prompt',
          'Opening Caption',
          'Earth Speaking Emotion',
          'Earth Facial Expression',
          'Character Action',
          'Closing Dialogue',
        ],
      },
    },
  });
  assert.equal(ghostChars.length, 0, 'No ghost characters should exist in the database');

  // Cleanup test story
  const createdScenes = await (prisma as any).scene.findMany({ where: { storyId: testStoryId }, select: { sceneId: true } });
  const ids = createdScenes.map((s: any) => s.sceneId);
  await (prisma as any).scene.deleteMany({ where: { sceneId: { in: ids } } });
  await (prisma as any).storyCharacter.deleteMany({ where: { storyId: testStoryId } });
  await (prisma as any).story.deleteMany({ where: { storyId: testStoryId } });
});

