import test from 'node:test';
import assert from 'node:assert';
import 'dotenv/config';
import {
  FishAudioProvider,
  DEFAULT_FISH_MODEL,
  DEFAULT_FISH_VOICES,
  validateFreeModelPolicy,
  isKokoroVoiceId,
  parseApiKeys
} from '../src/services/audio-generation/providers/fish-audio.provider.js';
import {
  composeFishAudioText,
  stripDirectionTags,
  normalizeFishIntensity,
  FISH_DIRECTION_TAG_MAP
} from '../src/services/audio-generation/fish-emotion-composer.js';
import { TTSProviderFactory } from '../src/services/audio-generation/tts-provider.factory.js';

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
        voice: 'fish_default'
      });
    },
    /API key is not configured/i,
    'Should throw clear missing key error'
  );
});

test('Fish Audio - Honest Voice Catalogue & Dynamic Account Models', async () => {
  const provider = new FishAudioProvider({ apiKey: 'mock-key' });
  const voices = await provider.getVoices();

  assert.ok(Array.isArray(voices), 'Voices should be an array');
  assert.ok(voices.length >= 1, 'Should provide at least the honest default voice');

  // The primary voice must be the honest fish_default
  const defaultVoice = voices.find(v => v.id === 'fish_default');
  assert.ok(defaultVoice, 'Should include fish_default');
  assert.strictEqual(defaultVoice?.name, 'Fish Audio Default Voice');
  assert.strictEqual(defaultVoice?.lang, 'hi');

  // Fictional voice names must be eliminated
  assert.strictEqual(voices.some(v => v.id === 'fish_hi_aarav'), false, 'Fictional voice fish_hi_aarav must not exist');
  assert.strictEqual(voices.some(v => v.id === 'fish_hi_ananya'), false, 'Fictional voice fish_hi_ananya must not exist');
  assert.strictEqual(voices.some(v => v.id === 'fish_en_oliver'), false, 'Fictional voice fish_en_oliver must not exist');
  assert.strictEqual(voices.some(v => v.id === 'fish_en_lily'), false, 'Fictional voice fish_en_lily must not exist');

  // Verify dynamic user models merge from GET /model?self=true
  const originalFetch = global.fetch;
  try {
    global.fetch = async (url: any) => {
      if (url.toString().includes('/model?self=true')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            items: [
              {
                _id: '7f938b826433434f853c822663116cd3',
                title: 'Storyteller Grandpa',
                tags: ['male', 'storytelling'],
                languages: ['hi'],
                description: 'Gentle grandfather storytelling voice'
              }
            ]
          })
        } as any;
      }
      return { ok: false, status: 404 } as any;
    };

    const providerWithCustom = new FishAudioProvider({ apiKey: 'test-custom-key' });
    const customVoices = await providerWithCustom.getSupportedVoices();
    assert.ok(customVoices.length >= 2, 'Should include presets and custom model');
    assert.ok(customVoices.some(v => v.id === '7f938b826433434f853c822663116cd3'), 'Should include custom voice ID');
  } finally {
    global.fetch = originalFetch;
  }
});

test('Fish Audio - Cross-Provider Isolation & Voice ID Handling', async () => {
  // Kokoro voice ID detection
  assert.strictEqual(isKokoroVoiceId('hf_alpha'), true, 'hf_alpha is Kokoro voice');
  assert.strictEqual(isKokoroVoiceId('hf_beta'), true, 'hf_beta is Kokoro voice');
  assert.strictEqual(isKokoroVoiceId('hm_omega'), true, 'hm_omega is Kokoro voice');
  assert.strictEqual(isKokoroVoiceId('af_heart'), true, 'af_heart is Kokoro voice');
  assert.strictEqual(isKokoroVoiceId('bm_george'), true, 'bm_george is Kokoro voice');
  assert.strictEqual(isKokoroVoiceId('fish_default'), false, 'fish_default is NOT Kokoro voice');
  assert.strictEqual(isKokoroVoiceId('7f938b826433434f853c822663116cd3'), false, 'Hex ID is NOT Kokoro voice');
  assert.strictEqual(isKokoroVoiceId(undefined), false);

  const originalFetch = global.fetch;
  let capturedPayload: any = null;

  try {
    global.fetch = async (_url: any, init: any) => {
      capturedPayload = JSON.parse(init.body);
      return {
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'audio/mpeg' }),
        arrayBuffer: async () => Buffer.from('MOCK-MP3-BUFFER').buffer
      } as any;
    };

    const provider = new FishAudioProvider({ apiKey: 'test-key' });

    // 1. When a Kokoro voice ID is passed to Fish Audio, reference_id must be omitted
    await provider.generateSpeech('नमस्ते', { voice: 'hf_alpha' });
    assert.strictEqual(capturedPayload.reference_id, undefined, 'Kokoro voice ID must NEVER be passed as reference_id');

    // 2. When 'fish_default' is passed, reference_id must be omitted
    await provider.generateSpeech('नमस्ते', { voice: 'fish_default' });
    assert.strictEqual(capturedPayload.reference_id, undefined, 'fish_default must omit reference_id');

    // 3. When a verified custom model hex ID is passed, reference_id must be included
    await provider.generateSpeech('नमस्ते', { voice: '7f938b826433434f853c822663116cd3' });
    assert.strictEqual(capturedPayload.reference_id, '7f938b826433434f853c822663116cd3', 'Custom hex ID must be passed as reference_id');
  } finally {
    global.fetch = originalFetch;
  }
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
    intensity: 0.15
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
    intensity: 0.15
  });
  assert.strictEqual(reassuringRes.composedText, '[reassuring] डरने की कोई बात नहीं है।');
  assert.strictEqual(reassuringRes.appliedTag, '[reassuring]');

  const curiousRes = composeFishAudioText('गुफा के अंदर क्या हो सकता है?', {
    emotion: 'curious',
    intensity: 0.15
  });
  assert.strictEqual(curiousRes.composedText, '[inquisitive] गुफा के अंदर क्या हो सकता है?');
  assert.strictEqual(curiousRes.appliedTag, '[inquisitive]');

  // 4. Shouting and angry are softened to emphasis/firm to avoid exaggerated theatrical screams
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
    intensity: 0.15
  });
  // Should replace with the restrained tag [warm], not produce [[excited] [warm]...]
  assert.strictEqual(alreadyTagged.composedText, '[warm] यह अद्भुत है!');

  // 6. Stripping direction tags for visemes / subtitles
  const stripped = stripDirectionTags('[warm] नमस्ते दोस्तों, आज हम खेलेंगे।');
  assert.strictEqual(stripped, 'नमस्ते दोस्तों, आज हम खेलेंगे।');

  const strippedMultiple = stripDirectionTags('[soft] [near-whisper] धीरे बोलो');
  assert.strictEqual(strippedMultiple, 'धीरे बोलो');
});

