import fs from 'fs';
import path from 'path';
import { promisify } from 'util';
import { spawn, execFile } from 'child_process';
// @ts-ignore
import ffprobeStatic from '@ffprobe-installer/ffprobe';
import { RemotionManifest, RemotionManifestAdapter } from './remotion-manifest.adapter.js';

const execFileAsync = promisify(execFile);

export interface RemotionRenderJobOptions {
  jobId: string;
  story: any;
  scenes: any[];
  resolution?: '720p' | '1080p';
  fps?: number;
  format?: '16:9' | '9:16' | '1:1' | '4:5' | 'custom';
  backgroundMusic?: string | null;
  musicVolume?: number;
  selectedSceneIds?: string[];
  targetDurationSec?: number;
  templateId?: string;
  subtitleTheme?: 'classic' | 'karaoke' | 'speech-bubble' | 'minimal';
  finalOutputPath: string;
  onProgress?: (progress: number, stage: string) => void;
}

export interface RemotionRenderResult {
  outputPath: string;
  width: number;
  height: number;
  fps: number;
  durationSec: number;
}

export class RemotionRenderService {
  private remotionDir: string;
  private tempDir: string;
  private adapter: RemotionManifestAdapter;

  constructor(options?: { remotionDir?: string; tempDir?: string }) {
    if (options?.remotionDir) {
      this.remotionDir = options.remotionDir;
    } else {
      const candidate1 = path.resolve(process.cwd(), 'remotion');
      const candidate2 = path.resolve(process.cwd(), '../remotion');
      this.remotionDir = fs.existsSync(candidate1) ? candidate1 : candidate2;
    }

    const storageDir = process.env.STORAGE_DIR || './storage';
    this.tempDir = options?.tempDir || path.join(process.cwd(), storageDir, 'temp');
    this.adapter = new RemotionManifestAdapter();

    if (!fs.existsSync(this.tempDir)) {
      fs.mkdirSync(this.tempDir, { recursive: true });
    }
  }

  /**
   * Renders a complete story into MP4 video using the Remotion React engine.
   */
  public async renderStoryExport(options: RemotionRenderJobOptions): Promise<RemotionRenderResult> {
    const {
      jobId,
      story,
      scenes,
      resolution = '720p',
      fps = 30,
      format = '16:9',
      backgroundMusic,
      musicVolume = 0.2,
      selectedSceneIds,
      targetDurationSec,
      templateId,
      subtitleTheme,
      finalOutputPath,
      onProgress,
    } = options;

    onProgress?.(5, 'Building Remotion animation manifest...');

    // 1. Build and validate manifest
    const manifest: RemotionManifest = await this.adapter.buildManifest(
      story,
      scenes,
      {
        resolution,
        fps,
        format,
        backgroundMusic,
        musicVolume,
        selectedSceneIds,
        targetDurationSec,
        templateId,
        subtitleTheme,
        embedBase64Images: true,
      }
    );

    // 2. Prepare temp working directory and write manifest.json
    const jobTempDir = path.join(this.tempDir, `remotion-export-${jobId}`);
    await fs.promises.mkdir(jobTempDir, { recursive: true });
    const manifestPath = path.join(jobTempDir, 'manifest.json');
    await fs.promises.writeFile(manifestPath, JSON.stringify(manifest, null, 2), 'utf-8');

    const tempOutputPath = path.join(jobTempDir, 'rendered.mp4');

    onProgress?.(10, 'Initializing Remotion frame renderer...');

    // 3. Spawn Remotion render process with resource-safe settings
    await this.executeRemotionProcess({
      manifestPath,
      outputPath: tempOutputPath,
      onProgress: (rendered, total, pct) => {
        // Map 0-100% of frame rendering to 10-88% of job progress
        const overallPct = Math.round(10 + pct * 0.78);
        onProgress?.(
          overallPct,
          `Rendering frames with Remotion (frame ${rendered}/${total} — ${pct}%)...`
        );
      },
    });

    onProgress?.(90, 'Validating rendered video streams with ffprobe...');

    // 4. Verify rendered video with ffprobe
    const ffprobePath = (ffprobeStatic as any)?.path || 'ffprobe';
    const { stdout: probeStdout } = await execFileAsync(ffprobePath, [
      '-v', 'error',
      '-show_entries', 'format=duration:stream=codec_type,codec_name,width,height',
      '-of', 'json',
      tempOutputPath,
    ]);

    const probe = JSON.parse(probeStdout);
    const videoStream = probe.streams?.find((s: any) => s.codec_type === 'video');
    const hasVideoStream = Boolean(videoStream && (videoStream.codec_name === 'h264' || videoStream.codec_name === 'avc1'));
    const outputDurationSec = Number.parseFloat(probe.format?.duration || '0');

    if (!hasVideoStream || !Number.isFinite(outputDurationSec) || outputDurationSec <= 0) {
      throw new Error(
        `Remotion export validation failed: invalid or unplayable MP4 generated (duration: ${outputDurationSec}s)`
      );
    }

    onProgress?.(95, 'Moving final video to exports storage...');

    // 5. Move rendered file to final destination
    await fs.promises.mkdir(path.dirname(finalOutputPath), { recursive: true });
    await fs.promises.copyFile(tempOutputPath, finalOutputPath);

    // 6. Clean up temporary directory
    try {
      await fs.promises.rm(jobTempDir, { recursive: true, force: true });
    } catch (cleanupErr) {
      console.warn(`[RemotionRender] Failed to clean up temp dir ${jobTempDir}:`, cleanupErr);
    }

    return {
      outputPath: finalOutputPath,
      width: videoStream.width,
      height: videoStream.height,
      fps,
      durationSec: outputDurationSec,
    };
  }

  /**
   * Spawns Remotion CLI renderer in the remotion directory and streams progress.
   */
  private executeRemotionProcess(options: {
    manifestPath: string;
    outputPath: string;
    onProgress?: (rendered: number, total: number, pct: number) => void;
  }): Promise<void> {
    return new Promise((resolve, reject) => {
      const { manifestPath, outputPath, onProgress } = options;
      const isWin = process.platform === 'win32';
      const cmd = isWin ? 'npx.cmd' : 'npx';
      const args = ['tsx', 'src/render.ts', manifestPath, outputPath];

      console.log(`[RemotionRender] Spawning: ${cmd} ${args.join(' ')} in ${this.remotionDir}`);

      const proc = spawn(cmd, args, {
        cwd: this.remotionDir,
        shell: isWin,
        env: {
          ...process.env,
          NODE_ENV: 'production',
        },
        stdio: ['ignore', 'pipe', 'pipe'],
      });

      let stderrOutput = '';

      proc.stdout.on('data', (chunk: Buffer) => {
        const text = chunk.toString();
        const lines = text.split('\n');
        for (const line of lines) {
          const match = line.match(/\[PROGRESS\]\s+(\d+)\s+(\d+)\s+(\d+)/);
          if (match && onProgress) {
            const rendered = parseInt(match[1], 10);
            const total = parseInt(match[2], 10);
            const pct = parseInt(match[3], 10);
            onProgress(rendered, total, pct);
          }
        }
      });

      proc.stderr.on('data', (chunk: Buffer) => {
        stderrOutput += chunk.toString();
      });

      proc.on('error', (err) => {
        reject(new Error(`Failed to spawn Remotion render process: ${err.message}`));
      });

      proc.on('close', (code) => {
        if (code === 0) {
          resolve();
        } else {
          reject(
            new Error(
              `Remotion render process exited with code ${code}. Stderr: ${stderrOutput.slice(-500)}`
            )
          );
        }
      });
    });
  }
}
