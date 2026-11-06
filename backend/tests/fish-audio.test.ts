import test from 'node:test';
import assert from 'node:assert';
import 'dotenv/config';
import {
  FishAudioProvider,
  FREE_FISH_AUDIO_MODEL,
  DEFAULT_FISH_VOICES,
  validateFreeModelPolicy
} from '../src/services/audio-generation/providers/fish-audio.provider.js';
import {
  composeFishAudioText,
  stripDirectionTags,
  normalizeFishIntensity,
  FISH_DIRECTION_TAG_MAP
} from '../src/services/audio-generation/fish-emotion-composer.js';
import { TTSProviderFactory } from '../src/services/audio-generation/tts-provider.factory.js';
import { AudioGenerationService } from '../src/services/audio-generation/audio-generation.service.js';

test('Fish Audio - Free-Model Policy Enforcement', () => {
  // s2.1-pro-free must pass validation
  assert.doesNotThrow(() => {
    validateFreeModelPolicy('s2.1-pro-free');
  }, 's2.1-pro-free should be accepted without throwing');

  // undefined/null should default or pass if free model is used
  assert.doesNotThrow(() => {
    validateFreeModelPolicy(undefined);
  });

  // Paid model s2.1-pro must throw free-model policy violation
  assert.throws(
    () => {
      validateFreeModelPolicy('s2.1-pro');
    },
    /Free-model policy violation/i,
    'Should reject paid model s2.1-pro'
  );

  assert.throws(
    () => {
      validateFreeModelPolicy('s1');
    },
    /Free-model policy violation/i,
    'Should reject older/paid model s1'
  );

  assert.throws(
    () => {
      validateFreeModelPolicy('fish-speech-1.5');
    },
    /Free-model policy violation/i,
    'Should reject non-free models'
  );
});

test('Fish Audio - Availability and Missing API Key Handling', async () => {
  const providerWithoutKey = new FishAudioProvider({ apiKey: '' });
  assert.strictEqual(await providerWithoutKey.isAvailable(), false, 'Should be unavailable when apiKey is empty');

  // Attempting to generate speech without key should reject with a clear error
  await assert.rejects(
    async () => {
      await providerWithoutKey.generateSpeech('नमस्ते बच्चों', {
        voiceId: 'fish_hi_aarav'
      });
    },
    /API key is not configured/i,
    'Should throw clear missing key error'
  );
});

test('Fish Audio - Curated Storytelling Voices Catalogue', async () => {
  const provider = new FishAudioProvider({ apiKey: 'mock-key' });
  const voices = await provider.getVoices();

  assert.ok(Array.isArray(voices), 'Voices should be an array');
  assert.ok(voices.length >= 8, 'Should provide at least 8 curated voices');

  // Verify Hindi voices
  const hindiVoices = voices.filter(v => v.lang === 'hi' || v.lang.startsWith('hi-'));
  assert.ok(hindiVoices.length >= 4, 'Should include at least 4 Hindi voices');
  assert.ok(hindiVoices.some(v => v.id === 'fish_hi_aarav'), 'Should include fish_hi_aarav');
  assert.ok(hindiVoices.some(v => v.id === 'fish_hi_ananya'), 'Should include fish_hi_ananya');

  // Verify English voices
  const englishVoices = voices.filter(v => v.lang === 'en' || v.lang.startsWith('en-'));
  assert.ok(englishVoices.length >= 4, 'Should include at least 4 English voices');
  assert.ok(englishVoices.some(v => v.id === 'fish_en_oliver'), 'Should include fish_en_oliver');
  assert.ok(englishVoices.some(v => v.id === 'fish_en_lily'), 'Should include fish_en_lily');
});

