import fs from 'fs';
import path from 'path';
import { promisify } from 'util';
import { execFile } from 'child_process';
import { randomUUID } from 'crypto';
// @ts-ignore
import * as googleTTS from 'google-tts-api';
// @ts-ignore
import ffprobeStatic from '@ffprobe-installer/ffprobe';
import { updateScene, createSceneVersion, getSceneBySceneId } from '../database/database.service.js';

const execFileAsync = promisify(execFile);

export class AudioGenerationService {
  private storageDir: string;
  private audioDir: string;

  constructor() {
    this.storageDir = process.env.STORAGE_DIR || './storage';
    this.audioDir = path.join(process.cwd(), this.storageDir, 'audio');
    if (!fs.existsSync(this.audioDir)) {
      fs.mkdirSync(this.audioDir, { recursive: true });
    }
  }

  /**
   * Generates spoken narration audio from text for a given scene.
   * Saves the audio file, accurately measures its duration with ffprobe,
   * updates the database record, and creates a scene version entry.
   */
  async generateNarrationAudio(options: {
    sceneId: string;
    narration: string;
    lang?: string;
  }): Promise<{
    audioUrl: string;
    durationMs: number;
    filename: string;
  }> {
    const { sceneId, narration, lang = 'en' } = options;

    if (!narration || narration.trim().length === 0) {
      throw new Error('Narration text is required for audio generation');
    }

    console.log(`[AudioGeneration] Generating narration for scene ${sceneId}: "${narration.substring(0, 60)}..."`);

    // Clean narration text: remove markdown formatting, stage directions, or extra symbols
    const cleanText = narration
      .replace(/\[.*?\]/g, '')
      .replace(/\(.*?\)/g, '')
      .replace(/[*_#`]/g, '')
      .trim();

    const textToSpeak = cleanText.length > 0 ? cleanText : narration.trim();

    // Generate MP3 using google-tts-api (supports multi-sentence arbitrary length text)
    let audioBuffer: Buffer;
    try {
      const audioChunks = await googleTTS.getAllAudioBase64(textToSpeak, {
        lang,
        slow: false,
        timeout: 15000,
      });
      audioBuffer = Buffer.concat(audioChunks.map((chunk: any) => Buffer.from(chunk.base64, 'base64')));
    } catch (err: any) {
      console.error(`[AudioGeneration] Google TTS generation failed for scene ${sceneId}:`, err);
      throw new Error(`TTS generation failed: ${err.message || String(err)}`);
    }

    const timestamp = Date.now();
    const filename = `narration-${sceneId}-${timestamp}.mp3`;
    const filePath = path.join(this.audioDir, filename);

    await fs.promises.writeFile(filePath, audioBuffer);
    console.log(`[AudioGeneration] Audio file saved to ${filePath}, size: ${audioBuffer.length} bytes`);

    // Accurately probe duration using ffprobe
    let durationMs = 0;
    try {
      durationMs = await this.probeAudioDuration(filePath);
      console.log(`[AudioGeneration] Probed audio duration: ${durationMs}ms`);
    } catch (probeError) {
      console.warn(`[AudioGeneration] Failed to probe duration via ffprobe, estimating from word count:`, probeError);
      const words = textToSpeak.split(/\s+/).length;
      durationMs = Math.round(words * 450 + 1000);
    }

    const audioUrl = `/storage/audio/${filename}`;

    // Update scene in database
    const existingScene = await getSceneBySceneId(sceneId);
    if (existingScene) {
      await updateScene(existingScene.sceneId, {
        audioUrl,
        actualAudioDurationMs: durationMs,
        generationStatus: 'completed',
      });

      // Record a SceneVersion
      await createSceneVersion({
        id: randomUUID(),
        sceneId: existingScene.sceneId,
        narration: textToSpeak,
        audioUrl,
        durationMs,
        prompt: existingScene.visualPrompt,
        cameraDirection: existingScene.cameraDirection,
        imageUrl: existingScene.imageUrl,
        videoUrl: existingScene.videoUrl,
      });
    }

    return {
      audioUrl,
      durationMs,
      filename,
    };
  }

  /**
   * Removes narration audio from a scene with database and version history record
   */
  async removeSceneAudio(sceneId: string): Promise<void> {
    const existingScene = await getSceneBySceneId(sceneId);
    if (!existingScene) {
      throw new Error('Scene not found');
    }

    await updateScene(existingScene.sceneId, {
      audioUrl: null,
      actualAudioDurationMs: null,
    });

    await createSceneVersion({
      id: randomUUID(),
      sceneId: existingScene.sceneId,
      narration: existingScene.narration,
      audioUrl: null,
      durationMs: existingScene.estimatedDurationMs || 5000,
      prompt: existingScene.visualPrompt,
      cameraDirection: existingScene.cameraDirection,
      imageUrl: existingScene.imageUrl,
      videoUrl: existingScene.videoUrl,
    });

    console.log(`[AudioGeneration] Removed narration audio for scene ${sceneId}`);
  }

  /**
   * Saves a user-uploaded audio file (background music or custom narration)
   */
  async saveUploadedAudio(options: {
    filename: string;
    base64Data: string;
    category?: 'music' | 'narration' | 'sfx';
  }): Promise<{
    url: string;
    filename: string;
    durationMs: number;
    name: string;
  }> {
    const { filename, base64Data, category = 'music' } = options;
    const cleanName = path.basename(filename).replace(/[^a-zA-Z0-9._-]/g, '_');
    const ext = path.extname(cleanName).toLowerCase();
    if (!['.mp3', '.wav', '.m4a', '.ogg', '.aac'].includes(ext)) {
      throw new Error(`Unsupported audio format "${ext}". Supported formats: .mp3, .wav, .m4a, .ogg, .aac`);
    }

    const targetFolder = category === 'music'
      ? path.join(process.cwd(), this.storageDir, 'music')
      : path.join(this.audioDir, 'uploads');

    if (!fs.existsSync(targetFolder)) {
      fs.mkdirSync(targetFolder, { recursive: true });
    }

    const finalFilename = `upload-${Date.now()}-${cleanName}`;
    const targetPath = path.join(targetFolder, finalFilename);

    const buffer = Buffer.from(base64Data, 'base64');
    if (buffer.length > 25 * 1024 * 1024) {
      throw new Error('Audio file exceeds maximum size limit (25MB)');
    }

    await fs.promises.writeFile(targetPath, buffer);

    let durationMs = 0;
    try {
      durationMs = await this.probeAudioDuration(targetPath);
    } catch (e) {
      console.warn('[AudioGeneration] Probing uploaded audio duration failed:', e);
    }

    const relativeUrl = category === 'music'
      ? `/storage/music/${finalFilename}`
      : `/storage/audio/uploads/${finalFilename}`;

    return {
      url: relativeUrl,
      filename: finalFilename,
      durationMs,
      name: cleanName.replace(ext, ''),
    };
  }

  /**
   * Reads exact audio duration in milliseconds using ffprobe
   */
  async probeAudioDuration(filePath: string): Promise<number> {
    const ffprobePath = ffprobeStatic?.path || 'ffprobe';
    const { stdout } = await execFileAsync(ffprobePath, [
      '-v',
      'error',
      '-show_entries',
      'format=duration',
      '-of',
      'default=noprint_wrappers=1:nokey=1',
      filePath,
    ]);

    const seconds = parseFloat(stdout.trim());
    if (Number.isFinite(seconds) && seconds > 0) {
      return Math.round(seconds * 1000);
    }
    throw new Error(`Invalid duration output from ffprobe: "${stdout}"`);
  }
}


