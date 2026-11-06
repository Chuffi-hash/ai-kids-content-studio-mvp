import test from 'node:test';
import assert from 'node:assert';
import 'dotenv/config';
import { randomUUID } from 'crypto';
import fs from 'fs';
import path from 'path';
import {
  createCharacter,
  getCharacterById,
  deleteCharacter,
  createStory,
  createScene,
  deleteStory,
  updateCharacter,
} from '../src/services/database/database.service.js';
import { AudioGenerationService } from '../src/services/audio-generation/audio-generation.service.js';
import { TTSProviderFactory } from '../src/services/audio-generation/tts-provider.factory.js';
import {
  resolveEffectiveVoice,
  resolveEffectiveLanguage,
  isKokoroVoice,
} from '../src/services/audio-generation/language-resolver.service.js';
import { validateFreeModelPolicy } from '../src/services/audio-generation/providers/fish-audio.provider.js';

test('Character Voice Config - Provider and Model Persistence in Database', async () => {
  const uniqueName = `TestFishHero_${Date.now()}`;
  const char = await createCharacter({
    id: `char-test-fish-${randomUUID()}`,
    name: uniqueName,
    species: 'Human',
    personality: 'Curious explorer',
    visualDescription: 'Young boy in an adventure outfit',
    canonicalAppearance: {
      voiceConfig: {
        provider: 'fish_audio',
        model: 's2.1-pro-free',
        voiceId: 'fish_default',
        lang: 'hi',
        speed: 1.0,
        emotion: 'cheerful',
        emotionIntensity: 15,
      },
    },
  });

  try {
    const fetched = await getCharacterById(char.id);
    assert.ok(fetched, 'Character must exist');
    const voiceConfig = (fetched.canonicalAppearance as any)?.voiceConfig;
    assert.ok(voiceConfig, 'voiceConfig must be present');
    assert.strictEqual(voiceConfig.provider, 'fish_audio', 'Provider must be persisted as fish_audio');
    assert.strictEqual(voiceConfig.model, 's2.1-pro-free', 'Model must be persisted as s2.1-pro-free');
    assert.strictEqual(voiceConfig.voiceId, 'fish_default', 'Voice ID must be fish_default');
    assert.strictEqual(voiceConfig.emotionIntensity, 15, 'Intensity must be 15');

    // Update voice config with Kokoro provider
    const updatedCanonical = {
      ...(fetched.canonicalAppearance as any),
      voiceConfig: {
        provider: 'kokoro',
        model: undefined,
        voiceId: 'hf_alpha',
        lang: 'hi',
        speed: 1.0,
        emotion: 'neutral',
        emotionIntensity: 0,
      },
    };
    const updated = await updateCharacter(char.id, { canonicalAppearance: updatedCanonical });
    const updatedVoiceConfig = (updated.canonicalAppearance as any)?.voiceConfig;
    assert.strictEqual(updatedVoiceConfig.provider, 'kokoro', 'Provider must be updated to kokoro');
    assert.strictEqual(updatedVoiceConfig.voiceId, 'hf_alpha', 'Voice must be updated to hf_alpha');
  } finally {
    await deleteCharacter(char.id).catch(() => {});
  }
});