test('Fish Audio - Restrained Emotion Delivery & Tag Composition', () => {
  // 1. Default neutral delivery (no tag)
  const neutralRes = composeFishAudioText('नमस्ते, आप कैसे हैं?');
  assert.strictEqual(neutralRes.composedText, 'नमस्ते, आप कैसे हैं?');
  assert.strictEqual(neutralRes.appliedTag, null);

  // 2. Intensity < 0.15 gives no tag even if emotion is happy
  const lowIntensityRes = composeFishAudioText('बहुत बढ़िया!', {
    emotion: 'happy',
    intensity: 0.10
  });
  assert.strictEqual(lowIntensityRes.composedText, 'बहुत बढ़िया!');
  assert.strictEqual(lowIntensityRes.appliedTag, null);

  // 3. Emotion with intensity >= 0.15 prepends at most one restrained tag
  const warmRes = composeFishAudioText('चलो एक नई कहानी सुनते हैं।', {
    emotion: 'happy',
    intensity: 0.20
  });
  assert.strictEqual(warmRes.composedText, '[warm] चलो एक नई कहानी सुनते हैं।');
  assert.strictEqual(warmRes.appliedTag, '[warm]');

  const softRes = composeFishAudioText('वह थोड़ा उदास था।', {
    emotion: 'sad',
    intensity: 0.15
  });
  assert.strictEqual(softRes.composedText, '[soft] वह थोड़ा उदास था।');
  assert.strictEqual(softRes.appliedTag, '[soft]');

  const reassuringRes = composeFishAudioText('डरने की कोई बात नहीं है।', {
    emotion: 'reassuring',
    intensity: 0.25
  });
  assert.strictEqual(reassuringRes.composedText, '[reassuring] डरने की कोई बात नहीं है।');
  assert.strictEqual(reassuringRes.appliedTag, '[reassuring]');

  const curiousRes = composeFishAudioText('गुफा के अंदर क्या हो सकता है?', {
    emotion: 'curious',
    intensity: 0.30
  });
  assert.strictEqual(curiousRes.composedText, '[inquisitive] गुफा के अंदर क्या हो सकता है?');
  assert.strictEqual(curiousRes.appliedTag, '[inquisitive]');

  // 4. Shouting and angry are softened to emphasis/tense to avoid exaggerated theatrical screams
  const shoutRes = composeFishAudioText('रुको वहां!', {
    emotion: 'shouting',
    intensity: 0.50
  });
  assert.strictEqual(shoutRes.appliedTag, '[emphasis]', 'Shouting should map to restrained [emphasis]');

  const angryRes = composeFishAudioText('यह गलत है।', {
    emotion: 'angry',
    intensity: 0.40
  });
  assert.strictEqual(angryRes.appliedTag, '[firm]', 'Angry should map to restrained [firm]');

  // 5. Existing tags in text are normalized and never duplicated
  const alreadyTagged = composeFishAudioText('[excited] यह अद्भुत है!', {
    emotion: 'happy',
    intensity: 0.20
  });
  // Should replace with the restrained tag [warm], not produce [[excited] [warm]...]
  assert.strictEqual(alreadyTagged.composedText, '[warm] यह अद्भुत है!');

  // 6. Stripping direction tags for visemes / subtitles
  const stripped = stripDirectionTags('[warm] नमस्ते दोस्तों, आज हम खेलेंगे।');
  assert.strictEqual(stripped, 'नमस्ते दोस्तों, आज हम खेलेंगे।');

  const strippedMultiple = stripDirectionTags('[soft] [near-whisper] धीरे बोलो');
  assert.strictEqual(strippedMultiple, 'धीरे बोलो');
});

