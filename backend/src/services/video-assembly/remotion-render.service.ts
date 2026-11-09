import fs from 'fs';
import path from 'path';
import { promisify } from 'util';
import { spawn, execFile } from 'child_process';
// @ts-ignore
import ffmpegStatic from '@ffmpeg-installer/ffmpeg';
// @ts-ignore
import ffprobeStatic from '@ffprobe-installer/ffprobe';
import { RemotionManifest, RemotionManifestAdapter } from './remotion-manifest.adapter.js';
import { RemotionRenderQueue } from './remotion-render-queue.js';

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
  private storageDir: string;
  private adapter: RemotionManifestAdapter;
  private activeProcesses = new Map<string, () => Promise<void>>();

  constructor(options?: { remotionDir?: string; tempDir?: string; storageDir?: string }) {
    if (options?.remotionDir) {
      this.remotionDir = options.remotionDir;
    } else {
      const candidate1 = path.resolve(process.cwd(), 'remotion');
      const candidate2 = path.resolve(process.cwd(), '../remotion');
      this.remotionDir = fs.existsSync(candidate1) ? candidate1 : candidate2;
    }

    const storageDir = options?.storageDir || process.env.STORAGE_DIR || './storage';
    this.storageDir = storageDir;
    this.tempDir = options?.tempDir || path.join(process.cwd(), storageDir, 'temp');
    this.adapter = new RemotionManifestAdapter();

    if (!fs.existsSync(this.tempDir)) {
      fs.mkdirSync(this.tempDir, { recursive: true });
    }
  }

  /**
   * Cancels a running Remotion render or removes it from queue if queued.
   */
  public async cancelJob(jobId: string): Promise<boolean> {
    const queueCancelled = RemotionRenderQueue.getInstance().cancel(jobId);
    const killer = this.activeProcesses.get(jobId);
    if (killer) {
      try {
        await killer();
      } catch (err) {
        console.warn(`[RemotionRender] Error cancelling process for job ${jobId}:`, err);
      }
      this.activeProcesses.delete(jobId);
      return true;
    }
    return queueCancelled;
  }

  private resolveLocalPath(urlOrPath: string): string {
    if (urlOrPath.startsWith('/storage/')) {
      const rel = urlOrPath.replace(/^\/storage\//, '');
      return path.resolve(process.cwd(), this.storageDir, rel);
    }
    return path.resolve(urlOrPath);
  }

  /**
   * Renders a complete story into MP4 video using the Remotion React engine.
   * Execution is managed by RemotionRenderQueue to ensure resource-safe concurrency.
   */
  public async renderStoryExport(options: RemotionRenderJobOptions): Promise<RemotionRenderResult> {
    const queue = RemotionRenderQueue.getInstance();
    return queue.enqueue({
      jobId: options.jobId,
      onQueuePositionChange: (pos, total) => {
        options.onProgress?.(0, `Queued for Remotion render (position ${pos} of ${total})...`);
      },
      task: () => this.executeRenderStoryExport(options),
    });
  }

  /**
   * Executes the actual Remotion render job, followed by broadcast audio mastering.
   */
  private async executeRenderStoryExport(options: RemotionRenderJobOptions): Promise<RemotionRenderResult> {
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

    // 1. Build and validate manifest (exclude music from Remotion so speech can be ducked in mastering)
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
        embedBase64Audio: true,
        excludeMusicFromRemotion: true,
      }
    );

    // 2. Prepare temp working directory and write manifest.json
    const jobTempDir = path.join(this.tempDir, `remotion-export-${jobId}`);
    await fs.promises.mkdir(jobTempDir, { recursive: true });
    const manifestPath = path.join(jobTempDir, 'manifest.json');
    await fs.promises.writeFile(manifestPath, JSON.stringify(manifest, null, 2), 'utf-8');

    const tempOutputPath = path.join(jobTempDir, 'rendered-remotion.mp4');
    const masteredOutputPath = path.join(jobTempDir, 'mastered.mp4');

    try {
      onProgress?.(10, 'Initializing Remotion frame renderer...');

      // 3. Spawn Remotion render process with resource-safe settings and progress streaming
      await this.executeRemotionProcess({
        jobId,
        manifestPath,
        outputPath: tempOutputPath,
        onProgress: (rendered, total, pct) => {
          // Map 0-100% of frame rendering to 10-80% of job progress
          const overallPct = Math.round(10 + pct * 0.70);
          onProgress?.(
            overallPct,
            `Rendering frames with Remotion (frame ${rendered}/${total} — ${pct}%)...`
          );
        },
      });

      onProgress?.(85, 'Mastering audio and mixing soundtrack...');

      const ffmpegPath = (ffmpegStatic as any)?.path || 'ffmpeg';
      const ffprobePath = (ffprobeStatic as any)?.path || 'ffprobe';

      // Probe Remotion rendered video to inspect audio streams
      const { stdout: remotionProbeStdout } = await execFileAsync(ffprobePath, [
        '-v', 'error',
        '-show_entries', 'format=duration:stream=codec_type,codec_name',
        '-of', 'json',
        tempOutputPath,
      ]);
      const remotionProbe = JSON.parse(remotionProbeStdout);
      const hasSpeechAudio = Boolean(
        remotionProbe.streams?.some((s: any) => s.codec_type === 'audio')
      );

      // Resolve background music path if specified
      let musicPath: string | null = null;
      if (backgroundMusic && backgroundMusic !== 'none') {
        if (backgroundMusic.startsWith('/storage/')) {
          musicPath = this.resolveLocalPath(backgroundMusic);
        } else if (fs.existsSync(backgroundMusic)) {
          musicPath = backgroundMusic;
        } else {
          const candidate = path.join(process.cwd(), this.storageDir, 'music', `${backgroundMusic}.mp3`);
          if (fs.existsSync(candidate)) {
            musicPath = candidate;
          } else {
            const candidateWav = path.join(process.cwd(), this.storageDir, 'music', `${backgroundMusic}.wav`);
            if (fs.existsSync(candidateWav)) {
              musicPath = candidateWav;
            }
          }
        }
      }

      if (musicPath && fs.existsSync(musicPath) && hasSpeechAudio) {
        // Case A: Both speech audio and background music exist -> Sidechain ducking + -16 LUFS loudnorm
        const effectiveMusicVol = Math.max(0.01, Math.min(1.0, musicVolume));
        const duckingFilter = [
          `[0:a]aresample=44100,aformat=channel_layouts=stereo,volume=1.0,asplit=2[speech_main][speech_sc_raw]`,
          `[speech_sc_raw]aformat=channel_layouts=stereo[speech_sc]`,
          `[1:a]aresample=44100,aformat=channel_layouts=stereo,volume=${effectiveMusicVol.toFixed(2)}[bgm_in]`,
          `[bgm_in][speech_sc]sidechaincompress=threshold=0.03:ratio=4:attack=50:release=400[bgm_ducked]`,
          `[speech_main][bgm_ducked]amix=inputs=2:duration=first:dropout_transition=2,volume=1.5,aformat=channel_layouts=stereo,loudnorm=I=-16:TP=-1.5:LRA=11[aout]`,
        ].join(';');

        await execFileAsync(ffmpegPath, [
          '-nostdin',
          '-y',
          '-thread_queue_size', '512',
          '-i', tempOutputPath,
          '-thread_queue_size', '512',
          '-stream_loop', '-1',
          '-i', musicPath,
          '-filter_complex', duckingFilter,
          '-map', '0:v',
          '-map', '[aout]',
          '-c:v', 'copy',
          '-c:a', 'aac',
          '-b:a', '192k',
          '-ar', '44100',
          masteredOutputPath,
        ]);
      } else if (musicPath && fs.existsSync(musicPath) && !hasSpeechAudio) {
        // Case B: Background music only -> normalise BGM to -16 LUFS
        const effectiveMusicVol = Math.max(0.01, Math.min(1.0, musicVolume));
        await execFileAsync(ffmpegPath, [
          '-nostdin',
          '-y',
          '-thread_queue_size', '512',
          '-i', tempOutputPath,
          '-thread_queue_size', '512',
          '-stream_loop', '-1',
          '-i', musicPath,
          '-filter_complex', `[1:a]aresample=44100,aformat=channel_layouts=stereo,volume=${effectiveMusicVol.toFixed(2)},loudnorm=I=-16:TP=-1.5:LRA=11[aout]`,
          '-map', '0:v',
          '-map', '[aout]',
          '-c:v', 'copy',
          '-c:a', 'aac',
          '-b:a', '192k',
          '-ar', '44100',
          '-shortest',
          masteredOutputPath,
        ]);
      } else if (hasSpeechAudio) {
        // Case C: Speech audio only -> normalise speech to broadcast -16 LUFS
        await execFileAsync(ffmpegPath, [
          '-nostdin',
          '-y',
          '-thread_queue_size', '512',
          '-i', tempOutputPath,
          '-filter_complex', '[0:a]aresample=44100,aformat=channel_layouts=stereo,loudnorm=I=-16:TP=-1.5:LRA=11[aout]',
          '-map', '0:v',
          '-map', '[aout]',
          '-c:v', 'copy',
          '-c:a', 'aac',
          '-b:a', '192k',
          '-ar', '44100',
          masteredOutputPath,
        ]);
      } else {
        // Case D: No speech audio and no music -> synthesize silent AAC track so output always has audio stream
        await execFileAsync(ffmpegPath, [
          '-nostdin',
          '-y',
          '-thread_queue_size', '512',
          '-i', tempOutputPath,
          '-f', 'lavfi',
          '-i', 'anullsrc=channel_layout=stereo:sample_rate=44100',
          '-map', '0:v',
          '-map', '1:a',
          '-c:v', 'copy',
          '-c:a', 'aac',
          '-b:a', '192k',
          '-ar', '44100',
          '-shortest',
          masteredOutputPath,
        ]);
      }

      onProgress?.(92, 'Validating rendered video streams with ffprobe...');

      // 4. Verify rendered video with ffprobe
      const finalToValidate = fs.existsSync(masteredOutputPath) ? masteredOutputPath : tempOutputPath;
      const { stdout: probeStdout } = await execFileAsync(ffprobePath, [
        '-v', 'error',
        '-show_entries', 'format=duration:stream=codec_type,codec_name,width,height',
        '-of', 'json',
        finalToValidate,
      ]);

      const probe = JSON.parse(probeStdout);
      const videoStream = probe.streams?.find((s: any) => s.codec_type === 'video');
      const audioStream = probe.streams?.find((s: any) => s.codec_type === 'audio');
      const hasVideoStream = Boolean(videoStream && (videoStream.codec_name === 'h264' || videoStream.codec_name === 'avc1'));
      const hasAudioStream = Boolean(audioStream && audioStream.codec_name === 'aac');
      const outputDurationSec = Number.parseFloat(probe.format?.duration || '0');

      if (!hasVideoStream || !hasAudioStream || !Number.isFinite(outputDurationSec) || outputDurationSec <= 0) {
        throw new Error(
          `Remotion export validation failed: invalid or unplayable MP4 generated (duration: ${outputDurationSec}s, video: ${hasVideoStream}, audio: ${hasAudioStream})`
        );
      }

      onProgress?.(96, 'Moving final video to exports storage...');

      // 5. Move mastered file to final destination
      await fs.promises.mkdir(path.dirname(finalOutputPath), { recursive: true });
      await fs.promises.copyFile(finalToValidate, finalOutputPath);

      return {
        outputPath: finalOutputPath,
        width: videoStream.width,
        height: videoStream.height,
        fps,
        durationSec: outputDurationSec,
      };
    } finally {
      // 6. Clean up temporary directory
      try {
        await fs.promises.rm(jobTempDir, { recursive: true, force: true });
      } catch (cleanupErr) {
        console.warn(`[RemotionRender] Failed to clean up temp dir ${jobTempDir}:`, cleanupErr);
      }
    }
  }

  /**
   * Spawns Remotion CLI renderer in the remotion directory and streams progress.
   * Enforces process timeout and terminates complete process trees on Windows and Linux.
   */
  private executeRemotionProcess(options: {
    jobId: string;
    manifestPath: string;
    outputPath: string;
    onProgress?: (rendered: number, total: number, pct: number) => void;
  }): Promise<void> {
    return new Promise((resolve, reject) => {
      const { jobId, manifestPath, outputPath, onProgress } = options;
      const isWin = process.platform === 'win32';
      const cmd = isWin ? 'npx.cmd' : 'npx';
      const args = ['tsx', 'src/render.ts', manifestPath, outputPath];
      const timeoutMs = Number(process.env.REMOTION_RENDER_TIMEOUT_MS) || 600000;

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

      let isDone = false;
      let stderrOutput = '';

      const killProcessTree = async () => {
        if (!proc.pid) return;
        try {
          if (isWin) {
            await execFileAsync('taskkill', ['/pid', String(proc.pid), '/T', '/F']);
          } else {
            try {
              process.kill(-proc.pid, 'SIGKILL');
            } catch {
              proc.kill('SIGKILL');
            }
          }
        } catch {
          // ignore error if process already exited
        }
      };

      this.activeProcesses.set(jobId, killProcessTree);

      const timer = setTimeout(async () => {
        if (isDone) return;
        isDone = true;
        this.activeProcesses.delete(jobId);
        console.error(`[RemotionRender] Process timed out after ${timeoutMs}ms. Killing process tree...`);
        await killProcessTree();
        reject(new Error(`Remotion render process timed out after ${timeoutMs}ms`));
      }, timeoutMs);

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

      proc.on('error', async (err) => {
        if (isDone) return;
        isDone = true;
        clearTimeout(timer);
        this.activeProcesses.delete(jobId);
        await killProcessTree();
        reject(new Error(`Failed to spawn Remotion render process: ${err.message}`));
      });

      proc.on('close', async (code) => {
        if (isDone) return;
        isDone = true;
        clearTimeout(timer);
        this.activeProcesses.delete(jobId);
        if (code === 0) {
          resolve();
        } else {
          await killProcessTree();
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
