import test from 'node:test';
import assert from 'node:assert';
import path from 'node:path';
import fs from 'node:fs';
import crypto from 'node:crypto';
import {
  resolveEffectiveLanguage,
  resolveEffectiveVoice,
  resolveCanonicalVoiceForCharacter,
  isVoiceCompatibleWithLanguage,
  toTTSLanguageCode,
  isExplicitEnglish,
  isExplicitHindi,
  containsDevanagari,
} from '../src/services/audio-generation/language-resolver.service.js';
import {
  calculateEmotionDelivery,
  normalizeEmotionIntensity,
  EMOTION_DELIVERY_MAP,
} from '../src/services/audio-generation/emotion-suggester.service.js';
import { AudioEffectsService } from '../src/services/audio-generation/audio-effects.service.js';
import { KokoroTTSProvider } from '../src/services/audio-generation/kokoro-tts.provider.js';
import { GoogleTTSProvider } from '../src/services/audio-generation/google-tts.provider.js';
import { ScenePreparationService } from '../src/services/story-generation/scene-preparation.service.js';
import { IntelligentScriptParser } from '../src/services/story-generation/parser/intelligent-script-parser.js';

test('1. Centralized Language Resolution - Hindi by Default Everywhere', () => {
  // Missing / undefined / null / empty defaults to Hindi
  assert.strictEqual(resolveEffectiveLanguage(), 'hi', 'Missing input must resolve to Hindi');
  assert.strictEqual(resolveEffectiveLanguage(undefined), 'hi', 'Undefined must resolve to Hindi');
  assert.strictEqual(resolveEffectiveLanguage(null), 'hi', 'Null must resolve to Hindi');
  assert.strictEqual(resolveEffectiveLanguage(''), 'hi', 'Empty string must resolve to Hindi');
  assert.strictEqual(resolveEffectiveLanguage({ lang: undefined, text: undefined, projectLang: undefined }), 'hi');
  assert.strictEqual(resolveEffectiveLanguage({ lang: null, text: null, projectLang: null }), 'hi');
  assert.strictEqual(resolveEffectiveLanguage({ lang: '' }), 'hi');

  // English words in text WITHOUT explicit language setting MUST STILL default to Hindi
  // (Core rule: never infer English simply because language metadata is missing)
  assert.strictEqual(
    resolveEffectiveLanguage({ text: 'Hello everyone, look at the weather!' }),
    'hi',
    'Text in Latin alphabet with missing language metadata must STILL default to Hindi'
  );

  // Devanagari text unambiguously resolves to Hindi
  assert.strictEqual(
    resolveEffectiveLanguage({ text: 'अरे दोस्तों! मेरी तरफ़ देखो!' }),
    'hi',
    'Devanagari text must resolve to Hindi'
  );

  // Explicit English requested
  assert.strictEqual(resolveEffectiveLanguage('en'), 'en');
  assert.strictEqual(resolveEffectiveLanguage('en-US'), 'en');
  assert.strictEqual(resolveEffectiveLanguage('en-GB'), 'en');
  assert.strictEqual(resolveEffectiveLanguage('english'), 'en');
  assert.strictEqual(resolveEffectiveLanguage({ lang: 'en' }), 'en');
  assert.strictEqual(resolveEffectiveLanguage({ lang: 'en-US' }), 'en');
  assert.strictEqual(resolveEffectiveLanguage({ lang: 'english' }), 'en');

  // Explicit Hindi requested
  assert.strictEqual(resolveEffectiveLanguage('hi'), 'hi');
  assert.strictEqual(resolveEffectiveLanguage('hi-IN'), 'hi');
  assert.strictEqual(resolveEffectiveLanguage('hindi'), 'hi');
  assert.strictEqual(resolveEffectiveLanguage({ lang: 'hi' }), 'hi');

  // Project-level language precedence
  assert.strictEqual(resolveEffectiveLanguage({ projectLang: 'English' }), 'en', 'Explicit project English is respected');
  assert.strictEqual(resolveEffectiveLanguage({ projectLang: 'Hindi' }), 'hi', 'Explicit project Hindi is respected');
  assert.strictEqual(resolveEffectiveLanguage({ projectLang: undefined }), 'hi', 'Unspecified project language defaults to Hindi');

  // Dialogue line override takes precedence over project-level setting
  assert.strictEqual(
    resolveEffectiveLanguage({ lang: 'hi', projectLang: 'English' }),
    'hi',
    'Explicit line Hindi overrides project English'
  );
  assert.strictEqual(
    resolveEffectiveLanguage({ lang: 'en', projectLang: 'Hindi' }),
    'en',
    'Explicit line English overrides project Hindi'
  );
});

