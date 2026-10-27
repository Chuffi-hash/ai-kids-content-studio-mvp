import { test } from 'node:test';
import assert from 'node:assert';
import { StoryImporterService } from '../src/services/story-generation/story-importer.service.js';
import { createStory, deleteStory, getStoryByStoryId, getScenesByStoryId } from '../src/services/database/database.service.js';
import { randomUUID } from 'crypto';

const HINDI_FOUR_SEASONS_SCRIPT = `# Title: Earth's Promise: The Four Seasons
Target Duration: 60s
Language: Hindi
Logline: Earth teaches children how the four seasons bring balance, beauty, and life to our planet.
Lesson: Every season has a special purpose in nature.

## Characters
- Earth (Protagonist): Our smiling, wise living planet with blue oceans and green continents.

## Scene 1: Golden Summer (15s)
Visual: Sun-drenched golden meadows with distant mountains, vibrant sunshine rays and heat shimmer.
Narration: ग्रीष्म ऋतु में सूरज अपनी सुनहरी किरणें बिखेरता है और प्रकृति खिल उठती है।
Earth: नमस्ते नन्हे दोस्तों! मैं तुम्हारी पृथ्वी हूँ। देखो, सूरज की धूप फसलों को पका रही है! (Emotion: happy)
Effects: sunshine_rays, heat_shimmer

## Scene 2: The Monsoon Rain
Duration: 15s
Visual: Lush green hills and valleys covered in fresh gentle monsoon rain, rolling clouds and water splashes.
Narration: वर्षा ऋतु में काले बादल गरजते हैं और ठंडी बारिश सूखी धरती को नया जीवन देती है।
Earth: आहा! बारिश की हर बूंद नदियों और झरनों में नई जान फूंक देती है। (Emotion: excited)

## Scene 3: Peaceful Winter
Duration: 15s
Visual: Serene snowy forest with pine trees covered in soft snowfall, gentle fog and mist.
Narration: शीत ऋतु में बर्फ की सफेद चादर बिछ जाती है और पेड़-पौधे विश्राम करते हैं।
Earth: सर्दी हमें सिखाती है कि नए जीवन की तैयारी के लिए विश्राम भी जरूरी है। (Emotion: calm)
`;

const MARKDOWN_AI_SCRIPT = `**Title:** Adventure in the Forest
**Language:** Hindi
**Duration:** 45s

**Scene 1: Sunny Meadow**
**Duration:** 15s
**Background Prompt:** A vibrant colorful meadow with wildflowers and tall trees under clear skies.
**Narration:** आज का दिन बहुत सुहाना है और चारों तरफ हरियाली छाई हुई है।
**Earth dialogue — surprised, playful:** "नमस्ते दोस्तों! देखो कितना सुंदर जंगल है!"
**Earth Action:** wave
**Expression:** happy
**Overlays:** sunshine_rays

**Scene 2: Gentle Rain**
**Duration:** 15s
**Background Prompt:** Gentle summer shower over green hills with birds flying.
**Narration:** तभी आसमान से ठंडी-ठंडी फुहारें गिरने लगती हैं।
**Earth dialogue — cheerful:** "बारिश आ गई! सब पेड़ पौधे नहा रहे हैं।"
`;

