import fs from 'fs';
import path from 'path';
import { promisify } from 'util';
import { execFile } from 'child_process';
import { randomUUID } from 'crypto';
// @ts-ignore
import ffprobeStatic from '@ffprobe-installer/ffprobe';
import { updateScene, createSceneVersion, getSceneBySceneId, getCharacterById } from '../database/database.service.js';
import { TTSProviderFactory } from './tts-provider.factory.js';
import { AudioEffectType, SupportedVoice } from './tts-provider.interface.js';
import { generateVisemeCues } from './viseme-generator.js';
import { SceneDialogue, SpeakingDirection } from '../animation/vector-animation.engine.js';

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
   * Retrieves available voices catalogue and system capabilities.
   */
  async getVoices(): Promise<{
    activeProvider: string;
    isKokoroAvailable: boolean;
    voices: SupportedVoice[];
    effects: Array<{ id: string; name: string; description: string }>;
  }> {
    return await TTSProviderFactory.getAllVoices();
  }

  /**
   * Generates a short voice preview audio sample for user auditioning.
   */
  async previewVoice(options: {
    voice?: string;
    provider?: string;
    speed?: number;
    effect?: AudioEffectType;
    sampleText?: string;
    lang?: string;
  }): Promise<{
    audioUrl: string;
    durationMs: number;
    voice: string;
    provider: string;
    effect: AudioEffectType;
  }> {
    const providerInstance = await TTSProviderFactory.getProvider(options.provider);
    const voice = options.voice || (providerInstance.name === 'kokoro' ? 'af_heart' : 'en-US-Standard');
    const effect = options.effect || 'normal';
    const speed = options.speed || 1.0;
    const lang = options.lang;

    const previewText = options.sampleText || "Hi there! I am ready to tell a wonderful story for you.";

    const result = await providerInstance.generateSpeech(previewText, {
      voice,
      speed,
      effect,
      lang,
    });

    const previewFilename = `preview-${Date.now()}-${Math.random().toString(36).substring(7)}.${result.format}`;
    const filePath = path.join(this.audioDir, previewFilename);

    await fs.promises.writeFile(filePath, result.audioBuffer);

    let durationMs = result.durationMs;
    if (!durationMs || durationMs <= 0) {
      try {
        durationMs = await this.probeAudioDuration(filePath);
      } catch {
        durationMs = 2500;
      }
    }

    return {
      audioUrl: `/storage/audio/${previewFilename}`,
      durationMs,
      voice,
      provider: providerInstance.name,
      effect,
    };
  }

  /**
   * Generates spoken narration audio from text for a given scene.
   * Saves the audio file, accurately measures its duration with ffprobe,
   * updates the database record, and creates a scene version entry.
   */
  async generateNarrationAudio(options: {
    sceneId: string;
    narration: string;
    provider?: string;
    voice?: string;
    speed?: number;
    effect?: AudioEffectType;
    lang?: string;
  }): Promise<{
    audioUrl: string;
    durationMs: number;
    filename: string;
    provider: string;
    voice: string;
    effect: AudioEffectType;
  }> {
    const { sceneId, narration, provider, voice, speed = 1.0, effect = 'normal', lang } = options;

    if (!narration || narration.trim().length === 0) {
      throw new Error('Narration text is required for audio generation');
    }

    console.log(`[AudioGeneration] Generating narration for scene ${sceneId}: "${narration.substring(0, 60)}..." (provider: ${provider || 'default'}, voice: ${voice || 'default'}, effect: ${effect})`);

    // Clean narration text: remove markdown formatting, stage directions, or extra symbols
    const cleanText = narration
      .replace(/\[.*?\]/g, '')
      .replace(/\(.*?\)/g, '')
      .replace(/[*_#`]/g, '')
      .trim();

    const textToSpeak = cleanText.length > 0 ? cleanText : narration.trim();

    // Select TTS provider (Kokoro-82M by default or fallback)
    const providerInstance = await TTSProviderFactory.getProvider(provider);
    const selectedVoice = voice || (providerInstance.name === 'kokoro' ? 'af_heart' : 'en-US-Standard');

    let ttsResult;
    try {
      ttsResult = await providerInstance.generateSpeech(textToSpeak, {
        voice: selectedVoice,
        speed,
        effect,
        lang,
      });
    } catch (err: any) {
      console.warn(`[AudioGeneration] TTS generation with provider "${providerInstance.name}" failed:`, err);
      // Graceful fallback to Google TTS if Kokoro fails
      if (providerInstance.name !== 'google') {
        console.log('[AudioGeneration] Attempting fallback to Google TTS...');
        const fallbackProvider = await TTSProviderFactory.getProvider('google');
        ttsResult = await fallbackProvider.generateSpeech(textToSpeak, {
          voice: 'en-US-Standard',
          speed,
          effect,
          lang: lang || 'en',
        });
      } else {
        throw new Error(`TTS generation failed: ${err.message || String(err)}`);
      }
    }

    const timestamp = Date.now();
    const filename = `narration-${sceneId}-${timestamp}.${ttsResult.format}`;
    const filePath = path.join(this.audioDir, filename);

    await fs.promises.writeFile(filePath, ttsResult.audioBuffer);
    console.log(`[AudioGeneration] Audio file saved to ${filePath}, size: ${ttsResult.audioBuffer.length} bytes`);

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
      provider: ttsResult.provider,
      voice: ttsResult.voice,
      effect: ttsResult.effect,
    };
  }

  /**
   * Generates character dialogue audio using Kokoro-82M, calculates exact duration,
   * derives lip-sync viseme cues, and saves the dialogue audio file.
   */
  async generateCharacterDialogueAudio(options: {
    sceneId: string;
    characterId?: string;
    characterInstanceId?: string;
    characterName: string;
    text: string;
    voice?: string;
    speakingDirection?: SpeakingDirection;
    speed?: number;
    effect?: AudioEffectType;
    startMs?: number;
    provider?: string;
  }): Promise<SceneDialogue> {
    const {
      sceneId,
      characterId,
      characterInstanceId,
      characterName,
      text,
      speakingDirection = 'calm',
      startMs = 0,
      effect = 'normal',
      provider,
    } = options;

    if (!text || text.trim().length === 0) {
      throw new Error('Dialogue text is required');
    }

    const cleanText = text
      .replace(/\[.*?\]/g, '')
      .replace(/\(.*?\)/g, '')
      .replace(/[*_#`~]/g, '')
      .trim();

    const textToSpeak = cleanText.length > 0 ? cleanText : text.trim();

    // 1. Resolve character's default voice if characterId provided
    let voiceToUse = options.voice;
    let baseSpeed = options.speed ?? 1.0;

    if (!voiceToUse && characterId) {
      try {
        const char = await getCharacterById(characterId);
        const voiceConfig = (char?.canonicalAppearance as any)?.voiceConfig;
        if (voiceConfig?.voiceId) {
          voiceToUse = voiceConfig.voiceId;
          if (voiceConfig.speed && options.speed === undefined) {
            baseSpeed = voiceConfig.speed;
          }
        }
      } catch (err) {
        console.warn(`[AudioGeneration] Could not fetch character ${characterId} for voiceConfig:`, err);
      }
    }

    // Default voice heuristics based on species/name if still not set
    if (!voiceToUse) {
      if (characterId?.includes('pip') || characterName.toLowerCase().includes('bear')) {
        voiceToUse = 'bm_george';
      } else if (characterId?.includes('sammy') || characterName.toLowerCase().includes('kid')) {
        voiceToUse = 'am_adam';
      } else {
        voiceToUse = 'af_heart';
      }
    }

    // Direction speed modifier
    const dirSpeedMultipliers: Record<string, number> = {
      cheerful: 1.05,
      excited: 1.15,
      calm: 0.95,
      sad: 0.88,
      worried: 1.08,
      curious: 1.0,
      serious: 0.92,
    };
    const directionMultiplier = dirSpeedMultipliers[speakingDirection] || 1.0;
    const effectiveSpeed = Math.max(0.5, Math.min(2.0, baseSpeed * directionMultiplier));

    console.log(
      `[AudioGeneration] Generating dialogue for character "${characterName}": "${textToSpeak.slice(0, 40)}..." (voice: ${voiceToUse}, speed: ${effectiveSpeed}, direction: ${speakingDirection})`
    );

    // 2. Synthesize speech using TTS provider (Kokoro-82M by default)
    const providerInstance = await TTSProviderFactory.getProvider(provider);
    let ttsResult;
    try {
      ttsResult = await providerInstance.generateSpeech(textToSpeak, {
        voice: voiceToUse,
        speed: effectiveSpeed,
        effect,
      });
    } catch (err: any) {
      console.warn(`[AudioGeneration] Dialogue TTS with provider "${providerInstance.name}" failed:`, err);
      if (providerInstance.name !== 'google') {
        console.log('[AudioGeneration] Falling back to Google TTS for dialogue...');
        const fallback = await TTSProviderFactory.getProvider('google');
        ttsResult = await fallback.generateSpeech(textToSpeak, {
          voice: 'en-US-Standard',
          speed: effectiveSpeed,
          effect,
        });
      } else {
        throw new Error(`Dialogue speech generation failed: ${err.message || String(err)}`);
      }
    }

    const timestamp = Date.now();
    const cleanId = (characterId || 'char').replace(/[^a-zA-Z0-9_-]/g, '_');
    const filename = `dialogue-${sceneId}-${cleanId}-${timestamp}.${ttsResult.format}`;
    const filePath = path.join(this.audioDir, filename);

    await fs.promises.writeFile(filePath, ttsResult.audioBuffer);

    // 3. Measure duration accurately using ffprobe
    let durationMs = 0;
    try {
      durationMs = await this.probeAudioDuration(filePath);
    } catch {
      const words = textToSpeak.split(/\s+/).length;
      durationMs = Math.round((words * 400 + 400) / effectiveSpeed);
    }

    // 4. Derive deterministic lip-sync viseme cues
    const visemeCues = generateVisemeCues(textToSpeak, durationMs);

    const dialogueItem: SceneDialogue = {
      id: randomUUID(),
      characterId,
      characterInstanceId,
      characterName,
      text: textToSpeak,
      voice: ttsResult.voice || voiceToUse,
      speakingDirection,
      speed: effectiveSpeed,
      audioUrl: `/storage/audio/${filename}`,
      startMs,
      durationMs,
      visemeCues,
    };

    return dialogueItem;
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
