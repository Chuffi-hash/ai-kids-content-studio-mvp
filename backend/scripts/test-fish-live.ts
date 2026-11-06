import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { FishAudioProvider } from '../src/services/audio-generation/providers/fish-audio.provider.js';

async function main() {
  const provider = new FishAudioProvider();
  console.log('Provider available:', await provider.isAvailable());

  const outDir = path.join(process.cwd(), 'storage', 'audio', 'fish-live-test');
  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true });
  }

  // 1. Hindi Neutral (intensity 0)
  console.log('\n--- 1. Testing Hindi Neutral (intensity 0) ---');
  const t0 = Date.now();
  const res1 = await provider.generateSpeech('नमस्ते बच्चों, आज हम एक नई और प्यारी कहानी सुनेंगे।', {
    lang: 'hi',
    emotion: 'neutral',
    emotionIntensity: 0
  });
  const file1 = path.join(outDir, 'hindi-neutral-0.mp3');
  fs.writeFileSync(file1, res1.audioBuffer);
  console.log(`Saved: ${file1} (${res1.audioBuffer.length} bytes, duration: ${res1.durationMs}ms, sampleRate: ${res1.sampleRate}Hz in ${Date.now() - t0}ms)`);

  // 2. Hindi Happy / Warm (intensity 15)
  console.log('\n--- 2. Testing Hindi Happy / Warm (intensity 15) ---');
  const t1 = Date.now();
  const res2 = await provider.generateSpeech('चलो सब मिलकर एक सुंदर और मजेदार खेल खेलते हैं!', {
    lang: 'hi',
    emotion: 'happy',
    emotionIntensity: 15
  });
  const file2 = path.join(outDir, 'hindi-happy-15.mp3');
  fs.writeFileSync(file2, res2.audioBuffer);
  console.log(`Saved: ${file2} (${res2.audioBuffer.length} bytes, duration: ${res2.durationMs}ms, sampleRate: ${res2.sampleRate}Hz in ${Date.now() - t1}ms)`);

  // 3. Hindi Curious / Inquisitive (intensity 15)
  console.log('\n--- 3. Testing Hindi Curious / Inquisitive (intensity 15) ---');
  const t2 = Date.now();
  const res3 = await provider.generateSpeech('क्या आपको पता है कि बादलों के पार क्या छुपा है?', {
    lang: 'hi',
    emotion: 'curious',
    emotionIntensity: 15
  });
  const file3 = path.join(outDir, 'hindi-curious-15.mp3');
  fs.writeFileSync(file3, res3.audioBuffer);
  console.log(`Saved: ${file3} (${res3.audioBuffer.length} bytes, duration: ${res3.durationMs}ms, sampleRate: ${res3.sampleRate}Hz in ${Date.now() - t2}ms)`);

  // 4. English Neutral (intensity 0)
  console.log('\n--- 4. Testing English Neutral (intensity 0) ---');
  const t3 = Date.now();
  const res4 = await provider.generateSpeech('Hello little explorers, welcome to our magical story.', {
    lang: 'en',
    emotion: 'neutral',
    emotionIntensity: 0
  });
  const file4 = path.join(outDir, 'english-neutral-0.mp3');
  fs.writeFileSync(file4, res4.audioBuffer);
  console.log(`Saved: ${file4} (${res4.audioBuffer.length} bytes, duration: ${res4.durationMs}ms, sampleRate: ${res4.sampleRate}Hz in ${Date.now() - t3}ms)`);

  // 5. English Reassuring (intensity 15)
  console.log('\n--- 5. Testing English Reassuring (intensity 15) ---');
  const t4 = Date.now();
  const res5 = await provider.generateSpeech('Do not worry my friend, everything is going to be alright.', {
    lang: 'en',
    emotion: 'reassuring',
    emotionIntensity: 15
  });
  const file5 = path.join(outDir, 'english-reassuring-15.mp3');
  fs.writeFileSync(file5, res5.audioBuffer);
  console.log(`Saved: ${file5} (${res5.audioBuffer.length} bytes, duration: ${res5.durationMs}ms, sampleRate: ${res5.sampleRate}Hz in ${Date.now() - t4}ms)`);

  console.log('\n=== All 5 audio synthesis tests passed successfully! ===');
}

main().catch(err => {
  console.error('Synthesis error:', err);
  process.exit(1);
});

