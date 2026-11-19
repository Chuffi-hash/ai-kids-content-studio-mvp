import test from 'node:test';
import assert from 'node:assert';
import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import {
  KokoroTTSProvider,
  KOKORO_VOICES_CATALOGUE,
} from '../src/services/audio-generation/kokoro-tts.provider.js';
import { isVoiceCompatibleWithLanguage } from '../src/services/audio-generation/language-resolver.service.js';

test('Kokoro Validation - Voice-Language compatibility runs before runtime availability checks', async () => {
  // Provider configured with mockAvailability: false to simulate a machine without Python/models
  const provider = new KokoroTTSProvider({ mockAvailability: false });

  // 1. Text required validation runs first
  await assert.rejects(
    async () => {
      await provider.generateSpeech('');
    },
    /Text is required for TTS speech synthesis/i,
    'Must reject empty text before checking runtime'
  );

  await assert.rejects(
    async () => {
      await provider.generateSpeech('   ');
    },
    /Text is required for TTS speech synthesis/i,
    'Must reject whitespace-only text before checking runtime'
  );

  // 2. Incompatible English voice for Hindi text must be rejected with voice validation error, NOT runtime error
  await assert.rejects(
    async () => {
      await provider.generateSpeech('नमस्ते बच्चों!', {
        voice: 'bm_daniel',
        lang: 'hi',
      });
    },
    /Kokoro voice "bm_daniel" does not support target language "hi"/i,
    'Must reject English voice bm_daniel for Hindi language even without Kokoro installed'
  );

  await assert.rejects(
    async () => {
      await provider.generateSpeech('नमस्ते बच्चों!', {
        voice: 'af_heart',
        lang: 'hi',
      });
    },
    /Kokoro voice "af_heart" does not support target language "hi"/i,
    'Must reject English voice af_heart for Hindi language even without Kokoro installed'
  );

  // 3. Incompatible Hindi voice for English text must be rejected with voice validation error, NOT runtime error
  await assert.rejects(
    async () => {
      await provider.generateSpeech('Welcome to the story studio!', {
        voice: 'hf_alpha',
        lang: 'en',
      });
    },
    /Kokoro voice "hf_alpha" does not support target language "en"/i,
    'Must reject Hindi voice hf_alpha for English language even without Kokoro installed'
  );

  // 4. Valid language-voice combination when runtime is unavailable must clearly report runtime unavailability
  await assert.rejects(
    async () => {
      await provider.generateSpeech('नमस्ते बच्चों!', {
        voice: 'hf_alpha',
        lang: 'hi',
      });
    },
    /Kokoro-82M runtime is not available: python packages or models not found/i,
    'Valid voice-language combination should throw clear runtime error when Kokoro is not installed'
  );
});

test('Kokoro Validation - Voice compatibility matrix for all 32 voices', () => {
  // 4 Hindi voices
  const hindiVoiceIds = ['hf_alpha', 'hf_beta', 'hm_omega', 'hm_psi'];
  for (const v of hindiVoiceIds) {
    assert.strictEqual(
      isVoiceCompatibleWithLanguage(v, 'hi'),
      true,
      `Hindi voice ${v} must be compatible with language 'hi'`
    );
    assert.strictEqual(
      isVoiceCompatibleWithLanguage(v, 'en'),
      false,
      `Hindi voice ${v} must NOT be compatible with language 'en'`
    );
  }

  // 28 English voices
  const englishVoiceIds = KOKORO_VOICES_CATALOGUE
    .filter(v => !hindiVoiceIds.includes(v.id))
    .map(v => v.id);

  assert.strictEqual(englishVoiceIds.length, 28, 'Must have 28 English voices');

  for (const v of englishVoiceIds) {
    assert.strictEqual(
      isVoiceCompatibleWithLanguage(v, 'en'),
      true,
      `English voice ${v} must be compatible with language 'en'`
    );
    assert.strictEqual(
      isVoiceCompatibleWithLanguage(v, 'hi'),
      false,
      `English voice ${v} must NOT be compatible with language 'hi'`
    );
  }
});

test('Kokoro Test Seam - Injectable inference runner simulates synthesis without models', async () => {
  const provider = new KokoroTTSProvider({ mockAvailability: false });

  let runnerInvoked = false;
  let passedParams: any = null;

  provider.setInferenceRunner(async (params) => {
    runnerInvoked = true;
    passedParams = params;

    // Write a minimal valid 24kHz WAV file to the requested outputFile
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

    const pcm = Buffer.alloc(48000);
    fs.writeFileSync(params.outputFile, Buffer.concat([header, pcm]));

    return {
      success: true,
      sampleRate: 24000,
    };
  });

  const res = await provider.generateSpeech('नमस्ते बच्चों! आज हम कुछ नया सीखेंगे।', {
    voice: 'hf_alpha',
    lang: 'hi',
    speed: 1.2,
    effect: 'normal',
    sentencePause: 0.3,
    clausePause: 0.15,
  });

  assert.strictEqual(runnerInvoked, true, 'Injectable runner must be invoked');
  assert.strictEqual(passedParams.voice, 'hf_alpha');
  assert.strictEqual(passedParams.speed, 1.2);
  assert.strictEqual(passedParams.lang, 'hi');
  assert.strictEqual(passedParams.sentencePause, 0.3);
  assert.strictEqual(passedParams.clausePause, 0.15);

  assert.ok(res.audioBuffer instanceof Buffer, 'Must return audioBuffer Buffer');
  assert.strictEqual(res.format, 'wav');
  assert.strictEqual(res.voice, 'hf_alpha');
  assert.strictEqual(res.sampleRate, 24000);
  assert.strictEqual(res.provider, 'kokoro');
});

test('Kokoro Catalogue - Exposes all 32 voices even when runtime is unavailable', async () => {
  const provider = new KokoroTTSProvider({ mockAvailability: false });
  const voices = await provider.getSupportedVoices();

  assert.strictEqual(voices.length, 32, 'Catalogue must provide all 32 voices');
  assert.strictEqual(voices.filter(v => v.lang === 'hi').length, 4);
  assert.strictEqual(voices.filter(v => v.lang.startsWith('en')).length, 28);
});