test('Script Importer - Parse Hindi Four Seasons script into draft storyboard', () => {
  const result = StoryImporterService.parseScriptForDraft(HINDI_FOUR_SEASONS_SCRIPT, {
    language: 'Hindi',
  });

  assert.strictEqual(result.title, "Earth's Promise: The Four Seasons");
  assert.strictEqual(result.language, 'Hindi');
  assert.strictEqual(result.scenes.length, 3);

  // Scene 1
  const sc1 = result.scenes[0];
  assert.strictEqual(sc1.sceneNumber, 1);
  assert.strictEqual(sc1.title, 'Golden Summer');
  assert.strictEqual(sc1.durationSeconds, 15);
  assert.ok(sc1.visualPrompt.includes('golden meadows'));
  assert.strictEqual(sc1.narration, 'ग्रीष्म ऋतु में सूरज अपनी सुनहरी किरणें बिखेरता है और प्रकृति खिल उठती है।');
  assert.strictEqual(sc1.dialogue.length, 1);
  assert.strictEqual(sc1.dialogue[0].characterName, 'Earth');
  assert.strictEqual(sc1.dialogue[0].text, 'नमस्ते नन्हे दोस्तों! मैं तुम्हारी पृथ्वी हूँ। देखो, सूरज की धूप फसलों को पका रही है!');
  assert.strictEqual(sc1.dialogue[0].emotion, 'happy');
  assert.strictEqual(sc1.dialogue[0].voice, 'hf_alpha', 'Earth in Hindi must resolve to hf_alpha female voice');

  // Verify explicit overlays
  assert.ok(sc1.suggestedOverlays.some((o) => o.type === 'sunshine_rays'));

  // Scene 2
  const sc2 = result.scenes[1];
  assert.strictEqual(sc2.title, 'The Monsoon Rain');
  assert.strictEqual(sc2.dialogue[0].emotion, 'excited');
  assert.strictEqual(sc2.dialogue[0].voice, 'hf_alpha');

  // Scene 3
  const sc3 = result.scenes[2];
  assert.strictEqual(sc3.title, 'Peaceful Winter');
  assert.strictEqual(sc3.dialogue[0].emotion, 'calm');
});

test('Script Importer - Parse AI Markdown formatted script with bold tags and em-dash emotions', () => {
  const result = StoryImporterService.parseScriptForDraft(MARKDOWN_AI_SCRIPT);

  assert.strictEqual(result.title, 'Adventure in the Forest');
  assert.strictEqual(result.language, 'Hindi');
  assert.strictEqual(result.scenes.length, 2);

  const sc1 = result.scenes[0];
  assert.strictEqual(sc1.title, 'Sunny Meadow');
  assert.strictEqual(sc1.durationSeconds, 15);
  assert.ok(sc1.visualPrompt.includes('vibrant colorful meadow'));
  assert.strictEqual(sc1.narration, 'आज का दिन बहुत सुहाना है और चारों तरफ हरियाली छाई हुई है।');
  assert.strictEqual(sc1.dialogue.length, 1);
  assert.strictEqual(sc1.dialogue[0].characterName, 'Earth');
  assert.strictEqual(sc1.dialogue[0].text, 'नमस्ते दोस्तों! देखो कितना सुंदर जंगल है!');
  assert.strictEqual(sc1.dialogue[0].emotion, 'surprised, playful');
  assert.strictEqual(sc1.dialogue[0].voice, 'hf_alpha');
  assert.strictEqual(sc1.characterActions[0].action, 'wave');
  assert.ok(sc1.suggestedOverlays.some((o) => o.type === 'sunshine_rays'));
});

test('Script Importer - Auto-detect overlays when not explicitly declared in script', () => {
  const scriptWithoutOverlays = `## Scene 1: Snowy Forest
Visual: A peaceful forest with quiet snowy pines and cold fog in winter.
Narration: सर्द हवाएं चल रही हैं और चारों ओर बर्फ गिरी हुई है।
Earth: ठंड बहुत बढ़ गई है दोस्तों! (Emotion: calm)
`;

  const result = StoryImporterService.parseScriptForDraft(scriptWithoutOverlays, { language: 'Hindi' });
  assert.strictEqual(result.scenes.length, 1);
  const sc = result.scenes[0];
  assert.ok(sc.suggestedOverlays.length > 0, 'Must auto-detect overlays based on keywords');
  assert.ok(sc.suggestedOverlays.some((o) => o.type === 'snowfall' || o.type === 'fog_mist'));
});