test('Cross-Provider Voice Protection - Kokoro vs Fish Audio Isolation', () => {
  // 1. Passing a Kokoro voice ID into Fish Audio provider must safely resolve to fish_default
  const fishVoiceWithKokoroInput = resolveEffectiveVoice({
    requestedVoice: 'hf_alpha',
    characterName: 'Sammy',
    species: 'Human',
    lang: 'hi',
    provider: 'fish_audio',
  });
  assert.strictEqual(
    fishVoiceWithKokoroInput,
    'fish_default',
    'Kokoro voice hf_alpha must never leak into Fish Audio, resolving to fish_default'
  );

  const fishVoiceWithEnglishKokoro = resolveEffectiveVoice({
    requestedVoice: 'af_heart',
    characterName: 'Bella',
    species: 'Human',
    lang: 'en',
    provider: 'fish_audio',
  });
  assert.strictEqual(
    fishVoiceWithEnglishKokoro,
    'fish_default',
    'Kokoro voice af_heart must resolve to fish_default under Fish Audio'
  );

  // 2. Passing fish_default into Kokoro provider must safely substitute canonical Kokoro voice
  const kokoroVoiceWithFishInput = resolveEffectiveVoice({
    requestedVoice: 'fish_default',
    characterName: 'Earth',
    species: 'planet',
    lang: 'hi',
    provider: 'kokoro',
  });
  assert.strictEqual(
    kokoroVoiceWithFishInput,
    'hf_alpha',
    'fish_default must be replaced by canonical Kokoro voice hf_alpha under Kokoro provider'
  );

  // 3. Valid custom Fish Audio reference ID (hex format) should be preserved under Fish Audio
  const validHexRef = 'a1b2c3d4e5f6a1b2c3d4e5f6';
  const resolvedRef = resolveEffectiveVoice({
    requestedVoice: validHexRef,
    characterName: 'Pip',
    lang: 'hi',
    provider: 'fish_audio',
  });
  assert.strictEqual(
    resolvedRef,
    validHexRef,
    'Valid hex custom model reference ID should be preserved under Fish Audio'
  );
});

test('Dialogue Line - Audio Generation Precedence with Fish Audio', async () => {
  const audioService = new AudioGenerationService();

  // Create temporary story and scene
  const story = await createStory({
    title: `Fish Audio Test Story ${Date.now()}`,
    topic: 'Testing Fish Audio',
    theme: 'Technology',
    targetAgeGroup: '6-8',
    lesson: 'Friendship',
    language: 'hi',
  });

  const scene = await createScene({
    sceneId: `scene-${Date.now()}-${randomUUID()}`,
    storyId: story.storyId,
    number: 1,
    title: 'Scene 1',
    description: 'Testing dialogue audio',
    visualPrompt: 'A peaceful forest clearing',
    narration: 'यह एक सुन्दर दिन था।',
    dialogue: 'नमस्ते दोस्तों!',
    audioEffect: 'normal',
    durationMs: 4000,
  });

  const uniqueCharName = `Pip_${Date.now()}`;
  const char = await createCharacter({
    id: `char-pip-${randomUUID()}`,
    name: uniqueCharName,
    species: 'Bear',
    personality: 'Playful cub',
    canonicalAppearance: {
      voiceConfig: {
        provider: 'fish_audio',
        model: 's2.1-pro-free',
        voiceId: 'fish_default',
        lang: 'hi',
        speed: 1.0,
        emotion: 'happy',
        emotionIntensity: 15,
      },
    },
  });

  // Mock Fish Audio HTTP request for deterministic offline testing
  const originalFetch = global.fetch;
  let capturedPayload: any = null;
  let capturedHeaders: any = null;

  global.fetch = async (url: any, init: any) => {
    if (url.toString().includes('/v1/tts')) {
      capturedPayload = JSON.parse(init.body);
      capturedHeaders = init.headers;
      // Return a valid dummy MP3 buffer (1 second silence frame)
      const fakeMp3 = Buffer.alloc(1024, 0xff);
      return {
        ok: true,
        status: 200,
        arrayBuffer: async () => fakeMp3.buffer,
      } as any;
    }
    return originalFetch(url, init);
  };

  try {
    // Generate dialogue audio with line override provider = 'fish_audio'
    const dialogue = await audioService.generateCharacterDialogueAudio({
      sceneId: scene.sceneId,
      characterId: char.id,
      characterName: char.name,
      text: 'नमस्ते दोस्तों! मैं पिप हूँ।',
      lang: 'hi',
      voice: 'fish_default',
      provider: 'fish_audio',
      emotion: 'cheerful',
      emotionIntensity: 15,
    });

    assert.ok(dialogue, 'Dialogue item must be created');
    assert.strictEqual(dialogue.provider, 'fish_audio', 'Dialogue provider must be fish_audio');
    assert.strictEqual(dialogue.model, 's2.1-pro-free', 'Dialogue model must be s2.1-pro-free');
    assert.strictEqual(dialogue.voice, 'fish_default', 'Voice must be fish_default');
    assert.ok(dialogue.audioUrl, 'Audio URL must be populated');
    assert.ok(dialogue.audioMeta, 'audioMeta must be present');
    assert.strictEqual(dialogue.audioMeta?.provider, 'fish_audio', 'audioMeta provider must be fish_audio');
    assert.strictEqual(dialogue.audioMeta?.model, 's2.1-pro-free', 'audioMeta model must be s2.1-pro-free');
    assert.ok(Array.isArray(dialogue.visemeCues), 'visemeCues must be an array');
    assert.ok(dialogue.visemeCues.length > 0, 'visemeCues must contain lip-sync data');

    // Verify mock captured request
    assert.ok(capturedPayload, 'Payload must be sent to Fish Audio endpoint');
    assert.ok(capturedPayload.text.includes('[cheerful]'), 'Text should contain composed emotional tag');
    assert.strictEqual(capturedHeaders['model'], 's2.1-pro-free', 'Request header must specify free model');
    assert.strictEqual(capturedPayload.reference_id, undefined, 'fish_default must omit reference_id');
  } finally {
    global.fetch = originalFetch;
    await deleteCharacter(char.id).catch(() => {});
    await deleteStory(story.storyId).catch(() => {});
  }
});

