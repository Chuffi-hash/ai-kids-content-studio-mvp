import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { AudioGenerationService } from '../src/services/audio-generation/audio-generation.service.js';
import { calculateEmotionDelivery, normalizeEmotionIntensity } from '../src/services/audio-generation/emotion-suggester.service.js';

const execFileAsync = promisify(execFile);

async function probeAudio(filePath: string) {
  try {
    const { stdout } = await execFileAsync('ffprobe', [
      '-v', 'error',
      '-show_entries', 'format=duration,size,bit_rate:stream=sample_rate,channels',
      '-of', 'json',
      filePath,
    ]);
    const parsed = JSON.parse(stdout);
    return {
      durationSec: parseFloat(parsed.format?.duration || '0'),
      sizeBytes: parseInt(parsed.format?.size || String(fs.statSync(filePath).size), 10),
      sampleRate: parseInt(parsed.streams?.[0]?.sample_rate || '24000', 10),
      channels: parseInt(parsed.streams?.[0]?.channels || '1', 10),
      bitRate: parseInt(parsed.format?.bit_rate || '0', 10),
    };
  } catch (e: any) {
    const stat = fs.statSync(filePath);
    return {
      durationSec: 0,
      sizeBytes: stat.size,
      sampleRate: 24000,
      channels: 1,
      bitRate: 0,
    };
  }
}

async function run() {
  console.log('=== STARTING MANDATORY 4-SAMPLE HINDI EMOTION AUDITION TEST ===');
  const service = new AudioGenerationService();

  const hindiText = 'नमस्ते बच्चों! आज हम पृथ्वी के बारे में सीखेंगे।';
  const voice = 'hf_alpha';
  const lang = 'hi';

  const testCases = [
    { label: 'Sample A', emotion: 'neutral', intensity: 0, expectedDesc: 'Neutral, 0%' },
    { label: 'Sample B', emotion: 'happy', intensity: 25, expectedDesc: 'Happy, 25%' },
    { label: 'Sample C', emotion: 'happy', intensity: 60, expectedDesc: 'Happy, 60%' },
    { label: 'Sample D', emotion: 'happy', intensity: 100, expectedDesc: 'Happy, 100%' },
  ];

  const results: any[] = [];

  for (const tc of testCases) {
    console.log(`\nGenerating ${tc.label} (${tc.expectedDesc})...`);
    const delivery = calculateEmotionDelivery({
      emotion: tc.emotion,
      intensity: tc.intensity,
      baseSpeed: 1.0,
      baseEffect: 'normal',
    });
    console.log(`  -> Delivery calculation: speed=${delivery.calibratedSpeed.toFixed(3)}, pitchShift=${delivery.pitchShiftSemitones.toFixed(2)}st, presence=${delivery.presenceGainDb.toFixed(2)}dB, sentencePause=${delivery.sentencePause}s`);

    const preview = await service.previewVoice({
      voice,
      lang,
      sampleText: hindiText,
      emotion: tc.emotion,
      emotionIntensity: tc.intensity,
    });

    const filename = path.basename(preview.audioUrl);
    const fullPath = path.join(process.cwd(), 'storage', 'audio', filename);
    const fileBytes = fs.readFileSync(fullPath);
    const sha256 = crypto.createHash('sha256').update(fileBytes).digest('hex');
    const probe = await probeAudio(fullPath);

    results.push({
      label: tc.label,
      emotion: tc.emotion,
      intensity: tc.intensity,
      expectedDesc: tc.expectedDesc,
      audioUrl: preview.audioUrl,
      filename,
      fullPath,
      sha256,
      sizeBytes: probe.sizeBytes,
      durationSec: probe.durationSec,
      sampleRate: probe.sampleRate,
      calibratedSpeed: delivery.calibratedSpeed,
      pitchShiftSemitones: delivery.pitchShiftSemitones,
      presenceGainDb: delivery.presenceGainDb,
    });
  }

  console.log('\n=== AUDITION RESULTS SUMMARY ===');
  console.table(results.map(r => ({
    Sample: r.label,
    Description: r.expectedDesc,
    Filename: r.filename,
    SizeBytes: r.sizeBytes,
    DurationSec: r.durationSec.toFixed(2),
    Speed: r.calibratedSpeed.toFixed(2) + 'x',
    Pitch: r.pitchShiftSemitones > 0 ? `+${r.pitchShiftSemitones.toFixed(2)}st` : `${r.pitchShiftSemitones.toFixed(2)}st`,
    Presence: r.presenceGainDb > 0 ? `+${r.presenceGainDb.toFixed(2)}dB` : `${r.presenceGainDb.toFixed(2)}dB`,
    Sha256_Prefix: r.sha256.substring(0, 12),
  })));

  // Verify distinct hashes
  const hashes = new Set(results.map(r => r.sha256));
  console.log(`\nUnique hashes count: ${hashes.size} / 4`);
  if (hashes.size !== 4) {
    throw new Error(`Expected 4 distinct audio hashes, but got ${hashes.size}`);
  }

  // Write output json summary
  fs.writeFileSync(
    path.join(process.cwd(), 'storage', 'audio', 'audition_samples_report.json'),
    JSON.stringify(results, null, 2),
    'utf-8'
  );
  console.log('\nAudition test completed successfully!');
}

run().catch((err) => {
  console.error('Audition test failed:', err);
  process.exit(1);
});

