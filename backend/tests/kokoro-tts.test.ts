import test from 'node:test';
import assert from 'node:assert';
import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';
import { TTSProviderFactory } from '../src/services/audio-generation/tts-provider.factory.js';
import { KokoroTTSProvider } from '../src/services/audio-generation/kokoro-tts.provider.js';
import { GoogleTTSProvider } from '../src/services/audio-generation/google-tts.provider.js';
import { AudioEffectsService } from '../src/services/audio-generation/audio-effects.service.js';
import { AudioGenerationService } from '../src/services/audio-generation/audio-generation.service.js';
import {
  createStory,
  createScene,
  getSceneBySceneId,
  deleteStory
} from '../src/services/database/database.service.js';

test('TTS Provider Factory - Voice Catalogue and Provider Resolution', async () => {
  const catalogue = await TTSProviderFactory.getAllVoices();
  assert.ok(Array.isArray(catalogue.voices), 'Voices should be an array');
  assert.strictEqual(catalogue.voices.length, 27, 'Should provide 27 Kokoro voices catalogue');

  const bella = catalogue.voices.find(v => v.id === 'af_bella');
  assert.ok(bella, 'Should contain af_bella');
  assert.strictEqual(bella.gender, 'female');
  assert.strictEqual(bella.lang, 'en-us');

  const nicole = catalogue.voices.find(v => v.id === 'af_nicole');
  assert.ok(nicole, 'Should contain af_nicole with whisper trait');
  assert.ok(
    nicole.name.toLowerCase().includes('whisper'),
    'Nicole should have whisper trait in name description'
  );

  const george = catalogue.voices.find(v => v.id === 'bm_george');
  assert.ok(george, 'Should contain bm_george (British male)');
  assert.strictEqual(george.lang, 'en-gb');

  // Verify effect types
  assert.ok(Array.isArray(catalogue.effects), 'Effects should be an array');
  assert.ok(catalogue.effects.some(e => e.id === 'robot'), 'Should support robot effect');
  assert.ok(catalogue.effects.some(e => e.id === 'cartoon'), 'Should support cartoon effect');

  // Provider resolution
  const kokoroProvider = await TTSProviderFactory.getProvider('kokoro');
  assert.strictEqual(kokoroProvider.name, 'kokoro');

  const googleProvider = await TTSProviderFactory.getProvider('google');
  assert.strictEqual(googleProvider.name, 'google');

  const defaultProvider = await TTSProviderFactory.getProvider('auto');
  assert.ok(defaultProvider, 'Auto provider should resolve');
  if (catalogue.isKokoroAvailable) {
    assert.strictEqual(defaultProvider.name, 'kokoro');
  }
});

test('Kokoro-82M TTS Provider - Speech Generation & Speed Control', async () => {
  const kokoroProvider = new KokoroTTSProvider();
  const available = await kokoroProvider.isAvailable();
  if (!available) {
    console.log('[Test Skip] Kokoro model or python runtime not available; skipping local inference test');
    return;
  }

  // Test 1: Standard generation
  const resNormal = await kokoroProvider.generateSpeech(
    'Welcome to the wonder forest!',
    {
      voice: 'af_heart',
      speed: 1.0,
      lang: 'en-us'
    }
  );

  assert.ok(resNormal.audioBuffer instanceof Buffer, 'Should return a Buffer');
  assert.ok(resNormal.audioBuffer.length > 1000, 'Audio buffer should have content');
  assert.strictEqual(resNormal.format, 'wav', 'Kokoro outputs 24kHz WAV');
  assert.ok(resNormal.durationMs > 500 && resNormal.durationMs < 5000, `DurationMs should be sensible: ${resNormal.durationMs}ms`);

  // Test 2: Speed adjustment
  const resFast = await kokoroProvider.generateSpeech(
    'Welcome to the wonder forest!',
    {
      voice: 'af_heart',
      speed: 1.5,
      lang: 'en-us'
    }
  );

  assert.ok(
    resFast.durationMs < resNormal.durationMs,
    `Fast speech (${resFast.durationMs}ms) should be shorter than normal speech (${resNormal.durationMs}ms)`
  );
});

