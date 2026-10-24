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
   * Applies selected voice effect (normal, robot, cartoon, whisper, shout)
   * and optional prosody adjustments (pitch shift and formant presence) to an input audio file.
   * If effect is 'normal' and no prosody adjustments are needed, copies without re-encoding.
   */
  async applyEffect(
    inputAudioPath: string,
    outputAudioPath: string,
    effect: AudioEffectType = 'normal',
    prosody?: {
      pitchShiftSemitones?: number;
      presenceGainDb?: number;
      sampleRate?: number;
    }
  ): Promise<{ durationMs: number; outputPath: string }> {
    if (!fs.existsSync(inputAudioPath)) {
      throw new Error(`Input audio file not found: ${inputAudioPath}`);
    }

    // Ensure output directory exists
    const outDir = path.dirname(outputAudioPath);
    if (!fs.existsSync(outDir)) {
      fs.mkdirSync(outDir, { recursive: true });
    }

    const pitchShift = prosody?.pitchShiftSemitones || 0;
    const presenceGain = prosody?.presenceGainDb || 0;
    const hasPitchProsody = Math.abs(pitchShift) >= 0.05;
    const hasPresenceProsody = Math.abs(presenceGain) >= 0.1;
    const hasProsody = hasPitchProsody || hasPresenceProsody;

    if (effect === 'normal' && !hasProsody) {
      // If same path, nothing to do
      if (path.resolve(inputAudioPath) !== path.resolve(outputAudioPath)) {
        await fs.promises.copyFile(inputAudioPath, outputAudioPath);
      }
      const durationMs = await this.probeDuration(outputAudioPath);
      return { durationMs, outputPath: outputAudioPath };
    }

    const filters: string[] = [];

    // 1. Base Effect Filters
    if (effect === 'robot') {
      filters.push('aecho=0.8:0.8:14:0.7,flanger=delay=7:depth=4:regen=60:width=80:speed=10,highpass=f=200,lowpass=f=4200,volume=1.2');
    } else if (effect === 'cartoon') {
      filters.push('asetrate=24000*1.32,atempo=1/1.32,volume=1.1');
    } else if (effect === 'whisper') {
      filters.push('highpass=f=350,lowpass=f=7500,volume=0.9');
    } else if (effect === 'shout') {
      filters.push('equalizer=f=2400:width_type=o:width=1.2:g=3.5,acompressor=threshold=-14dB:ratio=3:attack=5:release=50,volume=1.25');
    }

    // 2. Emotion Prosody & Pitch Calibration Filters (applied without altering master volume)
    if (hasPitchProsody && effect !== 'cartoon') {
      const sr = prosody?.sampleRate || 24000;
      const factor = Math.pow(2, pitchShift / 12);
      filters.push(`asetrate=${Math.round(sr * factor)},atempo=${(1 / factor).toFixed(5)},aresample=${sr}`);
    }

    if (hasPresenceProsody) {
      filters.push(`equalizer=f=3200:width_type=q:width=1.0:g=${presenceGain.toFixed(1)}`);
    }

    const filterString = filters.length > 0 ? filters.join(',') : 'anull';

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

