import test from 'node:test';
import assert from 'node:assert';
import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { KokoroTTSProvider } from '../src/services/audio-generation/kokoro-tts.provider.js';
import { runAuditionSamples } from './run-audition-samples.js';

test('Kokoro-82M Dedicated Integration Test - Real Model Inference & Hindi Audition', async () => {
  const provider = new KokoroTTSProvider();
  const available = await provider.isAvailable();

  if (!available) {
    console.log('[Kokoro Integration] Kokoro-82M runtime / models not installed in this environment. Skipping real inference integration tests.');
    return;
  }

  console.log('[Kokoro Integration] Kokoro runtime detected. Executing real inference tests...');

  // 1. Hindi real speech synthesis
  const hindiRes = await provider.generateSpeech('नमस्ते! मैं पृथ्वी हूँ।', {
    voice: 'hf_alpha',
    lang: 'hi',
    speed: 1.0,
  });

  assert.ok(hindiRes.audioBuffer instanceof Buffer);
  assert.ok(hindiRes.audioBuffer.length > 5000, `Audio buffer should be > 5000 bytes, got ${hindiRes.audioBuffer.length}`);
  assert.strictEqual(hindiRes.voice, 'hf_alpha');
  assert.strictEqual(hindiRes.format, 'wav');

  // 2. English real speech synthesis
  const englishRes = await provider.generateSpeech('Welcome to the enchanted forest!', {
    voice: 'af_heart',
    lang: 'en',
    speed: 1.0,
  });

  assert.ok(englishRes.audioBuffer instanceof Buffer);
  assert.ok(englishRes.audioBuffer.length > 5000);
  assert.strictEqual(englishRes.voice, 'af_heart');

  // 3. Run full 4-sample audition generation and verify outputs
  const samples = await runAuditionSamples();
  assert.strictEqual(samples.length, 4, 'Must produce 4 audition samples');

  const reportPath = path.join(process.cwd(), 'storage', 'audio', 'audition_samples_report.json');
  assert.ok(fs.existsSync(reportPath), 'audition_samples_report.json must be written');

  const report = JSON.parse(fs.readFileSync(reportPath, 'utf-8'));
  assert.strictEqual(report.length, 4);

  const hashes = new Set<string>();
  for (const s of report) {
    const fileOnDisk = path.join(process.cwd(), 'storage', 'audio', s.filename);
    assert.ok(fs.existsSync(fileOnDisk), `Audio file for ${s.label} must exist at ${fileOnDisk}`);
    assert.ok(s.sizeBytes > 50000, `Audio file for ${s.label} must be > 50kB`);
    hashes.add(s.sha256);
  }

  assert.strictEqual(hashes.size, 4, 'All 4 samples must have unique checksums');
  console.log('[Kokoro Integration] Real inference and audition verification succeeded!');
});