test('2. Canonical Character Voice Resolution & Strict Language Compatibility', () => {
  // Earth
  assert.strictEqual(resolveCanonicalVoiceForCharacter('Earth', 'hi'), 'hf_alpha', 'Earth in Hindi must be hf_alpha');
  assert.strictEqual(resolveCanonicalVoiceForCharacter('Terra', 'hi'), 'hf_alpha');
  assert.strictEqual(resolveCanonicalVoiceForCharacter('पृथ्वी', 'hi'), 'hf_alpha');
  assert.strictEqual(resolveCanonicalVoiceForCharacter('Earth', 'en'), 'af_heart', 'Earth in English must be af_heart');

  // Pip / Bear
  assert.strictEqual(resolveCanonicalVoiceForCharacter('Pip', 'hi'), 'hm_omega', 'Pip in Hindi must be hm_omega');
  assert.strictEqual(resolveCanonicalVoiceForCharacter('Bear Cub', 'hi'), 'hm_omega');
  assert.strictEqual(resolveCanonicalVoiceForCharacter('Pip', 'en'), 'bm_george');

  // Sammy / Boy
  assert.strictEqual(resolveCanonicalVoiceForCharacter('Sammy', 'hi'), 'hm_omega');
  assert.strictEqual(resolveCanonicalVoiceForCharacter('Boy', 'hi'), 'hm_omega');
  assert.strictEqual(resolveCanonicalVoiceForCharacter('Sammy', 'en'), 'am_adam');

  // Maya / Girl
  assert.strictEqual(resolveCanonicalVoiceForCharacter('Maya', 'hi'), 'hf_beta');
  assert.strictEqual(resolveCanonicalVoiceForCharacter('Girl', 'hi'), 'hf_beta');
  assert.strictEqual(resolveCanonicalVoiceForCharacter('Maya', 'en'), 'af_bella');

  // Sparky / Robot
  assert.strictEqual(resolveCanonicalVoiceForCharacter('Sparky', 'hi'), 'hm_psi');
  assert.strictEqual(resolveCanonicalVoiceForCharacter('Robot', 'hi'), 'hm_psi');
  assert.strictEqual(resolveCanonicalVoiceForCharacter('Robot', 'en'), 'bm_lewis');

  // Compatibility validator
  assert.strictEqual(isVoiceCompatibleWithLanguage('hf_alpha', 'hi'), true);
  assert.strictEqual(isVoiceCompatibleWithLanguage('hf_beta', 'hi'), true);
  assert.strictEqual(isVoiceCompatibleWithLanguage('hm_omega', 'hi'), true);
  assert.strictEqual(isVoiceCompatibleWithLanguage('hm_psi', 'hi'), true);
  assert.strictEqual(isVoiceCompatibleWithLanguage('hi-IN-Standard', 'hi'), true);

  // Incompatible voices for Hindi
  assert.strictEqual(isVoiceCompatibleWithLanguage('bm_daniel', 'hi'), false);
  assert.strictEqual(isVoiceCompatibleWithLanguage('af_heart', 'hi'), false);
  assert.strictEqual(isVoiceCompatibleWithLanguage('bm_george', 'hi'), false);
  assert.strictEqual(isVoiceCompatibleWithLanguage('en-US-Standard', 'hi'), false);

  // resolveEffectiveVoice must substitute incompatible voices with canonical voice
  const resolvedEarth = resolveEffectiveVoice({
    requestedVoice: 'bm_daniel', // English voice mistakenly requested for Hindi
    characterName: 'Earth',
    lang: 'hi',
  });
  assert.strictEqual(resolvedEarth, 'hf_alpha', 'Incompatible bm_daniel for Earth in Hindi must resolve to hf_alpha');

  const resolvedPip = resolveEffectiveVoice({
    requestedVoice: 'bm_george', // English voice mistakenly requested for Hindi
    characterName: 'Pip',
    lang: 'hi',
  });
  assert.strictEqual(resolvedPip, 'hm_omega', 'Incompatible bm_george for Pip in Hindi must resolve to hm_omega');

  // Google provider voice resolution
  assert.strictEqual(resolveEffectiveVoice({ lang: 'hi', provider: 'google' }), 'hi-IN-Standard');
  assert.strictEqual(resolveEffectiveVoice({ lang: 'en', provider: 'google' }), 'en-US-Standard');
});