test('Fish Audio - Prosody Speed Control', async () => {
  const originalFetch = global.fetch;
  let capturedPayload: any = null;

  try {
    global.fetch = async (_url: any, init: any) => {
      capturedPayload = JSON.parse(init.body);
      return {
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'audio/mpeg' }),
        arrayBuffer: async () => Buffer.from('MOCK-MP3-BUFFER').buffer
      } as any;
    };

    const provider = new FishAudioProvider({ apiKey: 'test-key' });

    // Speed 1.25 -> prosody.speed === 1.25
    await provider.generateSpeech('नमस्ते', { speed: 1.25 });
    assert.deepStrictEqual(capturedPayload.prosody, { speed: 1.25 }, 'Should send prosody speed for 1.25');

    // Speed 1.0 (default) -> no prosody field needed
    await provider.generateSpeech('नमस्ते', { speed: 1.0 });
    assert.strictEqual(capturedPayload.prosody, undefined, 'Speed 1.0 should omit prosody');

    // Speed clamped between 0.5 and 2.0
    await provider.generateSpeech('नमस्ते', { speed: 3.5 });
    assert.deepStrictEqual(capturedPayload.prosody, { speed: 2.0 }, 'Speed > 2.0 should clamp to 2.0');

    await provider.generateSpeech('नमस्ते', { speed: 0.2 });
    assert.deepStrictEqual(capturedPayload.prosody, { speed: 0.5 }, 'Speed < 0.5 should clamp to 0.5');
  } finally {
    global.fetch = originalFetch;
  }
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
      voice: 'fish_default',
      emotion: 'happy',
      emotionIntensity: 15
    });

    assert.ok(result.audioBuffer, 'Should return audioBuffer');
    assert.strictEqual(result.format, 'mp3');
    assert.ok(result.durationMs > 0, 'Should estimate/probe durationMs');

    // 2. Rate limit (429 Too Many Requests) - fails cleanly without spinning
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
      'Should report rate limit on HTTP 429 immediately without retry spinning'
    );

    // 3. Auth failure (401 Unauthorized) - fails cleanly without spinning
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
      'Should report authentication error on HTTP 401 without retry spinning'
    );

    // 4. Timeout handling with AbortController
    global.fetch = async (_url: any, init: any) => {
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

test('Fish Audio - Multi-Key Parsing and Sanitization', () => {
  const parsed1 = parseApiKeys('key1, key2 , key3');
  assert.deepStrictEqual(parsed1, ['key1', 'key2', 'key3']);

  const parsed2 = parseApiKeys('keyA\nkeyB;keyC');
  assert.deepStrictEqual(parsed2, ['keyA', 'keyB', 'keyC']);

  const parsed3 = parseApiKeys(['keyX', 'keyY']);
  assert.deepStrictEqual(parsed3, ['keyX', 'keyY']);

  const empty = parseApiKeys('');
  assert.deepStrictEqual(empty, []);
});

test('TTS Provider Factory - Coexistence of Kokoro-82M and Fish Audio', async () => {
  const origIsAvail = (TTSProviderFactory as any).kokoroProvider.isAvailable;
  (TTSProviderFactory as any).kokoroProvider.isAvailable = async () => true;
  try {
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
    assert.ok(catalogue.fishAudioVoices.some(v => v.id === 'fish_default'), 'Should include honest fish_default');

    // 4. Provider list includes fish_audio and kokoro
    assert.ok(catalogue.providers.some(p => p.id === 'fish_audio'), 'Providers array should include fish_audio');
    assert.ok(catalogue.providers.some(p => p.id === 'kokoro'), 'Providers array should include kokoro');
  } finally {
    (TTSProviderFactory as any).kokoroProvider.isAvailable = origIsAvail;
  }
});
