import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { getImagesBySceneId } from '../database/database.service.js';
import { AudioGenerationService } from '../audio-generation/audio-generation.service.js';
import { VectorAnimationEngine } from '../animation/vector-animation.engine.js';

type TimelineAudio = { src: string; startMs: number; durationMs: number; volume: number };
type RemotionScene = {
  id: string;
  title: string;
  caption?: string;
  durationMs: number;
  frames?: string[];
  videoSrc?: string;
  backgroundSrc?: string;
  cameraMovement?: string;
  cameraRotation?: string;
  cameraRotationDegrees?: number;
  audioTracks: TimelineAudio[];
};
type RemotionManifest = {
  version: 1;
  fps: number;
  width: number;
  height: number;
  scenes: RemotionScene[];
  silentAudioSrc: string;
};

export interface RemotionExportOptions {
  scenes: any[];
  fps: number;
  width: number;
  height: number;
  format: string;
  jobTempDir: string;
  outputPath: string;
  resolveLocalPath: (url: string) => string;
  onProgress?: (progress: number, stage: string) => void;
}

/**
 * Remotion export adapter.
 *
 * The existing VectorAnimationEngine remains the source of truth for character
 * rigs, motion paths, expressions, visemes, camera transforms and SVG overlays.
 * It produces deterministic PNG frames; Remotion handles the scene timeline,
 * media sequencing and final H.264 render. This avoids a second animation engine.
 */
export class RemotionExportService {
  private audioGenerationService = new AudioGenerationService();

