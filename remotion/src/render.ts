import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { bundle } from '@remotion/bundler';
import { getCompositions, renderMedia } from '@remotion/renderer';
import { dimensions, frames, validateManifest } from './manifest.js';

async function main() {
  const [manifestFile, outputFile] = process.argv.slice(2);
  if (!manifestFile || !outputFile) {
    throw new Error('Usage: npm run render -- <manifest.json> <output.mp4>');
  }
  const manifest = validateManifest(JSON.parse(await fs.readFile(manifestFile, 'utf8')));
  const fps = manifest.fps ?? 30;
  const { width, height } = dimensions(manifest.format, manifest.resolution);
  const durationInFrames = manifest.scenes.reduce((n, s) => n + frames(s.durationMs, fps), 0);
  const entryPoint = fileURLToPath(new URL('./index.ts', import.meta.url));
  const serveUrl = await bundle({ entryPoint, webpackOverride: (config) => config });
  const compositions = await getCompositions(serveUrl, { inputProps: { manifest } });
  const composition = compositions.find((c) => c.id === 'StoryVideo');
  if (!composition) throw new Error('StoryVideo composition not found');
  await fs.mkdir(path.dirname(path.resolve(outputFile)), { recursive: true });
  await renderMedia({
    serveUrl,
    composition: { ...composition, fps, width, height, durationInFrames },
    codec: 'h264',
    outputLocation: path.resolve(outputFile),
    inputProps: { manifest },
  });
  console.log(`Rendered ${outputFile} (${width}x${height}, ${fps}fps, ${durationInFrames} frames)`);
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
