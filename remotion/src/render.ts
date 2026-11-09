import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { bundle } from '@remotion/bundler';
import { getCompositions, makeCancelSignal, renderMedia } from '@remotion/renderer';
import { dimensions, frames, validateManifest, VideoManifest } from './manifest.js';

export interface RenderRemotionOptions {
  manifest: VideoManifest;
  outputFile: string;
  publicDir?: string;
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
  const { manifest: rawManifest, outputFile, publicDir, onProgress, concurrency, timeoutMs = 300000 } = options;
  const manifest = validateManifest(rawManifest);

  const fps = manifest.fps ?? 30;
  const dims = (manifest.width && manifest.height)
    ? { width: manifest.width, height: manifest.height }
    : dimensions(manifest.format, manifest.resolution);
  const width = dims.width;
  const height = dims.height;

  const durationInFrames = manifest.scenes.reduce(
    (n, s) => n + frames(s.durationMs, fps),
    0
  );
  const durationMs = manifest.scenes.reduce((n, s) => n + s.durationMs, 0);

  const entryPoint = fileURLToPath(new URL('./index.ts', import.meta.url));
  const resolvedPublicDir = publicDir
    ? path.resolve(publicDir)
    : path.resolve(path.dirname(entryPoint), '../public');

  // If silentAudioSrc is requested, ensure silent audio asset exists in public directory
  if (manifest.silentAudioSrc) {
    await fs.mkdir(resolvedPublicDir, { recursive: true });
    const silentPath = path.join(resolvedPublicDir, manifest.silentAudioSrc);
    if (!(await fs.stat(silentPath).catch(() => null))?.isFile()) {
      const sampleRate = 44100;
      const dataSize = sampleRate * 2 * 2;
      const silence = Buffer.alloc(44 + dataSize);
      silence.write('RIFF', 0);
      silence.writeUInt32LE(36 + dataSize, 4);
      silence.write('WAVE', 8);
      silence.write('fmt ', 12);
      silence.writeUInt32LE(16, 16);
      silence.writeUInt16LE(1, 20);
      silence.writeUInt16LE(2, 22);
      silence.writeUInt32LE(sampleRate, 24);
      silence.writeUInt32LE(sampleRate * 4, 28);
      silence.writeUInt16LE(4, 32);
      silence.writeUInt16LE(16, 34);
      silence.write('data', 36);
      silence.writeUInt32LE(dataSize, 40);
      await fs.writeFile(silentPath, silence);
    }
  }

  // Bundle the Remotion composition
  const serveUrl = await bundle({
    entryPoint,
    publicDir: resolvedPublicDir,
    webpackOverride: (config) => ({
      ...config,
      resolve: {
        ...config.resolve,
        extensions: ['.ts', '.tsx', '.js', '.jsx', '.json'],
      },
    }),
  });

  const { cancelSignal, cancel } = makeCancelSignal();

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
        try {
          cancel();
        } catch {
          // ignore error on cancel
        }
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
      audioCodec: 'aac',
      outputLocation: absOutput,
      inputProps: { manifest },
      cancelSignal,
      concurrency: safeConcurrency,
      chromiumOptions: {
        disableWebSecurity: true,
        ignoreCertificateErrors: true,
      },
      onProgress: ({ renderedFrames, progress }) => {
        const pct = Math.round((progress ?? (renderedFrames / durationInFrames)) * 100);
        process.stdout.write(`REMOTION_PROGRESS:${pct}\n`);
        if (onProgress) {
          onProgress(renderedFrames, durationInFrames, pct);
        }
      },
    });

    try {
      await Promise.race([renderPromise, timeoutPromise]);
    } catch (err) {
      try {
        cancel();
      } catch {
        // ignore
      }
      throw err;
    } finally {
      if (timer) clearTimeout(timer);
    }

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
    if (serveUrl && serveUrl.startsWith('file://')) {
      try {
        const bundleDir = path.dirname(fileURLToPath(serveUrl));
        await fs.rm(bundleDir, { recursive: true, force: true }).catch(() => {});
      } catch {
        // ignore
      }
    }
  }
}

// CLI entrypoint
async function main() {
  const [manifestFile, outputFile, publicDirArg] = process.argv.slice(2);
  if (!manifestFile || !outputFile) {
    console.error('Usage: render <manifest.json> <output.mp4> [public-assets-directory]');
    process.exit(1);
  }

  const rawJson = await fs.readFile(manifestFile, 'utf8');
  const manifest = JSON.parse(rawJson);
  const publicDir = publicDirArg ? path.resolve(publicDirArg) : undefined;

  console.log(`Starting Remotion render for ${outputFile}...`);
  const result = await renderRemotionVideo({
    manifest,
    outputFile,
    publicDir,
    onProgress: (rendered, total, pct) => {
      console.log(`[PROGRESS] ${rendered} ${total} ${pct}`);
      if (rendered % 15 === 0 || rendered === total) {
        console.log(`Rendering progress: ${rendered}/${total} frames (${pct}%)`);
      }
    },
  });

  console.log(
    `Rendered ${result.outputFile} (${result.width}x${result.height}, ${result.fps}fps, ${result.durationInFrames} frames)`
  );
}

main().catch((error) => {
  console.error('[RemotionRenderer] Render failed:', error);
  process.exitCode = 1;
});