test('Fish Audio - HTTP Mocking: 200 Success, Rate Limit, Auth Failure & Timeout', async () => {
  const originalFetch = global.fetch;

  try {
    // 1. Success response (200 OK)
    const mockAudioBytes = Buffer.from('FAKE-MP3-AUDIO-DATA-STREAM');
    global.fetch = async (url: any, init: any) => {
      assert.strictEqual(url.toString(), 'https://api.fish.audio/v1/tts');
      assert.strictEqual(init.method, 'POST');
      assert.strictEqual(init.headers['model'], 's2.1-pro-free', 'Must send s2.1-pro-free model header');
      assert.strictEqual(init.headers['Authorization'], 'Bearer test-valid-key');

      const body = JSON.parse(init.body);
      assert.ok(body.text, 'Body should have text');
      assert.strictEqual(body.format, 'mp3');

      return {
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'audio/mpeg' }),
        arrayBuffer: async () => mockAudioBytes.buffer
      } as any;
    };

    const provider = new FishAudioProvider({ apiKey: 'test-valid-key' });
    const result = await provider.generateSpeech('नमस्ते दुनिया', {
      voiceId: 'fish_hi_aarav',
      emotion: 'happy',
      intensity: 0.20
    });

    assert.ok(result.audioBuffer, 'Should return audioBuffer');
    assert.strictEqual(result.format, 'mp3');
    assert.ok(result.durationMs > 0, 'Should estimate/probe durationMs');

    // 2. Rate limit (429 Too Many Requests)
    global.fetch = async () => {
      return {
        ok: false,
        status: 429,
        text: async () => 'Rate limit exceeded for free tier. Try again in a moment.'
      } as any;
    };

    await assert.rejects(
      async () => {
        await provider.generateSpeech('नमस्ते');
      },
      /rate limit/i,
      'Should report rate limit on HTTP 429'
    );

    // 3. Auth failure (401 Unauthorized)
    global.fetch = async () => {
      return {
        ok: false,
        status: 401,
        text: async () => 'Unauthorized: Invalid API key'
      } as any;
    };

    await assert.rejects(
      async () => {
        await provider.generateSpeech('नमस्ते');
      },
      /authentication failed/i,
      'Should report authentication error on HTTP 401'
    );

    // 4. Timeout handling
    global.fetch = async (_url: any, init: any) => {
      // Simulate abort triggered by signal
      const signal = init?.signal as AbortSignal;
      return new Promise((_, reject) => {
        if (signal?.aborted) {
          const err = new Error('The operation was aborted');
          err.name = 'AbortError';
          return reject(err);
        }
        signal?.addEventListener('abort', () => {
          const err = new Error('The operation was aborted');
          err.name = 'AbortError';
          reject(err);
        });
      });
    };

    const shortTimeoutProvider = new FishAudioProvider({
      apiKey: 'test-key',
      timeoutMs: 50 // 50ms quick timeout
    });

    await assert.rejects(
      async () => {
        await shortTimeoutProvider.generateSpeech('नमस्ते');
      },
      /timed out|timeout/i,
      'Should throw timeout error when request exceeds timeoutMs'
    );
  } finally {
    global.fetch = originalFetch;
  }
});

test('TTS Provider Factory - Coexistence of Kokoro-82M and Fish Audio', async () => {
  // 1. Get Kokoro provider
  const kokoro = await TTSProviderFactory.getProvider('kokoro');
  assert.strictEqual(kokoro.name, 'kokoro');

  // 2. Get Fish Audio provider
  const fish = await TTSProviderFactory.getProvider('fish_audio');
  assert.strictEqual(fish.name, 'fish_audio');

  // 3. Catalogue includes both Kokoro 32 voices and Fish Audio voices
  const catalogue = await TTSProviderFactory.getAllVoices();
  assert.ok(catalogue.voices.length >= 32, 'Must preserve at least 32 Kokoro voices');
  assert.ok(Array.isArray(catalogue.fishAudioVoices), 'Should include fishAudioVoices list');
  assert.ok(catalogue.fishAudioVoices.length >= 8, 'Should include at least 8 Fish Audio voices');

  // 4. Provider list includes fish_audio
  assert.ok(catalogue.providers.some(p => p.id === 'fish_audio'), 'Providers array should include fish_audio');
  assert.ok(catalogue.providers.some(p => p.id === 'kokoro'), 'Providers array should include kokoro');
});