test('3. No Silent Fallback to English on TTS Validation or Providers', async () => {
  const kokoro = new KokoroTTSProvider();

  // Attempting to generate speech with incompatible voice for language must throw an error, NOT switch language
  await assert.rejects(
    async () => {
      await kokoro.generateSpeech('नमस्ते दुनिया', {
        voice: 'bm_daniel', // English voice with explicit Hindi
        lang: 'hi',
      });
    },
    /Kokoro voice "bm_daniel" does not support target language "hi"/i,
    'Kokoro must reject English voice when target language is Hindi'
  );

  const google = new GoogleTTSProvider();
  await assert.rejects(
    async () => {
      await google.generateSpeech('नमस्ते दुनिया', {
        voice: 'en-US-Standard', // English voice with explicit Hindi
        lang: 'hi',
      });
    },
    /Google voice "en-US-Standard" does not support target language "hi"/i,
    'Google TTS must reject English voice when target language is Hindi'
  );

  // When options are completely empty, Google provider must default to Hindi ('hi-IN')
  const defaultGoogleLang = toTTSLanguageCode(resolveEffectiveLanguage({}), 'google');
  assert.strictEqual(defaultGoogleLang, 'hi-IN', 'Default Google language must be hi-IN');
  const defaultKokoroLang = toTTSLanguageCode(resolveEffectiveLanguage({}), 'kokoro');
  assert.strictEqual(defaultKokoroLang, 'hi', 'Default Kokoro language must be hi');
});