test('Dialogue Line - Inheriting Character Voice Provider Default', async () => {
  const audioService = new AudioGenerationService();

  const story = await createStory({
    title: `Inherit Provider Story ${Date.now()}`,
    topic: 'Testing Inheritance',
    theme: 'Education',
    targetAgeGroup: '6-8',
    lesson: 'Science',
    language: 'hi',
  });

  const scene = await createScene({
    sceneId: `scene-${Date.now()}-${randomUUID()}`,
    storyId: story.storyId,
    number: 1,
    title: 'Scene 1',
    description: 'Testing inheritance',
    visualPrompt: 'Space background',
    narration: 'पृथ्वी घूमती है।',
    dialogue: 'मैं पृथ्वी हूँ।',
    audioEffect: 'normal',
    durationMs: 4000,
  });

  const uniqueCharName = `Earth_${Date.now()}`;
  const char = await createCharacter({
    id: `char-earth-${randomUUID()}`,
    name: uniqueCharName,
    species: 'Planet',
    canonicalAppearance: {
      voiceConfig: {
        provider: 'fish_audio',
        model: 's2.1-pro-free',
        voiceId: 'fish_default',
        lang: 'hi',
        speed: 1.0,
        emotion: 'neutral',
        emotionIntensity: 0,
      },
    },
  });

  const originalFetch = global.fetch;
  let fetchCalled = false;

  global.fetch = async (url: any, init: any) => {
    if (url.toString().includes('/v1/tts')) {
      fetchCalled = true;
      const fakeMp3 = Buffer.alloc(1024, 0xff);
      return {
        ok: true,
        status: 200,
        arrayBuffer: async () => fakeMp3.buffer,
      } as any;
    }
    return originalFetch(url, init);
  };

  try {
    // Generate dialogue without specifying options.provider
    // It should automatically inherit character's provider: 'fish_audio'
    const dialogue = await audioService.generateCharacterDialogueAudio({
      sceneId: scene.sceneId,
      characterId: char.id,
      characterName: char.name,
      text: 'मैं पृथ्वी हूँ, आप सब का घर।',
      lang: 'hi',
    });

    assert.ok(fetchCalled, 'Fish Audio fetch should have been invoked via character default');
    assert.strictEqual(dialogue.provider, 'fish_audio', 'Inherited provider should be fish_audio');
    assert.strictEqual(dialogue.model, 's2.1-pro-free', 'Inherited model should be s2.1-pro-free');
    assert.strictEqual(dialogue.voice, 'fish_default', 'Inherited voice should be fish_default');
  } finally {
    global.fetch = originalFetch;
    await deleteCharacter(char.id).catch(() => {});
    await deleteStory(story.storyId).catch(() => {});
  }
});