test('Script Importer - Save draft scenes to story without auto-generating media', async () => {
  const testStoryId = `story-import-test-${randomUUID().slice(0, 8)}`;

  await createStory({
    id: randomUUID(),
    storyId: testStoryId,
    title: 'Initial Test Story',
    targetDuration: 60,
  });

  const parsed = StoryImporterService.parseScriptForDraft(HINDI_FOUR_SEASONS_SCRIPT, { language: 'Hindi' });

  // 1. Import in replace mode
  const savedScenes = await StoryImporterService.importDraftScenesToStory({
    storyId: testStoryId,
    scenes: parsed.scenes,
    importMode: 'replace',
    updateStoryMetadata: true,
    title: parsed.title,
    targetDurationSeconds: parsed.targetDurationSeconds,
    language: 'Hindi',
  });

  assert.strictEqual(savedScenes.length, 3, 'Must have saved 3 scenes in DB');

  // Verify scenes are NOT marked as generated (no media generation!)
  for (const sc of savedScenes) {
    assert.strictEqual(sc.generationStatus, 'draft', 'Status must be draft');
    assert.strictEqual(sc.imageUrl, null, 'imageUrl must be null (not auto-generated)');
    assert.strictEqual(sc.audioUrl, null, 'audioUrl must be null (not auto-generated)');
    assert.strictEqual(sc.videoUrl, null, 'videoUrl must be null (not auto-generated)');
    assert.ok(sc.visualPrompt && sc.visualPrompt.length > 5, 'visualPrompt must be populated');
    assert.ok(sc.narration && sc.narration.length > 5, 'narration must be populated');

    // Verify animation data structure
    assert.ok(sc.animationData, 'animationData must be created');
    assert.ok(sc.animationData.characterInstances.length >= 1, 'Earth character instance must exist');
    assert.strictEqual(sc.animationData.characterInstances[0].name, 'Earth');
    assert.ok(sc.animationData.characterInstances[0].customRig, 'Custom rig must be built');
    assert.strictEqual(sc.animationData.dialogueLines.length, 1, 'Dialogue line must be mapped');
    assert.strictEqual(sc.animationData.dialogueLines[0].voice, 'hf_alpha', 'Earth dialogue must have hf_alpha');
    assert.ok(sc.animationData.dialogueLines[0].visemeCues.length > 0, 'Viseme cues must be generated');
  }

  // Verify contiguous timeline
  assert.strictEqual(savedScenes[0].startMs, 0);
  assert.strictEqual(savedScenes[0].endMs, 15000);
  assert.strictEqual(savedScenes[1].startMs, 15000);
  assert.strictEqual(savedScenes[1].endMs, 30000);
  assert.strictEqual(savedScenes[2].startMs, 30000);
  assert.strictEqual(savedScenes[2].endMs, 45000);

  // 2. Test append mode
  const extraScene = {
    sceneNumber: 4,
    title: 'Spring Blooms',
    durationSeconds: 12,
    visualPrompt: 'Bright blooming flowers and green sprouting buds.',
    narration: 'बसंत ऋतु में चारों ओर रंग-बिरंगे फूल खिल जाते हैं।',
    dialogue: [
      {
        id: 'diag-4',
        characterName: 'Earth',
        text: 'फूलों की महक कितनी प्यारी है!',
        emotion: 'happy',
        voice: 'hf_alpha',
      },
    ],
    characterActions: [{ characterName: 'Earth', action: 'wave' }],
    suggestedOverlays: [{ id: 'ov-1', type: 'butterflies', label: 'Butterflies' }],
  };

  const appendedScenes = await StoryImporterService.importDraftScenesToStory({
    storyId: testStoryId,
    scenes: [extraScene],
    importMode: 'append',
    language: 'Hindi',
  });

  assert.strictEqual(appendedScenes.length, 4, 'Must now have 4 scenes');
  const sc4 = appendedScenes.find((s) => s.title === 'Spring Blooms');
  assert.ok(sc4);
  assert.strictEqual(sc4?.startMs, 45000, 'Appended scene must start where scene 3 ended');
  assert.strictEqual(sc4?.endMs, 57000, 'Appended scene endMs must be startMs + 12000');

  // Verify story title was updated
  const updatedStory = await getStoryByStoryId(testStoryId);
  assert.strictEqual(updatedStory?.title, "Earth's Promise: The Four Seasons");

  // Clean up test story
  await deleteStory(testStoryId);
});