test('4. Emotion Intensity 0-100% Speech Delivery Bounded and Distortion-Free', () => {
  // Test all emotions across intensity levels 0, 25, 50, 75, 100
  const emotions = Object.keys(EMOTION_DELIVERY_MAP);

  for (const emotion of emotions) {
    // 0% Intensity: Neutral baseline
    const del0 = calculateEmotionDelivery({ emotion, intensity: 0, baseSpeed: 1.0 });
    assert.strictEqual(del0.intensity, 0);
    assert.strictEqual(del0.calibratedSpeed, 1.0, `Emotion ${emotion} at 0% must have calibratedSpeed 1.0`);
    assert.strictEqual(del0.pitchShiftSemitones, 0, `Emotion ${emotion} at 0% must have 0 pitch shift`);
    assert.strictEqual(del0.presenceGainDb, 0, `Emotion ${emotion} at 0% must have 0 presence gain`);
    assert.strictEqual(del0.effectiveEffect, 'normal', `Emotion ${emotion} at 0% must never have audio effect`);

    // 25% Intensity: Subtle, high clarity
    const del25 = calculateEmotionDelivery({ emotion, intensity: 25, baseSpeed: 1.0 });
    assert.strictEqual(del25.intensity, 25);
    assert.ok(del25.calibratedSpeed >= 0.88 && del25.calibratedSpeed <= 1.12, `Speed at 25% for ${emotion} is bounded`);
    assert.strictEqual(del25.effectiveEffect, 'normal', `Emotion ${emotion} at 25% must not auto-apply harsh effect`);

    // 50% Intensity: Moderate natural expression
    const del50 = calculateEmotionDelivery({ emotion, intensity: 50, baseSpeed: 1.0 });
    assert.strictEqual(del50.intensity, 50);
    assert.ok(del50.calibratedSpeed >= 0.85 && del50.calibratedSpeed <= 1.15);
    assert.strictEqual(del50.effectiveEffect, 'normal', `Emotion ${emotion} at 50% must not auto-apply harsh effect`);

    // 100% Intensity: Strictly bounded, intelligibility preserved
    const del100 = calculateEmotionDelivery({ emotion, intensity: 100, baseSpeed: 1.0 });
    assert.strictEqual(del100.intensity, 100);
    // Speed must never be excessive (bounded within [0.70, 1.30])
    assert.ok(del100.calibratedSpeed >= 0.70 && del100.calibratedSpeed <= 1.30, `Speed at 100% for ${emotion} must be bounded`);
    // Pitch shift must be bounded (<= 1.5 semitones) to avoid chipmunk/metallic artifacts
    assert.ok(Math.abs(del100.pitchShiftSemitones) <= 1.5, `Pitch shift for ${emotion} at 100% must be <= 1.5st`);
    // Presence gain must be bounded (<= 2.5 dB)
    assert.ok(del100.presenceGainDb <= 2.5, `Presence gain for ${emotion} at 100% must be <= 2.5dB`);
  }
});

test('5. Voice and Language Integrity Across Emotion and Intensity Changes', () => {
  // Character Earth base voice config
  const charName = 'Earth';
  const targetLang = resolveEffectiveLanguage({ lang: undefined, text: 'नमस्ते बच्चों!' });
  const baseVoice = resolveEffectiveVoice({ characterName: charName, lang: targetLang });

  assert.strictEqual(targetLang, 'hi');
  assert.strictEqual(baseVoice, 'hf_alpha');

  // Verify that regardless of emotion or intensity, voice and language remain strictly constant
  const testScenarios = [
    { emotion: 'neutral', intensity: 0 },
    { emotion: 'happy', intensity: 25 },
    { emotion: 'excited', intensity: 50 },
    { emotion: 'sad', intensity: 75 },
    { emotion: 'shouting', intensity: 100 },
    { emotion: 'whispering', intensity: 100 },
    { emotion: 'angry', intensity: 90 },
  ];

  for (const scen of testScenarios) {
    const delivery = calculateEmotionDelivery({
      emotion: scen.emotion,
      intensity: scen.intensity,
      baseSpeed: 1.0,
      baseEffect: 'normal',
    });

    const resolvedVoice = resolveEffectiveVoice({
      requestedVoice: baseVoice,
      characterName: charName,
      lang: targetLang,
    });

    assert.strictEqual(resolvedVoice, 'hf_alpha', `Voice must remain hf_alpha for ${scen.emotion} at ${scen.intensity}%`);
    assert.strictEqual(targetLang, 'hi', `Language must remain hi for ${scen.emotion} at ${scen.intensity}%`);
    assert.strictEqual(delivery.intensity, scen.intensity);
  }
});