  async render(options: RemotionExportOptions): Promise<void> {
    const { scenes, fps, width, height, format, jobTempDir, outputPath, resolveLocalPath, onProgress } = options;
    const publicDir = path.join(jobTempDir, 'remotion-public');
    const assetsDir = path.join(publicDir, 'assets');
    await fs.promises.mkdir(assetsDir, { recursive: true });

    const totalTimelineFrames = scenes.reduce(
      (total, scene) => total + Math.max(1, Math.round(this.getSceneDurationMs(scene) * fps / 1000)),
      0,
    );
    const maxTimelineFrames = Number(process.env.REMOTION_MAX_TOTAL_FRAMES) || 36000;
    if (totalTimelineFrames > maxTimelineFrames) {
      throw new Error(
        `Remotion export exceeds the configured frame budget (${totalTimelineFrames} > ${maxTimelineFrames}). Reduce duration/FPS or use FFmpeg.`
      );
    }

    const engine = new VectorAnimationEngine();
    const manifestScenes: RemotionScene[] = [];

    for (let index = 0; index < scenes.length; index += 1) {
      const scene = scenes[index];
      const animationData: any = scene.animationData || {};
      const durationMs = this.getSceneDurationMs(scene);
      const durationSec = durationMs / 1000;
      const sceneKey = this.safeName(scene.sceneId || scene.id || `scene-${index + 1}`);
      const sceneAssetDir = path.join(assetsDir, `${String(index + 1).padStart(3, '0')}-${sceneKey}-${randomUUID().slice(0, 8)}`);
      await fs.promises.mkdir(sceneAssetDir, { recursive: true });

      let videoPath = scene.videoUrl ? resolveLocalPath(scene.videoUrl) : '';
      if (!videoPath || !fs.existsSync(videoPath)) videoPath = '';

      let imagePath = '';
      const backgroundRemoved = Boolean(animationData.background?.removed);
      if (!backgroundRemoved) {
        if (scene.imageUrl) {
          imagePath = resolveLocalPath(scene.imageUrl);
        } else {
          const images = await getImagesBySceneId(scene.sceneId);
          if (images.length > 0 && images[0].imageUrl) imagePath = resolveLocalPath(images[0].imageUrl);
        }
        if (!imagePath || !fs.existsSync(imagePath)) imagePath = '';
      }

      let narrationPath = scene.audioUrl ? resolveLocalPath(scene.audioUrl) : '';
      if (!narrationPath || !fs.existsSync(narrationPath)) narrationPath = '';

      if (scene.narration && !narrationPath) {
        try {
          onProgress?.(Math.round(5 + (index / scenes.length) * 35), `Preparing narration for scene ${index + 1}...`);
          const generated = await this.audioGenerationService.generateNarrationAudio({
            sceneId: scene.sceneId || scene.id,
            narration: scene.narration,
          });
          if (generated?.audioUrl) {
            const candidate = resolveLocalPath(generated.audioUrl);
            if (fs.existsSync(candidate)) narrationPath = candidate;
          }
        } catch (error) {
          console.warn(`[RemotionExport] Narration generation skipped for scene ${index + 1}:`, error);
        }
      }

      if (Array.isArray(animationData.dialogueLines)) {
        const hasMissingDialogue = animationData.dialogueLines.some((line: any) =>
          Boolean(line.text?.trim()) && (!line.audioUrl || !fs.existsSync(resolveLocalPath(line.audioUrl)))
        );
        if (hasMissingDialogue) {
          try {
            onProgress?.(Math.round(5 + (index / scenes.length) * 35), `Preparing dialogue for scene ${index + 1}...`);
            const generatedLines = await this.audioGenerationService.generateAllSceneDialogues(scene.sceneId || scene.id);
            if (generatedLines?.length) animationData.dialogueLines = generatedLines;
          } catch (error) {
            console.warn(`[RemotionExport] Dialogue generation skipped for scene ${index + 1}:`, error);
          }
        }
      }

      const audioTracks: TimelineAudio[] = [];
      if (narrationPath && fs.existsSync(narrationPath)) {
        audioTracks.push({
          src: await this.copyAsset(narrationPath, sceneAssetDir, 'narration'),
          startMs: 0,
          durationMs,
          volume: 1,
        });
      }

      const dialogueLines = Array.isArray(animationData.dialogueLines) ? animationData.dialogueLines : [];
      for (let lineIndex = 0; lineIndex < dialogueLines.length; lineIndex += 1) {
        const line = dialogueLines[lineIndex];
        if (!line.audioUrl) continue;
        const audioPath = resolveLocalPath(line.audioUrl);
        if (!fs.existsSync(audioPath)) continue;
        const startMs = Math.max(0, Number(line.startMs) || 0);
        const lineDurationMs = Math.max(100, Number(line.durationMs) || (durationMs - startMs));
        if (startMs >= durationMs) continue;
        audioTracks.push({
          src: await this.copyAsset(audioPath, sceneAssetDir, `dialogue-${lineIndex + 1}`),
          startMs,
          durationMs: Math.min(lineDurationMs, durationMs - startMs),
          volume: Math.max(0, Math.min(1, Number.isFinite(line.volume) ? line.volume : 1)),
        });
      }

      const remotionScene: RemotionScene = {
        id: scene.sceneId || scene.id || `scene-${index + 1}`,
        title: scene.title || `Scene ${index + 1}`,
        caption: scene.narration || undefined,
        durationMs,
        audioTracks,
        cameraMovement: animationData.cameraMovement || scene.cameraMovement || '',
        cameraRotation: animationData.cameraRotation || '',
        cameraRotationDegrees: animationData.cameraRotationDegrees,
      };

      if (Array.isArray(animationData.characterInstances) && animationData.characterInstances.length > 0) {
        const effectiveBackground = backgroundRemoved
          ? { imageUrl: '', fit: 'cover', removed: true }
          : animationData.background?.imageUrl && fs.existsSync(resolveLocalPath(animationData.background.imageUrl))
            ? animationData.background
            : imagePath
              ? { imageUrl: imagePath, fit: animationData.background?.fit || 'cover', removed: false }
              : animationData.background;

        const renderData = { ...animationData, background: effectiveBackground };
        const totalFrames = Math.max(1, Math.round(durationSec * fps));
        const framePaths: string[] = [];
        const framesDir = path.join(sceneAssetDir, 'frames');
        await fs.promises.mkdir(framesDir, { recursive: true });

        for (let frame = 0; frame < totalFrames; frame += 1) {
          const svg = engine.generateSvgFrame({
            animationData: renderData,
            timestampSec: frame / fps,
            durationSec,
            width,
            height,
            activeFormat: format as any,
            resolveLocalPath,
          });
          const png = engine.rasterizeSvgToPng(svg, width);
          const filename = `frame-${String(frame).padStart(6, '0')}.png`;
          await fs.promises.writeFile(path.join(framesDir, filename), png);
          framePaths.push(path.posix.join(path.relative(publicDir, framesDir).split(path.sep).join('/'), filename));
          if (frame % 10 === 0 || frame === totalFrames - 1) {
            const pct = 5 + Math.round(((index + (frame + 1) / totalFrames) / scenes.length) * 40);
            onProgress?.(pct, `Preparing character animation: scene ${index + 1}, frame ${frame + 1}/${totalFrames}`);
          }
        }
        remotionScene.frames = framePaths;
      } else if (videoPath) {
        remotionScene.videoSrc = await this.copyAsset(videoPath, sceneAssetDir, 'scene-video');
      } else if (imagePath) {
        remotionScene.backgroundSrc = await this.copyAsset(imagePath, sceneAssetDir, 'scene-background');
      }

      manifestScenes.push(remotionScene);
    }

    const silentAudioPath = path.join(publicDir, 'silent.wav');
    await this.writeSilentWav(silentAudioPath);
    const manifest: RemotionManifest = {
      version: 1,
      fps,
      width,
      height,
      scenes: manifestScenes,
      silentAudioSrc: 'silent.wav',
    };
    const manifestPath = path.join(jobTempDir, 'remotion-manifest.json');
    await fs.promises.writeFile(manifestPath, JSON.stringify(manifest), 'utf8');

    const packageDir = this.resolvePackageDir();
    const tsxCli = path.join(packageDir, 'node_modules', 'tsx', 'dist', 'cli.mjs');
    const entryPoint = path.join(packageDir, 'src', 'render.ts');
    if (!fs.existsSync(tsxCli) || !fs.existsSync(entryPoint)) {
      throw new Error(
        `Remotion dependencies are not installed. Run "npm install" inside ${packageDir} or set REMOTION_PACKAGE_DIR.`
      );
    }

    onProgress?.(50, 'Bundling Remotion composition...');
    await this.runRenderer({
      executable: process.execPath,
      args: [tsxCli, entryPoint, manifestPath, outputPath, publicDir],
      cwd: packageDir,
      onProgress: (pct) => onProgress?.(50 + Math.round(pct * 0.45), `Remotion rendering: ${pct}%`),
    });

    const output = await fs.promises.stat(outputPath).catch(() => null);
    if (!output?.isFile() || output.size <= 0) {
      throw new Error('Remotion did not create a non-empty MP4 file.');
    }
    onProgress?.(96, 'Remotion MP4 render complete; validating output...');
  }

