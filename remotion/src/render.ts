import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { bundle } from '@remotion/bundler';
import { getCompositions, renderMedia } from '@remotion/renderer';
import { validateManifest } from './manifest.js';

async function main() {
  const [manifestFile, outputFile, publicDirArg] = process.argv.slice(2);
  if (!manifestFile || !outputFile || !publicDirArg) {
    throw new Error('Usage: render <manifest.json> <output.mp4> <public-assets-directory>');
  }

  const manifest = validateManifest(JSON.parse(await fs.readFile(manifestFile, 'utf8')));
  const publicDir = path.resolve(publicDirArg);
  const outputLocation = path.resolve(outputFile);
  await fs.mkdir(publicDir, { recursive: true });
  const silentPath = path.join(publicDir, manifest.silentAudioSrc);
  if (!(await fs.stat(silentPath).catch(() => null))?.isFile()) {
    const sampleRate = 44100;
    const dataSize = sampleRate * 2;
    const silence = Buffer.alloc(44 + dataSize);
    silence.write('RIFF', 0);
    silence.writeUInt32LE(36 + dataSize, 4);
    silence.write('WAVE', 8);
    silence.write('fmt ', 12);
    silence.writeUInt32LE(16, 16);
    silence.writeUInt16LE(1, 20);
    silence.writeUInt16LE(1, 22);
    silence.writeUInt32LE(sampleRate, 24);
    silence.writeUInt32LE(sampleRate * 2, 28);
    silence.writeUInt16LE(2, 32);
    silence.writeUInt16LE(16, 34);
    silence.write('data', 36);
    silence.writeUInt32LE(dataSize, 40);
    await fs.writeFile(silentPath, silence);
  }
  await fs.mkdir(path.dirname(outputLocation), { recursive: true });

  const entryPoint = fileURLToPath(new URL('./index.ts', import.meta.url));
  const serveUrl = await bundle({ entryPoint, publicDir });
  const compositions = await getCompositions(serveUrl, { inputProps: { manifest } });
  const composition = compositions.find((item) => item.id === 'StoryVideo');
  if (!composition) throw new Error('StoryVideo composition was not registered');

  const durationInFrames = manifest.scenes.reduce(
    (total, scene) => total + Math.max(1, Math.round(scene.durationMs * manifest.fps / 1000)),
    0,
  );

  await renderMedia({
    serveUrl,
    composition: {
      ...composition,
      fps: manifest.fps,
      width: manifest.width,
      height: manifest.height,
      durationInFrames,
    },
    codec: 'h264',
    audioCodec: 'aac',
    outputLocation,
    inputProps: { manifest },
    concurrency: 2,
    onProgress: ({ progress }) => {
      process.stdout.write(`REMOTION_PROGRESS:${Math.round(progress * 100)}\n`);
    },
  });
  console.log(`Rendered ${outputLocation} (${manifest.width}x${manifest.height}, ${manifest.fps}fps, ${durationInFrames} frames)`);
}

main().catch((error) => {
  console.error('[RemotionRenderer] Render failed:', error);
  process.exitCode = 1;
});