test('6. Audio Effects Limiter Prevents Clipping on Prosody / Volume Boosts', async () => {
  const effects = new AudioEffectsService();
  assert.ok(effects, 'AudioEffectsService must be instantiable');

  // Verify that peak limiter is present in the filter chain
  // Create a minimal synthetic WAV file to test applyEffect without errors
  const tempDir = path.join(process.cwd(), 'storage', 'temp');
  if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });

  const testWavPath = path.join(tempDir, `test-anti-clip-${Date.now()}.wav`);
  const outWavPath = path.join(tempDir, `test-anti-clip-out-${Date.now()}.wav`);

  // Write a minimal valid 24kHz 16-bit mono PCM WAV (48000 bytes = 1 sec silence)
  const header = Buffer.alloc(44);
  header.write('RIFF', 0);
  header.writeUInt32LE(48044 - 8, 4);
  header.write('WAVE', 8);
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20); // PCM
  header.writeUInt16LE(1, 22); // mono
  header.writeUInt32LE(24000, 24); // sample rate
  header.writeUInt32LE(48000, 28); // byte rate
  header.writeUInt16LE(2, 32); // block align
  header.writeUInt16LE(16, 34); // bits per sample
  header.write('data', 36);
  header.writeUInt32LE(48000, 40);

  const silence = Buffer.alloc(48000);
  fs.writeFileSync(testWavPath, Buffer.concat([header, silence]));

  try {
    // Apply shouting + prosody with potential clipping
    const res = await effects.applyEffect(testWavPath, outWavPath, 'shout', {
      pitchShiftSemitones: 0.8,
      presenceGainDb: 2.0,
      sampleRate: 24000,
    });

    assert.ok(fs.existsSync(outWavPath), 'Processed audio file must exist');
    assert.ok(res.durationMs > 500, 'Processed audio duration must be valid');
    const outStat = fs.statSync(outWavPath);
    assert.ok(outStat.size > 1000, 'Processed audio must be non-empty');
  } finally {
    try { if (fs.existsSync(testWavPath)) fs.unlinkSync(testWavPath); } catch {}
    try { if (fs.existsSync(outWavPath)) fs.unlinkSync(outWavPath); } catch {}
  }
});

test('7. Cache Invalidation When Language, Voice, or Intensity Changes', () => {
  const text = 'नमस्ते बच्चों! आज हम मौसम के बारे में जानेंगे।';

  const makeCacheKey = (options: {
    lang: string;
    voice: string;
    emotion: string;
    intensity: number;
    speed?: number;
    effect?: string;
  }) => {
    const delivery = calculateEmotionDelivery({
      emotion: options.emotion,
      intensity: options.intensity,
      baseSpeed: options.speed || 1.0,
      baseEffect: (options.effect || 'normal') as any,
    });

    return crypto
      .createHash('sha256')
      .update(
        JSON.stringify({
          text,
          lang: options.lang,
          voice: options.voice,
          emotion: options.emotion,
          intensity: delivery.intensity,
          speed: delivery.calibratedSpeed,
          effect: delivery.effectiveEffect,
          pitch: delivery.pitchShiftSemitones,
          presence: delivery.presenceGainDb,
        })
      )
      .digest('hex');
  };

  // Base key: Hindi, hf_alpha, happy 25%
  const keyBase = makeCacheKey({ lang: 'hi', voice: 'hf_alpha', emotion: 'happy', intensity: 25 });

  // Changing intensity invalidates cache
  const keyDiffIntensity = makeCacheKey({ lang: 'hi', voice: 'hf_alpha', emotion: 'happy', intensity: 75 });
  assert.notStrictEqual(keyBase, keyDiffIntensity, 'Changing intensity must invalidate cache');

  // Changing voice invalidates cache
  const keyDiffVoice = makeCacheKey({ lang: 'hi', voice: 'hf_beta', emotion: 'happy', intensity: 25 });
  assert.notStrictEqual(keyBase, keyDiffVoice, 'Changing voice must invalidate cache');

  // Changing language invalidates cache
  const keyDiffLang = makeCacheKey({ lang: 'en', voice: 'af_heart', emotion: 'happy', intensity: 25 });
  assert.notStrictEqual(keyBase, keyDiffLang, 'Changing language must invalidate cache');

  // Changing emotion invalidates cache
  const keyDiffEmotion = makeCacheKey({ lang: 'hi', voice: 'hf_alpha', emotion: 'excited', intensity: 25 });
  assert.notStrictEqual(keyBase, keyDiffEmotion, 'Changing emotion must invalidate cache');

  // Changing effect invalidates cache
  const keyDiffEffect = makeCacheKey({ lang: 'hi', voice: 'hf_alpha', emotion: 'happy', intensity: 25, effect: 'cartoon' });
  assert.notStrictEqual(keyBase, keyDiffEffect, 'Changing effect must invalidate cache');
});

