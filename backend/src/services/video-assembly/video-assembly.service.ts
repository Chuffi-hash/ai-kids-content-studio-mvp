import fs from 'fs';
import path from 'path';
import { promisify } from 'util';
import { execFile } from 'child_process';
import { randomUUID } from 'crypto';
// @ts-ignore
import ffmpegStatic from '@ffmpeg-installer/ffmpeg';
import { getStoryByStoryId, getScenesByStoryId, getImagesBySceneId } from '../database/database.service.js';
import { VectorAnimationEngine } from '../animation/vector-animation.engine.js';

const execFileAsync = promisify(execFile);

export interface ExportJob {
  id: string;
  storyId: string;
  status: 'queued' | 'processing' | 'completed' | 'failed';
  progress: number; // 0 - 100
  stage: string;
  downloadUrl?: string;
  filename?: string;
  error?: string;
  createdAt: Date;
  completedAt?: Date;
}

// In-memory registry of export jobs
const jobs = new Map<string, ExportJob>();

export class VideoAssemblyService {
  private storageDir: string;
  private exportsDir: string;
  private tempDir: string;

  constructor() {
    this.storageDir = process.env.STORAGE_DIR || './storage';
    this.exportsDir = path.join(process.cwd(), this.storageDir, 'exports');
    this.tempDir = path.join(process.cwd(), this.storageDir, 'temp');

    if (!fs.existsSync(this.exportsDir)) {
      fs.mkdirSync(this.exportsDir, { recursive: true });
    }
    if (!fs.existsSync(this.tempDir)) {
      fs.mkdirSync(this.tempDir, { recursive: true });
    }
  }

  /**
   * Starts a background video assembly export job.
   */
  startExportJob(options: {
    storyId: string;
    resolution?: '1080p' | '720p';
    fps?: number;
    backgroundMusic?: string | null;
    musicVolume?: number;
  }): ExportJob {
    const { storyId, resolution = '720p', fps = 30, backgroundMusic, musicVolume = 0.2 } = options;
    const jobId = randomUUID();

    const job: ExportJob = {
      id: jobId,
      storyId,
      status: 'queued',
      progress: 0,
      stage: 'Queued for export...',
      createdAt: new Date(),
    };

    jobs.set(jobId, job);

    // Run assembly asynchronously
    this.processExport(jobId, storyId, resolution, fps, backgroundMusic, musicVolume).catch((err) => {
      console.error(`[VideoAssembly] Unhandled error in job ${jobId}:`, err);
      job.status = 'failed';
      job.error = err.message || String(err);
      job.completedAt = new Date();
    });

    return job;
  }

  /**
   * Gets current status of an export job.
   */
  getJob(jobId: string): ExportJob | undefined {
    return jobs.get(jobId);
  }

