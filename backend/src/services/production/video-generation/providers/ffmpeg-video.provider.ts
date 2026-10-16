import fs from 'fs';
import path from 'path';
import { promisify } from 'util';
import { execFile } from 'child_process';
// @ts-ignore
import ffmpegStatic from '@ffmpeg-installer/ffmpeg';
// @ts-ignore
import ffprobeStatic from '@ffprobe-installer/ffprobe';
import { VideoGenerationProvider, VideoGenerationInput, VideoGenerationOutput } from '../video-generation.provider.js';

const execFileAsync = promisify(execFile);

export class FFmpegVideoProvider implements VideoGenerationProvider {
  private storageDir: string;
  private videosDir: string;

  constructor() {
    this.storageDir = process.env.STORAGE_DIR || './storage';
    this.videosDir = path.join(process.cwd(), this.storageDir, 'videos');
    if (!fs.existsSync(this.videosDir)) {
      fs.mkdirSync(this.videosDir, { recursive: true });
    }
  }

  async generateVideo(input: VideoGenerationInput): Promise<VideoGenerationOutput> {
    const { imageUrl, duration = 4, audioUrl, cameraDirection } = input;

    if (!imageUrl) {
      throw new Error('FFmpegVideoProvider: imageUrl is required to render a video clip');
    }

    // Resolve local image path
    let localImagePath = '';
    if (imageUrl.startsWith('/storage/')) {
      localImagePath = path.join(process.cwd(), imageUrl.replace(/^\//, ''));
    } else if (imageUrl.startsWith('http://') || imageUrl.startsWith('https://')) {
      const storageMatch = imageUrl.match(/\/storage\/(.+)$/);
      if (storageMatch) {
        localImagePath = path.join(process.cwd(), this.storageDir, storageMatch[1]);
      } else {
        const res = await fetch(imageUrl);
        if (!res.ok) {
          throw new Error(`Failed to fetch remote image from ${imageUrl}`);
        }
        const buffer = Buffer.from(await res.arrayBuffer());
        const tempFilename = `temp-img-${Date.now()}.png`;
        localImagePath = path.join(this.videosDir, tempFilename);
        await fs.promises.writeFile(localImagePath, buffer);
      }
    } else {
      localImagePath = path.resolve(imageUrl);
    }

    if (!fs.existsSync(localImagePath)) {
      throw new Error(`Source image file does not exist at path: ${localImagePath}`);
    }

    // Resolve local audio path if provided
    let localAudioPath: string | null = null;
    if (audioUrl) {
      if (audioUrl.startsWith('/storage/')) {
        const p = path.join(process.cwd(), audioUrl.replace(/^\//, ''));
        if (fs.existsSync(p)) localAudioPath = p;
      } else if (audioUrl.startsWith('http://') || audioUrl.startsWith('https://')) {
        const match = audioUrl.match(/\/storage\/(.+)$/);
        if (match) {
          const p = path.join(process.cwd(), this.storageDir, match[1]);
          if (fs.existsSync(p)) localAudioPath = p;
        }
      } else if (fs.existsSync(path.resolve(audioUrl))) {
        localAudioPath = path.resolve(audioUrl);
      }
    }

    const timestamp = Date.now();
    const outputFilename = `scene-clip-${timestamp}.mp4`;
    const outputPath = path.join(this.videosDir, outputFilename);

    const ffmpegPath = ffmpegStatic?.path || 'ffmpeg';
    const fps = 30;
    const clipDuration = Math.max(1.5, Math.min(60, duration));
    const totalFrames = Math.max(fps * 2, Math.round(clipDuration * fps));

    console.log(`[FFmpegVideoProvider] Rendering Ken Burns clip from image: ${localImagePath} -> ${outputPath} (${clipDuration}s)`);

    // Build cinematic Ken Burns motion filter according to camera direction
    let zoomExpr: string;
    let xExpr: string;
    let yExpr: string;

    const zoomStep = (0.15 / totalFrames).toFixed(6);

    if (cameraDirection && cameraDirection.toLowerCase().includes('pan left-to-right')) {
      zoomExpr = `'1.1'`;
      xExpr = `'(iw-iw/zoom)*(on/${totalFrames})'`;
      yExpr = `'ih/2-(ih/zoom/2)'`;
    } else if (cameraDirection && cameraDirection.toLowerCase().includes('low angle')) {
      zoomExpr = `'1.12'`;
      xExpr = `'iw/2-(iw/zoom/2)'`;
      yExpr = `'(ih-ih/zoom)*(1-on/${totalFrames})'`;
    } else if (cameraDirection && cameraDirection.toLowerCase().includes('high angle')) {
      zoomExpr = `'1.12'`;
      xExpr = `'iw/2-(iw/zoom/2)'`;
      yExpr = `'(ih-ih/zoom)*(on/${totalFrames})'`;
    } else {
      // Default: smooth center zoom-in from 1.0 to 1.15
      zoomExpr = `'min(zoom+${zoomStep},1.15)'`;
      xExpr = `'iw/2-(iw/zoom/2)'`;
      yExpr = `'ih/2-(ih/zoom/2)'`;
    }

    const vf = `scale=1920:1080:force_original_aspect_ratio=increase,crop=1920:1080,zoompan=z=${zoomExpr}:x=${xExpr}:y=${yExpr}:d=${totalFrames}:s=1280x720:fps=${fps},format=yuv420p`;

    const args: string[] = ['-y', '-i', localImagePath];

    if (localAudioPath) {
      args.push('-i', localAudioPath);
    } else {
      // Silent stereo fallback stream
      args.push('-f', 'lavfi', '-i', 'anullsrc=channel_layout=stereo:sample_rate=44100');
    }

    args.push(
      '-vf', vf,
      '-t', String(clipDuration),
      '-c:v', 'libx264',
      '-preset', 'veryfast',
      '-pix_fmt', 'yuv420p',
      '-c:a', 'aac',
      '-b:a', '192k',
      '-ar', '44100',
      '-ac', '2',
      '-movflags', '+faststart',
      outputPath
    );

    try {
      await execFileAsync(ffmpegPath, args);
      console.log(`[FFmpegVideoProvider] Successfully rendered ${outputFilename}`);
    } catch (err: any) {
      console.error(`[FFmpegVideoProvider] FFmpeg render error:`, err);
      throw new Error(`Video rendering failed: ${err.message || String(err)}`);
    }

    // Verify output with ffprobe to determine exact duration
    let actualDuration = clipDuration;
    try {
      const { stdout } = await execFileAsync(ffprobeStatic.path, [
        '-v', 'error',
        '-show_entries', 'format=duration',
        '-of', 'json',
        outputPath,
      ]);
      const probe = JSON.parse(stdout);
      actualDuration = parseFloat(probe.format?.duration || String(clipDuration));
    } catch (probeErr) {
      console.warn('[FFmpegVideoProvider] FFprobe failed to verify duration:', probeErr);
    }

    return {
      url: `/storage/videos/${outputFilename}`,
      duration: actualDuration,
      motionType: 'ken-burns',
      provider: 'ffmpeg',
    };
  }
}