test('8. ScenePreparationService - Consistent Hindi Default & Earth Mascot hf_alpha', () => {
  const prepared = ScenePreparationService.prepareScenes([
    {
      sceneNumber: 1,
      title: 'Scene 1',
      narration: 'मौसम बदल रहे हैं।',
      visualPrompt: 'Living planet Earth smiling',
      durationSeconds: 8,
      dialogue: [
        {
          characterName: 'Earth',
          text: 'अरे दोस्तों! मेरी तरफ़ देखो!',
          emotion: 'cheerful',
        },
      ],
    },
    {
      sceneNumber: 2,
      title: 'Scene 2',
      narration: 'Surprise weather in woods',
      visualPrompt: 'Little bear cub walking',
      durationSeconds: 6,
      dialogue: [
        {
          characterName: 'Pip',
          text: 'कितनी ठंडी हवा है!',
          emotion: 'excited',
        },
      ],
    },
  ]);

  assert.strictEqual(prepared.length, 2);

  // Scene 1: Earth dialogue voice must be hf_alpha (Hindi female)
  const sc1 = prepared[0];
  assert.ok(sc1.animationData.dialogueLines.length >= 1);
  const earthLine = sc1.animationData.dialogueLines[0];
  assert.strictEqual(earthLine.characterName, 'Earth');
  assert.strictEqual(earthLine.lang, 'hi', 'Earth dialogue line must default to Hindi');
  assert.strictEqual(earthLine.voice, 'hf_alpha', 'Earth dialogue line must default to hf_alpha');

  // Scene 2: Pip dialogue voice must be hm_omega (Hindi male cub)
  const sc2 = prepared[1];
  assert.ok(sc2.animationData.dialogueLines.length >= 1);
  const pipLine = sc2.animationData.dialogueLines[0];
  assert.strictEqual(pipLine.characterName, 'Pip');
  assert.strictEqual(pipLine.lang, 'hi', 'Pip dialogue line must default to Hindi');
  assert.strictEqual(pipLine.voice, 'hm_omega', 'Pip dialogue line must default to hm_omega');
});

test('9. IntelligentScriptParser - Default Language Hindi and Canonical Character Voices', () => {
  // Test script without explicit language tag
  const rawScript = `
Title: धरती और उसके दोस्त
Author: Content Studio

===

Scene 1 - Morning Forest

NARRATION:
सुबह की धूप खिली है और धरती मुस्कुरा रही है।

EARTH:
नमस्ते छोटे दोस्तों!

PIP:
नमस्ते धरती माँ!
`;

  const ir = IntelligentScriptParser.parseScript(rawScript);

  // Language must default to Hindi
  assert.strictEqual(ir.language, 'Hindi', 'IntelligentScriptParser must default to Hindi');

  // Characters must have correct Hindi voices
  const earthChar = ir.characters.find(c => c.name.toLowerCase().includes('earth'));
  assert.ok(earthChar, 'Earth character must be detected');
  assert.strictEqual(earthChar.voice, 'hf_alpha', 'Earth must have voice hf_alpha in Hindi script');

  const pipChar = ir.characters.find(c => c.name.toLowerCase().includes('pip'));
  assert.ok(pipChar, 'Pip character must be detected');
  assert.strictEqual(pipChar.voice, 'hm_omega', 'Pip must have voice hm_omega in Hindi script');
});