  /**
   * Executes the full video assembly pipeline using FFmpeg.
   */
  private async processExport(
    jobId: string,
    storyId: string,
    resolution: '1080p' | '720p',
    fps: number,
    backgroundMusic?: string | null,
    musicVolume = 0.2
  ): Promise<void> {
    const job = jobs.get(jobId);
    if (!job) return;

    job.status = 'processing';
    job.progress = 5;
    job.stage = 'Loading story and scene data...';

    const story = await getStoryByStoryId(storyId);
    if (!story) {
      throw new Error(`Story not found: ${storyId}`);
    }

    const scenes = await getScenesByStoryId(storyId, false);
    if (!scenes || scenes.length === 0) {
      throw new Error('This story has no scenes to export. Generate scenes first.');
    }

    const jobTempDir = path.join(this.tempDir, `export-${jobId}`);
    await fs.promises.mkdir(jobTempDir, { recursive: true });

    const width = resolution === '1080p' ? 1920 : 1280;
    const height = resolution === '1080p' ? 1080 : 720;
    const ffmpegPath = ffmpegStatic?.path || 'ffmpeg';

    try {
      const segmentFiles: string[] = [];

      for (let i = 0; i < scenes.length; i++) {
        const scene = scenes[i];
        const sceneNum = i + 1;

        job.progress = Math.round(10 + (i / scenes.length) * 65);
        job.stage = `Rendering scene ${sceneNum} of ${scenes.length}: "${scene.title}"...`;

        // Calculate scene duration in seconds
        let durationSec = 4;
        if (scene.endMs && scene.startMs && scene.endMs > scene.startMs) {
          durationSec = (scene.endMs - scene.startMs) / 1000;
        } else if (scene.estimatedDurationMs && scene.estimatedDurationMs > 0) {
          durationSec = scene.estimatedDurationMs / 1000;
        }
        // Ensure scene is long enough for the actual narration speech
        if (scene.actualAudioDurationMs && scene.actualAudioDurationMs > 0) {
          const audioSec = scene.actualAudioDurationMs / 1000;
          if (audioSec > durationSec) {
            durationSec = audioSec;
          }
        }
        durationSec = Math.max(1.5, Math.min(120, durationSec));

        // Check if pre-rendered video clip exists
        let videoClipPath = '';
        if (scene.videoUrl) {
          videoClipPath = this.resolveLocalPath(scene.videoUrl);
        }

        // Resolve visual asset
        let imagePath = '';
        if (scene.imageUrl) {
          imagePath = this.resolveLocalPath(scene.imageUrl);
        } else {
          // Check images table for this scene
          const images = await getImagesBySceneId(scene.sceneId);
          if (images.length > 0 && images[0].imageUrl) {
            imagePath = this.resolveLocalPath(images[0].imageUrl);
          }
        }

        // Resolve audio asset
        let audioPath = '';
        if (scene.audioUrl) {
          audioPath = this.resolveLocalPath(scene.audioUrl);
        }

        const segmentPath = path.join(jobTempDir, `scene-${i}.mp4`);

        // Case 0: Vector character animation exists
        if ((scene as any).animationData && (scene as any).animationData.characterInstances?.length > 0) {
          await this.renderVectorAnimationSceneSegment({
            ffmpegPath,
            animationData: (scene as any).animationData,
            audioPath: audioPath && fs.existsSync(audioPath) ? audioPath : null,
            durationSec,
            width,
            height,
            fps,
            outputPath: segmentPath,
            jobTempDir,
            sceneIndex: i,
          });
        }
        // Case 1: Pre-rendered video clip exists
        else if (videoClipPath && fs.existsSync(videoClipPath)) {
          await this.renderVideoClipSceneSegment({
            ffmpegPath,
            videoPath: videoClipPath,
            audioPath: audioPath && fs.existsSync(audioPath) ? audioPath : null,
            durationSec,
            width,
            height,
            fps,
            outputPath: segmentPath,
          });
        }
        // Case 2: Valid image exists
        else if (imagePath && fs.existsSync(imagePath)) {
          await this.renderImageSceneSegment({
            ffmpegPath,
            imagePath,
            audioPath: audioPath && fs.existsSync(audioPath) ? audioPath : null,
            durationSec,
            width,
            height,
            fps,
            outputPath: segmentPath,
          });
        } else {
          // Case 3: No media, render a stylized card placeholder with scene info
          await this.renderCardSceneSegment({
            ffmpegPath,
            title: scene.title || `Scene ${sceneNum}`,
            narration: scene.narration || '',
            audioPath: audioPath && fs.existsSync(audioPath) ? audioPath : null,
            durationSec,
            width,
            height,
            fps,
            outputPath: segmentPath,
          });
        }

        segmentFiles.push(segmentPath);
      }

      // Step 2: Concatenate segments
      job.progress = 80;
      job.stage = 'Assembling final video timeline...';

      const concatListPath = path.join(jobTempDir, 'concat_list.txt');
      const concatContent = segmentFiles
        .map((file) => `file '${file.replace(/\\/g, '/')}'`)
        .join('\n');
      await fs.promises.writeFile(concatListPath, concatContent, 'utf-8');

      const assembledPath = path.join(jobTempDir, 'assembled.mp4');

      // Use concat demuxer to concatenate all scene videos
      await execFileAsync(ffmpegPath, [
        '-y',
        '-f', 'concat',
        '-safe', '0',
        '-i', concatListPath,
        '-c', 'copy',
        assembledPath,
      ]);

      job.progress = 90;
      job.stage = 'Finalizing export format and master audio...';

      const timestamp = Date.now();
      const cleanTitle = (story.title || 'story')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .slice(0, 30);
      const finalFilename = `${cleanTitle}-${timestamp}.mp4`;
      const finalOutputPath = path.join(this.exportsDir, finalFilename);

      // Check if background soundtrack should be mixed in
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
          }
        }
      }

      if (musicPath && fs.existsSync(musicPath)) {
        job.stage = 'Mixing soundtrack and mastering output audio...';
        await execFileAsync(ffmpegPath, [
          '-y',
          '-i', assembledPath,
          '-stream_loop', '-1',
          '-i', musicPath,
          '-filter_complex',
          `[0:a]volume=1.0[a0];[1:a]volume=${musicVolume}[a1];[a0][a1]amix=inputs=2:duration=first:dropout_transition=2[aout]`,
          '-map', '0:v',
          '-map', '[aout]',
          '-c:v', 'copy',
          '-c:a', 'aac',
          '-b:a', '192k',
          '-ar', '44100',
          finalOutputPath,
        ]);
      } else {
        // Move assembled file to final storage
        await fs.promises.copyFile(assembledPath, finalOutputPath);
      }

      const downloadUrl = `/storage/exports/${finalFilename}`;

      job.status = 'completed';
      job.progress = 100;
      job.stage = 'Export completed successfully!';
      job.downloadUrl = downloadUrl;
      job.filename = finalFilename;
      job.completedAt = new Date();

      console.log(`[VideoAssembly] Export job ${jobId} completed successfully: ${downloadUrl}`);
    } catch (error: any) {
      console.error(`[VideoAssembly] Export job ${jobId} failed:`, error);
      job.status = 'failed';
      job.error = error.message || 'Video assembly failed';
      job.completedAt = new Date();
    } finally {
      // Clean up temp directory
      try {
        await fs.promises.rm(jobTempDir, { recursive: true, force: true });
      } catch (cleanupErr) {
        console.warn(`[VideoAssembly] Failed to clean up temp dir ${jobTempDir}:`, cleanupErr);
      }
    }
  }

  /**
   * Renders an individual scene segment from vector animation data using Resvg and FFmpeg
   */
  private async renderVectorAnimationSceneSegment(options: {
    ffmpegPath: string;
    animationData: any;
    audioPath: string | null;
    durationSec: number;
    width: number;
    height: number;
    fps: number;
    outputPath: string;
    jobTempDir: string;
    sceneIndex: number;
  }): Promise<void> {
    const {
      ffmpegPath,
      animationData,
      audioPath,
      durationSec,
      width,
      height,
      fps,
      outputPath,
      jobTempDir,
      sceneIndex,
    } = options;

    const framesDir = path.join(jobTempDir, `frames-scene-${sceneIndex}`);
    await fs.promises.mkdir(framesDir, { recursive: true });

    const totalFrames = Math.max(1, Math.round(durationSec * fps));
    const engine = new VectorAnimationEngine();

    // Render each frame deterministically
    for (let f = 0; f < totalFrames; f++) {
      const timestampSec = f / fps;
      const svgXml = engine.generateSvgFrame({
        animationData,
        timestampSec,
        width,
        height,
        resolveLocalPath: (url: string) => this.resolveLocalPath(url),
      });

      const pngBuffer = engine.rasterizeSvgToPng(svgXml, width);
      const frameFilename = `frame_${String(f).padStart(5, '0')}.png`;
      await fs.promises.writeFile(path.join(framesDir, frameFilename), pngBuffer);
    }

    const framePattern = path.join(framesDir, 'frame_%05d.png');
    const args: string[] = [
      '-y',
      '-framerate', String(fps),
      '-i', framePattern,
    ];

    if (audioPath && fs.existsSync(audioPath)) {
      args.push('-i', audioPath);
      args.push(
        '-t', String(durationSec),
        '-c:v', 'libx264',
        '-preset', 'veryfast',
        '-af', 'apad,aresample=44100',
        '-c:a', 'aac',
        '-b:a', '192k',
        '-ar', '44100',
        '-ac', '2',
        '-pix_fmt', 'yuv420p',
        outputPath
      );
    } else {
      args.push(
        '-f', 'lavfi',
        '-i', 'anullsrc=channel_layout=stereo:sample_rate=44100',
        '-t', String(durationSec),
        '-c:v', 'libx264',
        '-preset', 'veryfast',
        '-c:a', 'aac',
        '-b:a', '192k',
        '-ar', '44100',
        '-ac', '2',
        '-pix_fmt', 'yuv420p',
        outputPath
      );
    }

    await execFileAsync(ffmpegPath, args);
  }

  /**
   * Renders a scene segment from a pre-rendered video clip
   */
  private async renderVideoClipSceneSegment(options: {
    ffmpegPath: string;
    videoPath: string;
    audioPath: string | null;
    durationSec: number;
    width: number;
    height: number;
    fps: number;
    outputPath: string;
  }): Promise<void> {
    const { ffmpegPath, videoPath, audioPath, durationSec, width, height, fps, outputPath } = options;

    const vf = `scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2,format=yuv420p`;

    const args: string[] = ['-y', '-stream_loop', '-1', '-i', videoPath];

    if (audioPath) {
      args.push('-i', audioPath);
      args.push(
        '-t', String(durationSec),
        '-vf', vf,
        '-r', String(fps),
        '-map', '0:v',
        '-map', '1:a',
        '-c:v', 'libx264',
        '-preset', 'veryfast',
        '-af', 'apad,aresample=44100',
        '-c:a', 'aac',
        '-b:a', '192k',
        '-ar', '44100',
        '-ac', '2',
        '-pix_fmt', 'yuv420p',
        outputPath
      );
    } else {
      args.push(
        '-f', 'lavfi',
        '-i', 'anullsrc=channel_layout=stereo:sample_rate=44100',
        '-t', String(durationSec),
        '-vf', vf,
        '-r', String(fps),
        '-map', '0:v',
        '-map', '1:a',
        '-c:v', 'libx264',
        '-preset', 'veryfast',
        '-c:a', 'aac',
        '-b:a', '192k',
        '-ar', '44100',
        '-ac', '2',
        '-pix_fmt', 'yuv420p',
        outputPath
      );
    }

    await execFileAsync(ffmpegPath, args);
  }

  /**
   * Renders an individual scene segment from an image and optional audio
   */
  private async renderImageSceneSegment(options: {
    ffmpegPath: string;
    imagePath: string;
    audioPath: string | null;
    durationSec: number;
    width: number;
    height: number;
    fps: number;
    outputPath: string;
  }): Promise<void> {
    const { ffmpegPath, imagePath, audioPath, durationSec, width, height, fps, outputPath } = options;

    const vf = `scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2,format=yuv420p`;

    const args: string[] = ['-y', '-loop', '1', '-i', imagePath];

    if (audioPath) {
      args.push('-i', audioPath);
      args.push(
        '-t', String(durationSec),
        '-vf', vf,
        '-r', String(fps),
        '-c:v', 'libx264',
        '-preset', 'veryfast',
        '-af', 'apad,aresample=44100',
        '-c:a', 'aac',
        '-b:a', '192k',
        '-ar', '44100',
        '-ac', '2',
        '-pix_fmt', 'yuv420p',
        outputPath
      );
    } else {
      args.push(
        '-f', 'lavfi',
        '-i', 'anullsrc=channel_layout=stereo:sample_rate=44100',
        '-t', String(durationSec),
        '-vf', vf,
        '-r', String(fps),
        '-c:v', 'libx264',
        '-preset', 'veryfast',
        '-c:a', 'aac',
        '-b:a', '192k',
        '-ar', '44100',
        '-ac', '2',
        '-pix_fmt', 'yuv420p',
        outputPath
      );
    }

    await execFileAsync(ffmpegPath, args);
  }

  /**
   * Renders a clean card scene segment when no image is available
   */
  private async renderCardSceneSegment(options: {
    ffmpegPath: string;
    title: string;
    narration: string;
    audioPath: string | null;
    durationSec: number;
    width: number;
    height: number;
    fps: number;
    outputPath: string;
  }): Promise<void> {
    const { ffmpegPath, audioPath, durationSec, width, height, fps, outputPath } = options;

    const args: string[] = [
      '-y',
      '-f', 'lavfi',
      '-i', `color=c=0x18181b:s=${width}x${height}:d=${durationSec}:r=${fps}`,
    ];

    if (audioPath) {
      args.push('-i', audioPath);
      args.push(
        '-t', String(durationSec),
        '-c:v', 'libx264',
        '-preset', 'veryfast',
        '-af', 'apad,aresample=44100',
        '-c:a', 'aac',
        '-b:a', '192k',
        '-ar', '44100',
        '-ac', '2',
        '-pix_fmt', 'yuv420p',
        outputPath
      );
    } else {
      args.push(
        '-f', 'lavfi',
        '-i', 'anullsrc=channel_layout=stereo:sample_rate=44100',
        '-t', String(durationSec),
        '-c:v', 'libx264',
        '-preset', 'veryfast',
        '-c:a', 'aac',
        '-b:a', '192k',
        '-ar', '44100',
        '-ac', '2',
        '-pix_fmt', 'yuv420p',
        outputPath
      );
    }

    await execFileAsync(ffmpegPath, args);
  }

  private resolveLocalPath(urlPath: string): string {
    if (urlPath.startsWith('/storage/')) {
      return path.join(process.cwd(), urlPath.replace(/^\//, ''));
    }
    const match = urlPath.match(/\/storage\/(.+)$/);
    if (match) {
      return path.join(process.cwd(), this.storageDir, match[1]);
    }
    return path.resolve(urlPath);
  }
}