  private getSceneDurationMs(scene: any): number {
    let duration = 4000;
    if (Number(scene.endMs) > Number(scene.startMs) && Number(scene.startMs) >= 0) {
      duration = Number(scene.endMs) - Number(scene.startMs);
    } else if (Number(scene.estimatedDurationMs) > 0) {
      duration = Number(scene.estimatedDurationMs);
    }
    if (Number(scene.actualAudioDurationMs) > duration) duration = Number(scene.actualAudioDurationMs);
    for (const line of scene.animationData?.dialogueLines || []) {
      const end = Math.max(0, Number(line.startMs) || 0) + Math.max(0, Number(line.durationMs) || 0);
      if (end > duration) duration = end;
    }
    return Math.max(1500, Math.min(120000, duration));
  }

  private safeName(value: string): string {
    return value.replace(/[^a-zA-Z0-9_-]+/g, '-').slice(0, 50) || 'scene';
  }

  private async copyAsset(sourcePath: string, targetDir: string, label: string): Promise<string> {
    const ext = path.extname(sourcePath).toLowerCase() || '.bin';
    const filename = `${this.safeName(label)}-${randomUUID().slice(0, 8)}${ext}`;
    await fs.promises.copyFile(sourcePath, path.join(targetDir, filename));
    return path.posix.join('assets', path.basename(targetDir), filename);
  }