test('Batch Dialogue Generation - Respecting Per-Character Voice Provider Defaults', async () => {
  const audioService = new AudioGenerationService();

  const story = await createStory({
    title: `Batch Dialogue Story ${Date.now()}`,
    topic: 'Testing Batch',
    theme: 'Nature',
    targetAgeGroup: '6-8',
    lesson: 'Friendship',
    language: 'hi',
  });

  // Character 1: uses Fish Audio default
  const charFish = await createCharacter({
    id: `char-fish-${randomUUID()}`,
    name: `FishChar_${Date.now()}`,
    species: 'Rabbit',
    canonicalAppearance: {
      voiceConfig: {
        provider: 'fish_audio',
        model: 's2.1-pro-free',
        voiceId: 'fish_default',
        lang: 'hi',
        speed: 1.0,
      },
    },
  });

  // Scene with animationData containing dialogue lines
  const scene = await createScene({
    sceneId: `scene-${Date.now()}-${randomUUID()}`,
    storyId: story.storyId,
    number: 1,
    title: 'Scene 1',
    description: 'Testing batch',
    visualPrompt: 'Forest scene',
    narration: 'कहानी शुरू होती है।',
    dialogue: 'नमस्ते!',
    audioEffect: 'normal',
    durationMs: 6000,
  });

  // Update scene with initial animation data and dialogue lines
  const { updateScene } = await import('../src/services/database/database.service.js');
  await updateScene(scene.sceneId, {
    animationData: {
      version: 1,
      viewport: { width: 1280, height: 720 },
      characterInstances: [],
      animationClips: [],
      dialogueLines: [
        {
          id: 'line-1',
          characterId: charFish.id,
          characterName: charFish.name,
          text: 'नमस्ते खरगोश की आवाज़ में!',
          lang: 'hi',
          provider: 'fish_audio',
          voice: 'fish_default',
          startMs: 0,
          durationMs: 3000,
        },
      ],
    },
  });

  const originalFetch = global.fetch;
  let batchFishCalls = 0;

  global.fetch = async (url: any, init: any) => {
    if (url.toString().includes('/v1/tts')) {
      batchFishCalls++;
      const fakeMp3 = Buffer.alloc(1024, 0xff);
      return {
        ok: true,
        status: 200,
        arrayBuffer: async () => fakeMp3.buffer,
      } as any;
    }
    return originalFetch(url, init);
  };

  try {
    const updatedLines = await audioService.generateAllSceneDialogues(scene.sceneId, {
      forceRegenerate: true,
    });

    assert.strictEqual(updatedLines.length, 1, 'Should return 1 dialogue line');
    assert.strictEqual(batchFishCalls, 1, 'Fish Audio should be called for line-1');
    assert.strictEqual(updatedLines[0].provider, 'fish_audio', 'Generated line provider must be fish_audio');
    assert.strictEqual(updatedLines[0].model, 's2.1-pro-free', 'Generated line model must be s2.1-pro-free');
    assert.ok(updatedLines[0].audioUrl, 'audioUrl must be populated');
  } finally {
    global.fetch = originalFetch;
    await deleteCharacter(charFish.id).catch(() => {});
    await deleteStory(story.storyId).catch(() => {});
  }
});