test('Audio Effects Service - Robot and Cartoon Creature Audio Post-Processing', async () => {
  const audioEffects = new AudioEffectsService();
  const kokoroProvider = new KokoroTTSProvider();
  const available = await kokoroProvider.isAvailable();

  const tempDir = path.join(process.cwd(), 'storage', 'temp');
  if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir, { recursive: true });
  }

  const baseWavPath = path.join(tempDir, `test-base-${Date.now()}.wav`);
  const robotWavPath = path.join(tempDir, `test-robot-${Date.now()}.wav`);
  const cartoonWavPath = path.join(tempDir, `test-cartoon-${Date.now()}.wav`);

  if (available) {
    const raw = await kokoroProvider.generateSpeech('Greetings traveler, I am unit 42.', {
      voice: 'am_adam',
      speed: 1.0,
    });
    fs.writeFileSync(baseWavPath, raw.audioBuffer);
  } else {
    // Generate simple sine tone WAV with header
    const sampleRate = 24000;
    const durationSec = 1;
    const numSamples = sampleRate * durationSec;
    const buffer = Buffer.alloc(44 + numSamples * 2);
    // Write standard 44-byte WAV header
    buffer.write('RIFF', 0);
    buffer.writeUInt32LE(36 + numSamples * 2, 4);
    buffer.write('WAVE', 8);
    buffer.write('fmt ', 12);
    buffer.writeUInt32LE(16, 16);
    buffer.writeUInt16LE(1, 20); // PCM
    buffer.writeUInt16LE(1, 22); // Mono
    buffer.writeUInt32LE(sampleRate, 24);
    buffer.writeUInt32LE(sampleRate * 2, 28);
    buffer.writeUInt16LE(2, 32);
    buffer.writeUInt16LE(16, 34);
    buffer.write('data', 36);
    buffer.writeUInt32LE(numSamples * 2, 40);
    fs.writeFileSync(baseWavPath, buffer);
  }

  // 1. Robot effect
  const robotResult = await audioEffects.applyEffect(baseWavPath, robotWavPath, 'robot');
  assert.ok(fs.existsSync(robotResult.outputPath), 'Robot output file must exist');
  const robotStats = fs.statSync(robotResult.outputPath);
  assert.ok(robotStats.size > 1000, 'Robot audio should not be empty');
  assert.ok(robotResult.durationMs > 0, 'Robot duration should be positive');

  // 2. Cartoon Creature effect
  const cartoonResult = await audioEffects.applyEffect(baseWavPath, cartoonWavPath, 'cartoon');
  assert.ok(fs.existsSync(cartoonResult.outputPath), 'Cartoon output file must exist');
  const cartoonStats = fs.statSync(cartoonResult.outputPath);
  assert.ok(cartoonStats.size > 1000, 'Cartoon audio should not be empty');
  assert.ok(cartoonResult.durationMs > 0, 'Cartoon duration should be positive');

  // Cleanup temp files
  try {
    if (fs.existsSync(baseWavPath)) fs.unlinkSync(baseWavPath);
    if (fs.existsSync(robotWavPath)) fs.unlinkSync(robotWavPath);
    if (fs.existsSync(cartoonWavPath)) fs.unlinkSync(cartoonWavPath);
  } catch {}
});

test('Audio Generation Service - Voice Preview and Narration Generation with Persistence', async () => {
  const audioGen = new AudioGenerationService();

  // Test Voice Preview
  const preview = await audioGen.previewVoice({
    voice: 'af_bella',
    speed: 1.1,
    effect: 'cartoon'
  });

  assert.ok(preview.audioUrl, 'Preview should return an audioUrl');
  assert.ok(preview.audioUrl.startsWith('/storage/audio/preview-'), 'Preview should be storage URL');
  assert.ok(preview.durationMs > 0, 'Preview should report durationMs');

  // Clean up preview file
  try {
    const relPreview = preview.audioUrl.replace(/^\//, '');
    const absPreview = path.join(process.cwd(), relPreview);
    if (fs.existsSync(absPreview)) fs.unlinkSync(absPreview);
  } catch {}

  // Test Scene Voice Generation and DB Persistence
  const storyId = `test-story-${randomUUID().slice(0, 8)}`;
  const story = await createStory({
    storyId,
    title: 'Kokoro Audio Test Story',
    logline: 'A little blue robot danced through the sunflower valley.',
  });

  const sceneId = `test-scene-${randomUUID().slice(0, 8)}`;
  await createScene({
    id: randomUUID(),
    sceneId,
    storyId: story.storyId,
    title: 'Scene 1',
    number: 1,
    order: 1,
    startMs: 0,
    endMs: 3000,
    narration: 'A little blue robot danced through the sunflower valley.',
    visualPrompt: 'A small friendly robot',
    cameraDirection: 'Wide',
  });

  const updatedScene = await audioGen.generateNarrationAudio({
    sceneId,
    narration: 'A little blue robot danced through the sunflower valley.',
    provider: 'kokoro',
    voice: 'bm_daniel',
    speed: 1.0,
    effect: 'robot'
  });

  assert.ok(updatedScene.audioUrl, 'Scene audioUrl should be populated');
  assert.ok(updatedScene.audioUrl.includes('.wav') || updatedScene.audioUrl.includes('.mp3'), 'AudioUrl should link to audio file');
  assert.ok(updatedScene.durationMs > 0, 'Scene duration should be synced to audio duration');

  // Verify DB state persisted
  const dbScene = await getSceneBySceneId(sceneId);
  assert.strictEqual(dbScene?.audioUrl, updatedScene.audioUrl, 'DB audioUrl matches updated scene');

  // Verify raw audio and processed audio storage
  const relPath = updatedScene.audioUrl.replace(/^\//, '');
  const absAudioPath = path.join(process.cwd(), relPath);
  assert.ok(fs.existsSync(absAudioPath), `Persisted audio file exists on disk: ${absAudioPath}`);

  // Clean up test story & test audio file
  await deleteStory(story.storyId);
  try {
    if (fs.existsSync(absAudioPath)) fs.unlinkSync(absAudioPath);
  } catch {}
});

