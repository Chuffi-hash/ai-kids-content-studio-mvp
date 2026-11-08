import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { bundle } from '@remotion/bundler';
import { getCompositions, renderMedia } from '@remotion/renderer';
import { dimensions, frames, validateManifest, VideoManifest } from './manifest';

export interface RenderRemotionOptions {
  manifest: VideoManifest;
  outputFile: string;
  onProgress?: (renderedFrames: number, totalFrames: number, progressPct: number) => void;
  concurrency?: number;
  timeoutMs?: number;
}

export interface RenderRemotionResult {
  outputFile: string;
  width: number;
  height: number;
  fps: number;
  durationInFrames: number;
  durationMs: number;
}

/**
 * Programmatic rendering function for Remotion video export.
 */
export async function renderRemotionVideo(
  options: RenderRemotionOptions
): Promise<RenderRemotionResult> {
  const { manifest: rawManifest, outputFile, onProgress, concurrency, timeoutMs = 300000 } = options;
  const manifest = validateManifest(rawManifest);

  const fps = manifest.fps ?? 30;
  const { width, height } = dimensions(manifest.format, manifest.resolution);
  const durationInFrames = manifest.scenes.reduce(
    (n, s) => n + frames(s.durationMs, fps),
    0
  );
  const durationMs = manifest.scenes.reduce((n, s) => n + s.durationMs, 0);

  const entryPoint = fileURLToPath(new URL('./index.ts', import.meta.url));

  // Bundle the Remotion composition
  const serveUrl = await bundle({
    entryPoint,
    webpackOverride: (config) => ({
      ...config,
      resolve: {
        ...config.resolve,
        extensions: ['.ts', '.tsx', '.js', '.jsx', '.json'],
      },
    }),
  });

  try {
    const compositions = await getCompositions(serveUrl, {
      inputProps: { manifest },
    });
    const composition = compositions.find((c) => c.id === 'StoryVideo');
    if (!composition) throw new Error('StoryVideo composition not found');

    const absOutput = path.resolve(outputFile);
    await fs.mkdir(path.dirname(absOutput), { recursive: true });

    // Resource-safe concurrency calculation
    const safeConcurrency =
      concurrency || Math.max(1, Math.min(4, Math.floor(os.cpus().length / 2)));

    let timer: NodeJS.Timeout | null = null;
    const timeoutPromise = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        reject(new Error(`Remotion render timed out after ${timeoutMs / 1000}s`));
      }, timeoutMs);
    });

    const renderPromise = renderMedia({
      serveUrl,
      composition: {
        ...composition,
        fps,
        width,
        height,
        durationInFrames,
      },
      codec: 'h264',
      outputLocation: absOutput,
      inputProps: { manifest },
      concurrency: safeConcurrency,
      chromiumOptions: {
        disableWebSecurity: true,
        ignoreCertificateErrors: true,
      },
      onProgress: ({ renderedFrames }) => {
        const pct = Math.round((renderedFrames / durationInFrames) * 100);
        if (onProgress) {
          onProgress(renderedFrames, durationInFrames, pct);
        }
      },
    });

    await Promise.race([renderPromise, timeoutPromise]);
    if (timer) clearTimeout(timer);

    return {
      outputFile: absOutput,
      width,
      height,
      fps,
      durationInFrames,
      durationMs,
    };
  } finally {
    // Cleanup temporary bundled directory if bundle was created in temp
  }
}

// CLI entrypoint
async function main() {
  const [manifestFile, outputFile] = process.argv.slice(2);
  if (!manifestFile || !outputFile) {
    console.error('Usage: npm run render -- <manifest.json> <output.mp4>');
    process.exit(1);
  }

  const rawJson = await fs.readFile(manifestFile, 'utf8');
  const manifest = JSON.parse(rawJson);

  console.log(`Starting Remotion render for ${outputFile}...`);
  const result = await renderRemotionVideo({
    manifest,
    outputFile,
    onProgress: (rendered, total, pct) => {
      console.log(`[PROGRESS] ${rendered} ${total} ${pct}`);
      if (rendered % 15 === 0 || rendered === total) {
        console.log(`Rendering progress: ${rendered}/${total} frames (${pct}%)`);
      }
    },
  });

  console.log(
    `Successfully rendered ${result.outputFile} (${result.width}x${result.height}, ${result.fps}fps, ${result.durationInFrames} frames)`
  );
}

// Only execute main if this file is run directly
if (process.argv[1] && process.argv[1].endsWith('render.ts')) {
  main().catch((error) => {
    console.error('Remotion render failed:', error);
    process.exitCode = 1;
  });
}
