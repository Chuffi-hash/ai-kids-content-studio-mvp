import fs from 'fs';
import path from 'path';
import { promisify } from 'util';
import { execFile } from 'child_process';
import { randomUUID } from 'crypto';
// @ts-ignore
import ffmpegStatic from '@ffmpeg-installer/ffmpeg';
// @ts-ignore
import ffprobeStatic from '@ffprobe-installer/ffprobe';
import { getStoryByStoryId, getScenesByStoryId, getImagesBySceneId } from '../database/database.service.js';
import { VectorAnimationEngine } from '../animation/vector-animation.engine.js';
import { AudioGenerationService } from '../audio-generation/audio-generation.service.js';

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
  private audioGenerationService = new AudioGenerationService();

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
    format?: '16:9' | '9:16' | '1:1' | '4:5' | 'custom';
    selectedSceneIds?: string[];
    targetDurationSec?: number;
  }): ExportJob {
    const {
      storyId,
      resolution = '720p',
      fps = 30,
      backgroundMusic,
      musicVolume = 0.2,
      format = '16:9',
      selectedSceneIds,
      targetDurationSec,
    } = options;
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
    this.processExport({
      jobId,
      storyId,
      resolution,
      fps,
      backgroundMusic,
      musicVolume,
      format,
      selectedSceneIds,
      targetDurationSec,
    }).catch((err) => {
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
  private async processExport(options: {
    jobId: string;
    storyId: string;
    resolution: '1080p' | '720p';
    fps: number;
    backgroundMusic?: string | null;
    musicVolume?: number;
    format?: '16:9' | '9:16' | '1:1' | '4:5' | 'custom';
    selectedSceneIds?: string[];
    targetDurationSec?: number;
  }): Promise<void> {
    const {
      jobId,
      storyId,
      resolution,
      fps,
      backgroundMusic,
      musicVolume = 0.2,
      format = '16:9',
      selectedSceneIds,
    } = options;

    const job = jobs.get(jobId);
    if (!job) return;

    job.status = 'processing';
    job.progress = 5;
    job.stage = 'Loading story and scene data...';

    const story = await getStoryByStoryId(storyId);
    if (!story) {
      throw new Error(`Story not found: ${storyId}`);
    }

    const allScenes = await getScenesByStoryId(storyId, false);
    if (!allScenes || allScenes.length === 0) {
      throw new Error('This story has no scenes to export. Generate scenes first.');
    }

    let scenes = allScenes;
    if (Array.isArray(selectedSceneIds) && selectedSceneIds.length > 0) {
      const filtered = allScenes.filter(
        (s) => selectedSceneIds.includes(s.sceneId) || selectedSceneIds.includes(s.id)
      );
      if (filtered.length > 0) {
        scenes = filtered;
      }
    }

    const jobTempDir = path.join(this.tempDir, `export-${jobId}`);
    await fs.promises.mkdir(jobTempDir, { recursive: true });

    let width = 1280;
    let height = 720;
    if (format === '9:16') {
      width = resolution === '1080p' ? 1080 : 720;
      height = resolution === '1080p' ? 1920 : 1280;
    } else if (format === '1:1') {
      width = resolution === '1080p' ? 1080 : 720;
      height = resolution === '1080p' ? 1080 : 720;
    } else if (format === '4:5') {
      width = resolution === '1080p' ? 1080 : 720;
      height = resolution === '1080p' ? 1350 : 900;
    } else {
      width = resolution === '1080p' ? 1920 : 1280;
      height = resolution === '1080p' ? 1080 : 720;
    }

    // Ensure width and height are always even integers for H.264/yuv420p encoder compatibility
    width = Math.round(width / 2) * 2;
    height = Math.round(height / 2) * 2;

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
        // Ensure scene is long enough for any character dialogue lines
        if ((scene as any).animationData?.dialogueLines) {
          for (const line of (scene as any).animationData.dialogueLines) {
            const lineEndSec = ((line.startMs || 0) + (line.durationMs || 0)) / 1000;
            if (lineEndSec > durationSec) {
              durationSec = lineEndSec;
            }
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
          if (!fs.existsSync(audioPath)) {
            console.warn(`[VideoAssembly] Audio file for scene ${scene.number || i + 1} not found at: ${audioPath}`);
          }
        }

        // Auto-generate missing narration audio on the fly if needed
        if (scene.narration && (!audioPath || !fs.existsSync(audioPath))) {
          try {
            console.log(`[VideoAssembly] Auto-generating missing narration audio for scene ${scene.number || i + 1}...`);
            const narrResult = await this.audioGenerationService.generateNarrationAudio({
              sceneId: scene.sceneId || scene.id,
              narration: scene.narration,
            });
            if (narrResult?.audioUrl) {
              scene.audioUrl = narrResult.audioUrl;
              audioPath = this.resolveLocalPath(narrResult.audioUrl);
            }
          } catch (narrErr) {
            console.warn(`[VideoAssembly] Auto-generation of narration audio for scene ${scene.number || i + 1} notice:`, narrErr);
          }
        }

        const segmentPath = path.join(jobTempDir, `scene-${i}.mp4`);

        // Auto-generate missing dialogue audio files on the fly if needed
        if ((scene.id || scene.sceneId) && Array.isArray((scene as any).animationData?.dialogueLines)) {
          const hasUnbuiltDialogue = (scene as any).animationData.dialogueLines.some((d: any) => {
            if (!d.text || !d.text.trim()) return false;
            if (!d.audioUrl) return true;
            return !fs.existsSync(this.resolveLocalPath(d.audioUrl));
          });
          if (hasUnbuiltDialogue) {
            try {
              console.log(`[VideoAssembly] Auto-generating missing dialogue audio for scene ${scene.number || i + 1}...`);
              const genLines = await this.audioGenerationService.generateAllSceneDialogues(scene.sceneId || scene.id);
              if (genLines && genLines.length > 0) {
                (scene as any).animationData.dialogueLines = genLines;
              }
            } catch (err) {
              console.warn(`[VideoAssembly] Auto-generation of dialogue audio for scene ${scene.number || i + 1} notice:`, err);
            }
          }
        }

        // Collect valid dialogue audio files for the scene
        const dialogueAudios: Array<{ path: string; startMs: number; volume?: number }> = [];
        if (Array.isArray((scene as any).animationData?.dialogueLines)) {
          for (const line of (scene as any).animationData.dialogueLines) {
            if (line.audioUrl) {
              const resolved = this.resolveLocalPath(line.audioUrl);
              if (fs.existsSync(resolved)) {
                dialogueAudios.push({
                  path: resolved,
                  startMs: Math.max(0, line.startMs || 0),
                  volume: typeof line.volume === 'number' && Number.isFinite(line.volume) ? line.volume : 1.0,
                });
              }
            }
          }
        }

        // Case 0: Vector character animation exists
        if ((scene as any).animationData && (scene as any).animationData.characterInstances?.length > 0) {
          await this.renderVectorAnimationSceneSegment({
            ffmpegPath,
            animationData: {
              ...(scene as any).animationData,
              // Mirror PreviewCanvas: if no valid animation background is set, use the scene image.
              // Passing a resolved local path also supports scenes whose background was found in the Images table.
              background:
                (scene as any).animationData.background?.imageUrl &&
                fs.existsSync(this.resolveLocalPath((scene as any).animationData.background.imageUrl))
                  ? (scene as any).animationData.background
                  : imagePath && fs.existsSync(imagePath)
                    ? {
                        imageUrl: imagePath,
                        fit: (scene as any).animationData.background?.fit || 'cover',
                      }
                    : (scene as any).animationData.background,
            },
            audioPath: audioPath && fs.existsSync(audioPath) ? audioPath : null,
            dialogueAudios,
            durationSec,
            width,
            height,
            fps,
            activeFormat: format,
            outputPath: segmentPath,
            jobTempDir,
            sceneIndex: i,
            onProgress: (frameIndex: number, totalFrames: number) => {
              const baseProgress = 10 + (i / scenes.length) * 65;
              const sceneSpan = (1 / scenes.length) * 65;
              job.progress = Math.round(baseProgress + (frameIndex / totalFrames) * sceneSpan);
              job.stage = `Rendering scene ${sceneNum} of ${scenes.length}: "${scene.title}" (frame ${frameIndex + 1}/${totalFrames})...`;
            },
          });
        }
        // Case 1: Pre-rendered video clip exists
        else if (videoClipPath && fs.existsSync(videoClipPath)) {
          await this.renderVideoClipSceneSegment({
            ffmpegPath,
            videoPath: videoClipPath,
            audioPath: audioPath && fs.existsSync(audioPath) ? audioPath : null,
            dialogueAudios,
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
            dialogueAudios,
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
            dialogueAudios,
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
        '-nostdin',
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
      const formatTag = format === '9:16' ? 'reel-9x16' : (format === '1:1' ? 'square-1x1' : (format === '4:5' ? 'portrait-4x5' : 'landscape-16x9'));
      const finalFilename = `${cleanTitle}-${formatTag}-${timestamp}.mp4`;
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
        job.stage = 'Mixing soundtrack with audio ducking and mastering output audio...';
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
          '-i', assembledPath,
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
          finalOutputPath,
        ]);
      } else {
        job.stage = 'Mastering audio to broadcast standard (-16 LUFS)...';
        await execFileAsync(ffmpegPath, [
          '-nostdin',
          '-y',
          '-thread_queue_size', '512',
          '-i', assembledPath,
          '-filter_complex', '[0:a]aresample=44100,aformat=channel_layouts=stereo,loudnorm=I=-16:TP=-1.5:LRA=11[aout]',
          '-map', '0:v',
          '-map', '[aout]',
          '-c:v', 'copy',
          '-c:a', 'aac',
          '-b:a', '192k',
          '-ar', '44100',
          finalOutputPath,
        ]);
      }

      // Do not report success unless a non-empty output file exists and ffprobe can read it.
      const outputStat = await fs.promises.stat(finalOutputPath).catch(() => null);
      if (!outputStat || !outputStat.isFile() || outputStat.size === 0) {
        throw new Error('Video export did not produce a non-empty MP4 file.');
      }

      const ffprobePath = ffprobeStatic?.path || 'ffprobe';
      const { stdout: probeStdout } = await execFileAsync(ffprobePath, [
        '-v', 'error',
        '-show_entries', 'format=duration:stream=codec_type,codec_name',
        '-of', 'json',
        finalOutputPath,
      ]);
      const probe = JSON.parse(probeStdout);
      const hasVideoStream = probe.streams?.some(
        (stream: any) => stream.codec_type === 'video' && stream.codec_name === 'h264'
      );
      const hasAudioStream = probe.streams?.some(
        (stream: any) => stream.codec_type === 'audio' && stream.codec_name === 'aac'
      );
      const outputDurationSec = Number.parseFloat(probe.format?.duration || '0');
      if (!hasVideoStream || !hasAudioStream || !Number.isFinite(outputDurationSec) || outputDurationSec <= 0) {
        throw new Error('Export validation failed: expected playable H.264 video and AAC audio streams.');
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
   * Builds FFmpeg audio input arguments, filtergraph, and stream mappings
   * for mixing narration and character dialogue lines into any scene video segment.
   */
  private buildAudioMixFfmpegArgs(options: {
    videoInputCount: number;
    audioPath: string | null;
    dialogueAudios: Array<{ path: string; startMs: number; volume?: number }>;
    durationSec: number;
    videoFilter?: string;
  }): {
    audioInputArgs: string[];
    filterComplexArgs: string[];
    mapArgs: string[];
  } {
    const { videoInputCount, audioPath, dialogueAudios, durationSec, videoFilter } = options;
    const hasNarration = Boolean(audioPath && fs.existsSync(audioPath));
    const hasDialogue = dialogueAudios.length > 0;
    const safeDurationStr = Math.max(0.1, durationSec).toFixed(3);
    const wholeSamples = Math.round(Math.max(0.1, durationSec) * 44100);

    const filterParts: string[] = [];
    if (videoFilter) {
      filterParts.push(`[0:v]${videoFilter}[vout]`);
    }

    if (hasNarration && hasDialogue) {
      const audioInputArgs = [
        '-thread_queue_size', '512',
        '-i', audioPath!,
        ...dialogueAudios.flatMap((d) => ['-thread_queue_size', '512', '-i', d.path])
      ];
      filterParts.push(`[${videoInputCount}:a]volume=1.0,aresample=44100,aformat=channel_layouts=stereo[a_narr]`);
      const mixInputs: string[] = ['[a_narr]'];

      dialogueAudios.forEach((d, idx) => {
        const inputIdx = videoInputCount + 1 + idx;
        const safeDelay = Math.max(1, d.startMs || 0);
        const vol = typeof d.volume === 'number' && Number.isFinite(d.volume) ? Math.max(0, Math.min(2.0, d.volume)) : 1.0;
        const label = `[a_dlg${idx}]`;
        filterParts.push(`[${inputIdx}:a]adelay=${safeDelay}|${safeDelay},volume=${vol.toFixed(2)},aresample=44100,aformat=channel_layouts=stereo${label}`);
        mixInputs.push(label);
      });

      filterParts.push(
        `${mixInputs.join('')}amix=inputs=${mixInputs.length}:dropout_transition=0:duration=longest,volume=${mixInputs.length},alimiter=limit=0.95,apad=whole_len=${wholeSamples},atrim=0:${safeDurationStr},aresample=44100,aformat=channel_layouts=stereo[aout]`
      );

      return {
        audioInputArgs,
        filterComplexArgs: ['-filter_complex', filterParts.join(';')],
        mapArgs: ['-map', videoFilter ? '[vout]' : '0:v', '-map', '[aout]'],
      };
    } else if (hasNarration && !hasDialogue) {
      const audioInputArgs = ['-thread_queue_size', '512', '-i', audioPath!];
      filterParts.push(`[${videoInputCount}:a]volume=1.0,apad=whole_len=${wholeSamples},atrim=0:${safeDurationStr},aresample=44100,aformat=channel_layouts=stereo[aout]`);
      return {
        audioInputArgs,
        filterComplexArgs: ['-filter_complex', filterParts.join(';')],
        mapArgs: ['-map', videoFilter ? '[vout]' : '0:v', '-map', '[aout]'],
      };
    } else if (!hasNarration && hasDialogue) {
      const audioInputArgs = dialogueAudios.flatMap((d) => ['-thread_queue_size', '512', '-i', d.path]);
      const mixInputs: string[] = [];

      dialogueAudios.forEach((d, idx) => {
        const inputIdx = videoInputCount + idx;
        const safeDelay = Math.max(1, d.startMs || 0);
        const vol = typeof d.volume === 'number' && Number.isFinite(d.volume) ? Math.max(0, Math.min(2.0, d.volume)) : 1.0;
        const label = `[a_dlg${idx}]`;
        filterParts.push(`[${inputIdx}:a]adelay=${safeDelay}|${safeDelay},volume=${vol.toFixed(2)},aresample=44100,aformat=channel_layouts=stereo${label}`);
        mixInputs.push(label);
      });

      if (dialogueAudios.length === 1) {
        filterParts.push(`[a_dlg0]apad=whole_len=${wholeSamples},atrim=0:${safeDurationStr},aresample=44100,aformat=channel_layouts=stereo[aout]`);
      } else {
        filterParts.push(
          `${mixInputs.join('')}amix=inputs=${mixInputs.length}:dropout_transition=0:duration=longest,volume=${mixInputs.length},alimiter=limit=0.95,apad=whole_len=${wholeSamples},atrim=0:${safeDurationStr},aresample=44100,aformat=channel_layouts=stereo[aout]`
        );
      }

      return {
        audioInputArgs,
        filterComplexArgs: ['-filter_complex', filterParts.join(';')],
        mapArgs: ['-map', videoFilter ? '[vout]' : '0:v', '-map', '[aout]'],
      };
    } else {
      const audioInputArgs = [
        '-thread_queue_size', '512',
        '-f', 'lavfi',
        '-i', 'anullsrc=channel_layout=stereo:sample_rate=44100',
      ];
      filterParts.push(`[${videoInputCount}:a]atrim=0:${safeDurationStr},aresample=44100,aformat=channel_layouts=stereo[aout]`);
      return {
        audioInputArgs,
        filterComplexArgs: ['-filter_complex', filterParts.join(';')],
        mapArgs: ['-map', videoFilter ? '[vout]' : '0:v', '-map', '[aout]'],
      };
    }
  }

  /**
   * Renders an individual scene segment from vector animation data using Resvg and FFmpeg
   */
  private async renderVectorAnimationSceneSegment(options: {
    ffmpegPath: string;
    animationData: any;
    audioPath: string | null;
    dialogueAudios?: Array<{ path: string; startMs: number; volume?: number }>;
    durationSec: number;
    width: number;
    height: number;
    fps: number;
    activeFormat?: string;
    outputPath: string;
    jobTempDir: string;
    sceneIndex: number;
    onProgress?: (frameIndex: number, totalFrames: number) => void;
  }): Promise<void> {
    const {
      ffmpegPath,
      animationData,
      audioPath,
      dialogueAudios: passedDialogueAudios,
      durationSec,
      width,
      height,
      fps,
      activeFormat,
      outputPath,
      jobTempDir,
      sceneIndex,
      onProgress,
    } = options;

    const framesDir = path.join(jobTempDir, `frames-scene-${sceneIndex}`);
    await fs.promises.mkdir(framesDir, { recursive: true });

    const totalFrames = Math.max(1, Math.round(durationSec * fps));
    const engine = new VectorAnimationEngine();

    // Render each frame deterministically
    for (let f = 0; f < totalFrames; f++) {
      if (onProgress && (f % 5 === 0 || f === totalFrames - 1)) {
        onProgress(f, totalFrames);
      }
      const timestampSec = f / fps;
      const svgXml = engine.generateSvgFrame({
        animationData,
        timestampSec,
        width,
        height,
        activeFormat: activeFormat as any,
        resolveLocalPath: (url: string) => this.resolveLocalPath(url),
      });

      const pngBuffer = engine.rasterizeSvgToPng(svgXml, width);
      const frameFilename = `frame_${String(f).padStart(5, '0')}.png`;
      await fs.promises.writeFile(path.join(framesDir, frameFilename), pngBuffer);
    }

    // Collect valid dialogue audio files
    const dialogueAudios = passedDialogueAudios ? [...passedDialogueAudios] : [];
    if (!passedDialogueAudios && Array.isArray(animationData.dialogueLines)) {
      for (const line of animationData.dialogueLines) {
        if (line.audioUrl) {
          const resolved = this.resolveLocalPath(line.audioUrl);
          if (fs.existsSync(resolved)) {
            dialogueAudios.push({
              path: resolved,
              startMs: Math.max(0, line.startMs || 0),
              volume: typeof line.volume === 'number' && Number.isFinite(line.volume) ? line.volume : 1.0,
            });
          }
        }
      }
    }

    const framePattern = path.join(framesDir, 'frame_%05d.png');
    const { audioInputArgs, filterComplexArgs, mapArgs } = this.buildAudioMixFfmpegArgs({
      videoInputCount: 1,
      audioPath,
      dialogueAudios,
      durationSec,
    });

    const args: string[] = [
      '-nostdin',
      '-y',
      '-thread_queue_size', '512',
      '-framerate', String(fps),
      '-i', framePattern,
      ...audioInputArgs,
      ...filterComplexArgs,
      ...mapArgs,
      '-t', String(durationSec),
      '-c:v', 'libx264',
      '-preset', 'veryfast',
      '-c:a', 'aac',
      '-b:a', '192k',
      '-ar', '44100',
      '-ac', '2',
      '-pix_fmt', 'yuv420p',
      outputPath,
    ];

    await execFileAsync(ffmpegPath, args);
  }

  /**
   * Renders a scene segment from a pre-rendered video clip
   */
  private async renderVideoClipSceneSegment(options: {
    ffmpegPath: string;
    videoPath: string;
    audioPath: string | null;
    dialogueAudios?: Array<{ path: string; startMs: number; volume?: number }>;
    durationSec: number;
    width: number;
    height: number;
    fps: number;
    outputPath: string;
  }): Promise<void> {
    const {
      ffmpegPath,
      videoPath,
      audioPath,
      dialogueAudios = [],
      durationSec,
      width,
      height,
      fps,
      outputPath,
    } = options;

    const vf = `scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2,format=yuv420p`;
    const { audioInputArgs, filterComplexArgs, mapArgs } = this.buildAudioMixFfmpegArgs({
      videoInputCount: 1,
      audioPath,
      dialogueAudios,
      durationSec,
      videoFilter: vf,
    });

    const args: string[] = [
      '-nostdin',
      '-y',
      '-thread_queue_size', '512',
      '-stream_loop', '-1',
      '-i', videoPath,
      ...audioInputArgs,
      ...filterComplexArgs,
      ...mapArgs,
      '-t', String(durationSec),
      '-r', String(fps),
      '-c:v', 'libx264',
      '-preset', 'veryfast',
      '-c:a', 'aac',
      '-b:a', '192k',
      '-ar', '44100',
      '-ac', '2',
      '-pix_fmt', 'yuv420p',
      outputPath,
    ];

    await execFileAsync(ffmpegPath, args);
  }

  /**
   * Renders an individual scene segment from an image and optional audio
   */
  private async renderImageSceneSegment(options: {
    ffmpegPath: string;
    imagePath: string;
    audioPath: string | null;
    dialogueAudios?: Array<{ path: string; startMs: number; volume?: number }>;
    durationSec: number;
    width: number;
    height: number;
    fps: number;
    outputPath: string;
  }): Promise<void> {
    const {
      ffmpegPath,
      imagePath,
      audioPath,
      dialogueAudios = [],
      durationSec,
      width,
      height,
      fps,
      outputPath,
    } = options;

    const vf = `scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2,format=yuv420p`;
    const { audioInputArgs, filterComplexArgs, mapArgs } = this.buildAudioMixFfmpegArgs({
      videoInputCount: 1,
      audioPath,
      dialogueAudios,
      durationSec,
      videoFilter: vf,
    });

    const args: string[] = [
      '-nostdin',
      '-y',
      '-thread_queue_size', '512',
      '-loop', '1',
      '-i', imagePath,
      ...audioInputArgs,
      ...filterComplexArgs,
      ...mapArgs,
      '-t', String(durationSec),
      '-r', String(fps),
      '-c:v', 'libx264',
      '-preset', 'veryfast',
      '-c:a', 'aac',
      '-b:a', '192k',
      '-ar', '44100',
      '-ac', '2',
      '-pix_fmt', 'yuv420p',
      outputPath,
    ];

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
    dialogueAudios?: Array<{ path: string; startMs: number; volume?: number }>;
    durationSec: number;
    width: number;
    height: number;
    fps: number;
    outputPath: string;
  }): Promise<void> {
    const {
      ffmpegPath,
      audioPath,
      dialogueAudios = [],
      durationSec,
      width,
      height,
      fps,
      outputPath,
    } = options;

    const { audioInputArgs, filterComplexArgs, mapArgs } = this.buildAudioMixFfmpegArgs({
      videoInputCount: 1,
      audioPath,
      dialogueAudios,
      durationSec,
    });

    const args: string[] = [
      '-nostdin',
      '-y',
      '-thread_queue_size', '512',
      '-f', 'lavfi',
      '-i', `color=c=0x18181b:s=${width}x${height}:d=${durationSec}:r=${fps}`,
      ...audioInputArgs,
      ...filterComplexArgs,
      ...mapArgs,
      '-t', String(durationSec),
      '-c:v', 'libx264',
      '-preset', 'veryfast',
      '-c:a', 'aac',
      '-b:a', '192k',
      '-ar', '44100',
      '-ac', '2',
      '-pix_fmt', 'yuv420p',
      outputPath,
    ];

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