test('Dialogue Audio - Stale Detection on Provider Incompatibility', async () => {
  const audioService = new AudioGenerationService();

  const story = await createStory({
    title: `Stale Check Story ${Date.now()}`,
    topic: 'Testing Stale',
    theme: 'Nature',
    targetAgeGroup: '6-8',
    lesson: 'Science',
    language: 'hi',
  });

  const scene = await createScene({
    sceneId: `scene-${Date.now()}-${randomUUID()}`,
    storyId: story.storyId,
    number: 1,
    title: 'Scene 1',
    description: 'Testing stale audio detection',
    visualPrompt: 'Forest scene',
    narration: 'कहानी शुरू होती है।',
    dialogue: 'नमस्ते!',
    audioEffect: 'normal',
    durationMs: 6000,
  });

  // Dialogue line with existing Kokoro audio metadata
  const existingAudioFile = path.join(process.cwd(), 'storage', 'audio', `temp-stale-test-${Date.now()}.mp3`);
  await fs.promises.mkdir(path.dirname(existingAudioFile), { recursive: true });
  await fs.promises.writeFile(existingAudioFile, Buffer.alloc(512, 0xff));

  const relAudioUrl = `/storage/audio/${path.basename(existingAudioFile)}`;

  const { updateScene } = await import('../src/services/database/database.service.js');
  await updateScene(scene.sceneId, {
    animationData: {
      version: 1,
      viewport: { width: 1280, height: 720 },
      characterInstances: [],
      animationClips: [],
      dialogueLines: [
        {
          id: 'dlg-stale-1',
          characterName: 'Sammy',
          text: 'नमस्ते दोस्तों!',
          lang: 'hi',
          voice: 'fish_default',
          provider: 'fish_audio', // Newly changed to Fish Audio!
          audioUrl: relAudioUrl,
          audioMeta: {
            text: 'नमस्ते दोस्तों!',
            lang: 'hi',
            voice: 'hm_omega',
            provider: 'kokoro', // Previously generated with Kokoro
            emotion: 'neutral',
            emotionIntensity: 0,
            speed: 1.0,
            effect: 'normal',
          },
          startMs: 0,
          durationMs: 3000,
        },
      ],
    },
  });

  const originalFetch = global.fetch;
  let fishAudioInvoked = false;

  global.fetch = async (url: any, init: any) => {
    if (url.toString().includes('/v1/tts')) {
      fishAudioInvoked = true;
      const fakeMp3 = Buffer.alloc(1024, 0xff);
      return {
        ok: true,
        status: 200,
        arrayBuffer: async () => fakeMp3.buffer,
      } as any;
    }
    return originalFetch(url, init);
  };

  try {
    // Calling generateAllSceneDialogues WITHOUT forceRegenerate
    // Because provider changed (kokoro -> fish_audio), compatibility check must fail and trigger regeneration
    const updated = await audioService.generateAllSceneDialogues(scene.sceneId, {
      forceRegenerate: false,
    });

    assert.strictEqual(fishAudioInvoked, true, 'Incompatible provider must trigger regeneration with Fish Audio');
    assert.strictEqual(updated[0].provider, 'fish_audio', 'Updated line provider must now be fish_audio');
  } finally {
    global.fetch = originalFetch;
    await fs.promises.unlink(existingAudioFile).catch(() => {});
    await deleteStory(story.storyId).catch(() => {});
  }
});

test('Dialogue Line - English Language Speech with Fish Audio', async () => {
  const audioService = new AudioGenerationService();

  const story = await createStory({
    title: `English Fish Audio Story ${Date.now()}`,
    topic: 'Testing English',
    theme: 'Adventure',
    targetAgeGroup: '6-8',
    lesson: 'Exploration',
    language: 'en',
  });

  const scene = await createScene({
    sceneId: `scene-${Date.now()}-${randomUUID()}`,
    storyId: story.storyId,
    number: 1,
    title: 'Scene 1',
    description: 'Testing English dialogue',
    visualPrompt: 'Playground',
    narration: 'The sun was shining.',
    dialogue: 'Hello everyone!',
    audioEffect: 'normal',
    durationMs: 4000,
  });

  const originalFetch = global.fetch;
  let capturedPayload: any = null;

  global.fetch = async (url: any, init: any) => {
    if (url.toString().includes('/v1/tts')) {
      capturedPayload = JSON.parse(init.body);
      const fakeMp3 = Buffer.alloc(1024, 0xff);
      return {
        ok: true,
        status: 200,
        arrayBuffer: async () => fakeMp3.buffer,
      } as any;
    }
    return originalFetch(url, init);
  };

  try {
    const dialogue = await audioService.generateCharacterDialogueAudio({
      sceneId: scene.sceneId,
      characterName: 'Oliver',
      text: 'Hello everyone, welcome to the treehouse!',
      lang: 'en',
      provider: 'fish_audio',
      emotion: 'excited',
      emotionIntensity: 15,
    });

    assert.strictEqual(dialogue.lang, 'en', 'Dialogue language must be English');
    assert.strictEqual(dialogue.provider, 'fish_audio', 'Provider must be fish_audio');
    assert.strictEqual(dialogue.model, 's2.1-pro-free', 'Model must be s2.1-pro-free');
    assert.ok(capturedPayload.text.includes('[cheerful]'), 'Excited English speech should have restrained tag');
  } finally {
    global.fetch = originalFetch;
    await deleteStory(story.storyId).catch(() => {});
  }
});

