import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

import fs from 'fs';

async function testHttpAudio() {
  console.log('--- Verifying HTTP Audio Streaming and API Endpoints ---');

  const baseUrl = 'http://localhost:5001';

  // 1. Check music tracks endpoint
  console.log('[HTTP 1] Checking GET /api/content/music/tracks...');
  const tracksRes = await fetch(`${baseUrl}/api/content/music/tracks`);
  if (!tracksRes.ok) throw new Error(`GET /api/content/music/tracks returned ${tracksRes.status}`);
  const tracks = await tracksRes.json();
  console.log(`✓ Fetched ${tracks.length} music tracks. Sample:`, tracks.slice(0, 2));

  // 2. Check static audio streaming with Range request
  const audioDir = path.join(process.cwd(), 'storage', 'audio');
  const audioFiles = fs.readdirSync(audioDir).filter((f) => f.endsWith('.mp3'));
  if (audioFiles.length === 0) throw new Error('No audio files found in storage/audio');

  const testAudioFile = audioFiles[0];
  const audioUrl = `${baseUrl}/storage/audio/${testAudioFile}`;
  console.log(`[HTTP 2] Testing Range Request on ${audioUrl}...`);

  const rangeRes = await fetch(audioUrl, {
    headers: {
      Range: 'bytes=0-1024',
    },
  });

  console.log('HTTP Status:', rangeRes.status);
  console.log('Accept-Ranges:', rangeRes.headers.get('accept-ranges'));
  console.log('Content-Range:', rangeRes.headers.get('content-range'));
  console.log('Content-Type:', rangeRes.headers.get('content-type'));

  if (rangeRes.status !== 206) {
    throw new Error(`Expected HTTP 206 Partial Content for range request, got ${rangeRes.status}`);
  }
  if (!rangeRes.headers.get('content-range')) {
    throw new Error('Missing Content-Range header in partial content response');
  }

  const rangeBytes = await rangeRes.arrayBuffer();
  console.log(`✓ Received partial content: ${rangeBytes.byteLength} bytes`);

  console.log('\n--- All HTTP Audio Endpoints & Streaming Verified Successfully ---');
}

testHttpAudio().catch((err) => {
  console.error('HTTP Audio Verification Failed:', err);
  process.exit(1);
});

