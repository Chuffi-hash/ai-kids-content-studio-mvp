import fs from 'fs';
import path from 'path';
import { promisify } from 'util';
import { execFile } from 'child_process';
// @ts-ignore
import ffmpegStatic from '@ffmpeg-installer/ffmpeg';
// @ts-ignore
import ffprobeStatic from '@ffprobe-installer/ffprobe';
import { AudioEffectType } from './tts-provider.interface.js';

const execFileAsync = promisify(execFile);

export class AudioEffectsService {
  private ffmpegPath: string;
  private ffprobePath: string;

  constructor() {
    this.ffmpegPath = ffmpegStatic?.path || 'ffmpeg';
    this.ffprobePath = ffprobeStatic?.path || 'ffprobe';
  }

  /**
   * Applies selected voice effect (normal, robot, cartoon) to an input audio file.
   * If effect is 'normal', copies or passes through without re-encoding.
   */
  async applyEffect(
    inputAudioPath: string,
    outputAudioPath: string,
    effect: AudioEffectType = 'normal'
  ): Promise<{ durationMs: number; outputPath: string }> {
    if (!fs.existsSync(inputAudioPath)) {
      throw new Error(`Input audio file not found: ${inputAudioPath}`);
    }

    // Ensure output directory exists
    const outDir = path.dirname(outputAudioPath);
    if (!fs.existsSync(outDir)) {
      fs.mkdirSync(outDir, { recursive: true });
    }

    if (effect === 'normal') {
      // If same path, nothing to do
      if (path.resolve(inputAudioPath) !== path.resolve(outputAudioPath)) {
        await fs.promises.copyFile(inputAudioPath, outputAudioPath);
      }
      const durationMs = await this.probeDuration(outputAudioPath);
      return { durationMs, outputPath: outputAudioPath };
    }

    let filterString = '';
    if (effect === 'robot') {
      // Distinct, authentic electronic robotic effect with flanger + modulated delay + bandpass
      filterString = 'aecho=0.8:0.8:14:0.7,flanger=delay=7:depth=4:regen=60:width=80:speed=10,highpass=f=200,lowpass=f=4200,volume=1.2';
    } else if (effect === 'cartoon') {
      // Playful cartoon pitch shift with synchronized tempo preservation
      filterString = 'asetrate=24000*1.32,atempo=1/1.32,volume=1.1';
    } else {
      filterString = 'anull';
    }

    const args = [
      '-y',
      '-i', inputAudioPath,
      '-af', filterString,
      outputAudioPath,
    ];

    try {
      await execFileAsync(this.ffmpegPath, args);
    } catch (err: any) {
      console.error(`[AudioEffectsService] FFmpeg effect "${effect}" failed:`, err);
      throw new Error(`Failed to apply audio effect "${effect}": ${err.message || String(err)}`);
    }

    const durationMs = await this.probeDuration(outputAudioPath);
    return { durationMs, outputPath: outputAudioPath };
  }

  /**
   * Probes duration in milliseconds via ffprobe
   */
  async probeDuration(filePath: string): Promise<number> {
    try {
      const { stdout } = await execFileAsync(this.ffprobePath, [
        '-v', 'error',
        '-show_entries', 'format=duration',
        '-of', 'default=noprint_wrappers=1:nokey=1',
        filePath,
      ]);
      const sec = parseFloat(stdout.trim());
      if (Number.isFinite(sec) && sec > 0) {
        return Math.round(sec * 1000);
      }
    } catch (e) {
      console.warn(`[AudioEffectsService] probeDuration failed for ${filePath}:`, e);
    }
    return 3000;
  }
}