  private async writeSilentWav(outputPath: string): Promise<void> {
    const sampleRate = 44100;
    const channels = 1;
    const bitsPerSample = 16;
    const dataSize = sampleRate * channels * (bitsPerSample / 8);
    const buffer = Buffer.alloc(44 + dataSize);
    buffer.write('RIFF', 0);
    buffer.writeUInt32LE(36 + dataSize, 4);
    buffer.write('WAVE', 8);
    buffer.write('fmt ', 12);
    buffer.writeUInt32LE(16, 16);
    buffer.writeUInt16LE(1, 20);
    buffer.writeUInt16LE(channels, 22);
    buffer.writeUInt32LE(sampleRate, 24);
    buffer.writeUInt32LE(sampleRate * channels * (bitsPerSample / 8), 28);
    buffer.writeUInt16LE(channels * (bitsPerSample / 8), 32);
    buffer.writeUInt16LE(bitsPerSample, 34);
    buffer.write('data', 36);
    buffer.writeUInt32LE(dataSize, 40);
    await fs.promises.writeFile(outputPath, buffer);
  }

  private resolvePackageDir(): string {
    const moduleDir = path.dirname(fileURLToPath(import.meta.url));
    const candidates = [
      process.env.REMOTION_PACKAGE_DIR,
      path.resolve(process.cwd(), '../remotion'),
      path.resolve(process.cwd(), 'remotion'),
      path.resolve(moduleDir, '../../../../remotion'),
      path.resolve(moduleDir, '../../../../../remotion'),
    ].filter((candidate): candidate is string => Boolean(candidate));
    const found = candidates.find((candidate) => fs.existsSync(path.join(candidate, 'package.json')));
    if (!found) throw new Error('Remotion package not found. Set REMOTION_PACKAGE_DIR to the remotion/ directory.');
    return found;
  }

  private runRenderer(options: {
    executable: string;
    args: string[];
    cwd: string;
    onProgress: (progress: number) => void;
  }): Promise<void> {
    return new Promise((resolve, reject) => {
      const child = spawn(options.executable, options.args, {
        cwd: options.cwd,
        env: { ...process.env, NODE_ENV: process.env.NODE_ENV || 'production' },
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      const timeoutMs = Number(process.env.REMOTION_RENDER_TIMEOUT_MS) || 30 * 60 * 1000;
      let timedOut = false;
      let forceKill: ReturnType<typeof setTimeout> | undefined;
      const timeout = setTimeout(() => {
        timedOut = true;
        child.kill('SIGTERM');
        forceKill = setTimeout(() => child.kill('SIGKILL'), 10000);
      }, timeoutMs);
      let stderr = '';
      let pending = '';
      child.stdout.on('data', (chunk: Buffer) => {
        pending += chunk.toString();
        const lines = pending.split(/\r?\n/);
        pending = lines.pop() || '';
        for (const line of lines) {
          const match = line.match(/^REMOTION_PROGRESS:(\d+)$/);
          if (match) options.onProgress(Math.max(0, Math.min(100, Number(match[1]))));
          if (line.trim()) console.log(`[Remotion] ${line.trim()}`);
        }
      });
      child.stderr.on('data', (chunk: Buffer) => {
        stderr = (stderr + chunk.toString()).slice(-12000);
      });
      child.once('error', (error) => {
        clearTimeout(timeout);
        reject(error);
      });
      child.once('close', (code) => {
        clearTimeout(timeout);
        if (forceKill) clearTimeout(forceKill);
        if (timedOut) {
          reject(new Error(`Remotion renderer exceeded its ${timeoutMs}ms timeout and was terminated.`));
        } else if (code === 0) {
          resolve();
        } else {
          reject(new Error(`Remotion renderer exited with code ${code}. ${stderr || pending}`));
        }
      });
    });
  }
}
