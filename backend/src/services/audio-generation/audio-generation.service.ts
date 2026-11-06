import fs from 'fs';
import path from 'path';
import { promisify } from 'util';
import { execFile } from 'child_process';
import { randomUUID, createHash } from 'crypto';
// @ts-ignore
import ffprobeStatic from '@ffprobe-installer/ffprobe';
import { updateScene, createSceneVersion, getSceneBySceneId, getCharacterById, getCharacterByName, getScenesByStoryId, getStoryByStoryId } from '../database/database.service.js';
import { TTSProviderFactory } from './tts-provider.factory.js';
import { AudioEffectType, SupportedVoice } from './tts-provider.interface.js';
import { generateVisemeCues } from './viseme-generator.js';
import { SceneDialogue, SpeakingDirection, FacialExpression } from '../animation/vector-animation.engine.js';
import { EMOTION_DELIVERY_MAP, SpeakingEmotion, calculateEmotionDelivery, normalizeEmotionIntensity } from './emotion-suggester.service.js';
import {
  resolveEffectiveLanguage,
  resolveEffectiveVoice,
  resolveCanonicalVoiceForCharacter,
  toTTSLanguageCode,
  isVoiceCompatibleWithLanguage,
  containsDevanagari,
} from './language-resolver.service.js';

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
  async getVoices(provider?: string): Promise<{
    activeProvider: string;
    isKokoroAvailable: boolean;
    isFishAudioAvailable: boolean;
    voices: SupportedVoice[];
    fishAudioVoices: SupportedVoice[];
    effects: Array<{ id: string; name: string; description: string }>;
    providers: Array<{ id: string; name: string; available: boolean; model?: string; isFree?: boolean }>;
  }> {
    return await TTSProviderFactory.getAllVoices(provider);
  }

  /**
   * Generates a short voice preview audio sample for user auditioning.
   * Deterministically cached based on text, language, voice, emotion, intensity, speed, and effect.
   */
  async previewVoice(options: {
    voice?: string;
    provider?: string;
    speed?: number;
    effect?: AudioEffectType;
    sampleText?: string;
    lang?: string;
    emotion?: SpeakingEmotion;
    emotionIntensity?: number;
  }): Promise<{
    audioUrl: string;
    durationMs: number;
    voice: string;
    provider: string;
    effect: AudioEffectType;
    emotion: SpeakingEmotion;
    emotionIntensity: number;
  }> {
    const providerInstance = await TTSProviderFactory.getProvider(options.provider);
    const effectiveLang = resolveEffectiveLanguage({ lang: options.lang, text: options.sampleText });
    const voice = resolveEffectiveVoice({
      requestedVoice: options.voice,
      lang: effectiveLang,
      provider: options.provider,
    });
    const lang = toTTSLanguageCode(effectiveLang, providerInstance.name);
    const effect = options.effect || 'normal';
    const speed = options.speed || 1.0;
    const emotion = (options.emotion || 'neutral') as SpeakingEmotion;

    // Delivery calculation with subtle emotion intensity: neutral = 0%, non-neutral = 15%
    const defaultIntensity = emotion === 'neutral' ? 0 : 15;
    const resolvedIntensity = options.emotionIntensity !== undefined ? options.emotionIntensity : defaultIntensity;

    const delivery = calculateEmotionDelivery({
      emotion,
      intensity: resolvedIntensity,
      baseSpeed: speed,
      baseEffect: effect,
    });

    const defaultHindiSample = "नमस्ते! मैं आपके साथ एक शानदार कहानी सुनाने के लिए तैयार हूँ।";
    const defaultEnglishSample = "Hello! I am ready to tell a wonderful story for you.";
    const previewText = (options.sampleText || (lang === 'hi' ? defaultHindiSample : defaultEnglishSample)).trim();

    // Deterministic cache key incorporating provider, text, lang, voice, emotion, intensity, speed, effect, pitch, presence
    const cacheKey = createHash('sha256')
      .update(JSON.stringify({
        provider: providerInstance.name,
        text: previewText,
        lang,
        voice,
        emotion,
        intensity: delivery.intensity,
        speed: delivery.calibratedSpeed,
        effect: delivery.effectiveEffect,
        pitch: delivery.pitchShiftSemitones,
        presence: delivery.presenceGainDb,
      }))
      .digest('hex')
      .substring(0, 16);

    const ext = providerInstance.name === 'fish_audio' ? 'mp3' : 'wav';
    const cachedFilename = `preview-${providerInstance.name}-${voice}-${cacheKey}.${ext}`;
    const cachedFilePath = path.join(this.audioDir, cachedFilename);

    // Reuse existing cached preview if file exists and has valid size
    if (fs.existsSync(cachedFilePath) && fs.statSync(cachedFilePath).size > 1000) {
      let durationMs = 0;
      try {
        durationMs = await this.probeAudioDuration(cachedFilePath);
      } catch {
        durationMs = 2500;
      }
      return {
        audioUrl: `/storage/audio/${cachedFilename}`,
        durationMs,
        voice,
        provider: providerInstance.name,
        effect: delivery.effectiveEffect,
        emotion,
        emotionIntensity: delivery.intensity,
      };
    }

    const result = await providerInstance.generateSpeech(previewText, {
      voice,
      speed: delivery.calibratedSpeed,
      effect: delivery.effectiveEffect,
      lang,
      emotion,
      emotionIntensity: delivery.intensity,
      sentencePause: delivery.sentencePause,
      clausePause: delivery.clausePause,
      pitchShiftSemitones: delivery.pitchShiftSemitones,
      presenceGainDb: delivery.presenceGainDb,
    });

    await fs.promises.writeFile(cachedFilePath, result.audioBuffer);

    let durationMs = result.durationMs;
    if (!durationMs || durationMs <= 0) {
      try {
        durationMs = await this.probeAudioDuration(cachedFilePath);
      } catch {
        durationMs = 2500;
      }
    }

    return {
      audioUrl: `/storage/audio/${cachedFilename}`,
      durationMs,
      voice,
      provider: providerInstance.name,
      effect: delivery.effectiveEffect,
      emotion,
      emotionIntensity: delivery.intensity,
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
    emotion?: SpeakingEmotion;
    emotionIntensity?: number;
  }): Promise<{
    audioUrl: string;
    durationMs: number;
    filename: string;
    provider: string;
    voice: string;
    effect: AudioEffectType;
    emotion: SpeakingEmotion;
    emotionIntensity: number;
  }> {
    const { sceneId, narration, provider, voice, speed = 1.0, effect = 'normal', lang, emotion = 'neutral', emotionIntensity } = options;

    if (!narration || narration.trim().length === 0) {
      throw new Error('Narration text is required for audio generation');
    }

    const scene = await getSceneBySceneId(sceneId);
    const story = scene?.storyId ? await getStoryByStoryId(scene.storyId) : null;
    const effectiveLang = resolveEffectiveLanguage({
      lang,
      text: narration,
      projectLang: (story as any)?.language,
    });
    const selectedVoice = resolveEffectiveVoice({
      requestedVoice: voice,
      lang: effectiveLang,
      provider,
    });

    const delivery = calculateEmotionDelivery({
      emotion,
      intensity: emotionIntensity,
      baseSpeed: speed,
      baseEffect: effect,
    });

    console.log(`[AudioGeneration] Generating narration for scene ${sceneId}: "${narration.substring(0, 60)}..." (provider: ${provider || 'default'}, voice: ${selectedVoice}, lang: ${effectiveLang}, emotion: ${emotion}, intensity: ${delivery.intensity}%)`);

    // Clean narration text: remove markdown formatting, stage directions, or extra symbols
    const cleanText = narration
      .replace(/\[.*?\]/g, '')
      .replace(/\(.*?\)/g, '')
      .replace(/[*_#`]/g, '')
      .trim();

    const textToSpeak = cleanText.length > 0 ? cleanText : narration.trim();

    // Select TTS provider (Kokoro-82M by default or fallback)
    const providerInstance = await TTSProviderFactory.getProvider(provider);

    let ttsResult;
    try {
      ttsResult = await providerInstance.generateSpeech(textToSpeak, {
        voice: selectedVoice,
        speed: delivery.calibratedSpeed,
        effect: delivery.effectiveEffect,
        lang: effectiveLang,
        emotion,
        emotionIntensity: delivery.intensity,
        sentencePause: delivery.sentencePause,
        clausePause: delivery.clausePause,
        pitchShiftSemitones: delivery.pitchShiftSemitones,
        presenceGainDb: delivery.presenceGainDb,
      });
    } catch (err: any) {
      console.warn(`[AudioGeneration] TTS generation with provider "${providerInstance.name}" failed:`, err);
      // For Fish Audio: do NOT silently fallback to Google or paid models. Throw clear descriptive error.
      if (providerInstance.name === 'fish_audio') {
        throw new Error(`Fish Audio narration speech generation failed: ${err.message || String(err)}`);
      }
      // Graceful fallback to Google TTS if Kokoro fails
      if (providerInstance.name !== 'google') {
        console.log('[AudioGeneration] Attempting fallback to Google TTS...');
        const fallbackProvider = await TTSProviderFactory.getProvider('google');
        const fallbackVoice = effectiveLang === 'hi' ? 'hi-IN-Standard' : 'en-US-Standard';
        try {
          ttsResult = await fallbackProvider.generateSpeech(textToSpeak, {
            voice: fallbackVoice,
            speed: delivery.calibratedSpeed,
            effect: delivery.effectiveEffect,
            lang: toTTSLanguageCode(effectiveLang, 'google'),
          });
        } catch (fallbackErr: any) {
          throw new Error(`Narration speech generation failed for language "${effectiveLang}": ${err.message || String(err)} (fallback: ${fallbackErr.message || String(fallbackErr)})`);
        }
      } else {
        throw new Error(`Narration speech generation failed for language "${effectiveLang}": ${err.message || String(err)}`);
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
      emotion,
      emotionIntensity: delivery.intensity,
    };
  }

  /**
   * Generates character dialogue audio using Kokoro-82M, calculates exact duration,
   * derives lip-sync viseme cues, and saves the dialogue audio file.
   */
  /**
   * Generates spoken audio for a single dialogue line spoken by a character in a scene,
   * derives lip-sync viseme cues, and saves the dialogue audio file.
   * Follows strict precedence: Project defaults -> Character defaults -> Scene overrides -> Dialogue-line overrides.
   */
  async generateCharacterDialogueAudio(options: {
    sceneId: string;
    characterId?: string;
    characterInstanceId?: string;
    characterName: string;
    text: string;
    voice?: string;
    speakingDirection?: SpeakingDirection;
    emotion?: SpeakingEmotion;
    emotionIntensity?: number;
    facialExpression?: FacialExpression;
    speed?: number;
    effect?: AudioEffectType;
    volume?: number;
    startMs?: number;
    provider?: string;
    lang?: string;
  }): Promise<SceneDialogue> {
    const {
      sceneId,
      characterId,
      characterInstanceId,
      characterName,
      text,
      speakingDirection,
      emotion,
      emotionIntensity,
      facialExpression,
      startMs = 0,
      effect = 'normal',
      volume = 1.0,
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

    // 1. Fetch Scene and Story for Hierarchical Precedence
    const scene = await getSceneBySceneId(sceneId);
    const story = scene?.storyId ? await getStoryByStoryId(scene.storyId) : null;

    // A. Project defaults (Hindi default)
    const projectLang = ((story as any)?.language && (story as any).language.toLowerCase().includes('english')) ? 'en' : 'hi';
    const projectVoice = projectLang === 'hi' ? 'hf_alpha' : 'af_heart';

    // B. Character defaults
    let charLang: string | undefined;
    let charVoiceId: string | undefined;
    let charSpeed: number | undefined;
    let charEmotion: string | undefined;
    let charIntensity: number | undefined;
    let charEffect: AudioEffectType | undefined;
    let charProvider: string | undefined;
    let charModel: string | undefined;

    let fetchedChar: any = null;
    try {
      fetchedChar = characterId ? await getCharacterById(characterId) : null;
      if (!fetchedChar && characterName) {
        fetchedChar = await getCharacterByName(characterName);
      }
      const voiceConfig = (fetchedChar?.canonicalAppearance as any)?.voiceConfig || (fetchedChar as any)?.voiceConfig;
      if (voiceConfig) {
        charLang = voiceConfig.lang;
        charVoiceId = voiceConfig.voiceId;
        charSpeed = voiceConfig.speed;
        charEmotion = voiceConfig.emotion || voiceConfig.style;
        charIntensity = voiceConfig.emotionIntensity;
        charEffect = voiceConfig.effect;
        charProvider = voiceConfig.provider;
        charModel = voiceConfig.model;
      }
    } catch (err) {
      console.warn(`[AudioGeneration] Could not fetch character ${characterId || characterName} for voiceConfig:`, err);
    }

    // Character default voice heuristics based on species/name if no explicit voiceConfig
    const textHasDevanagari = /[\u0900-\u097F]/.test(textToSpeak);
    if (!charVoiceId || charVoiceId === 'default') {
      const lowerName = (characterName || '').toLowerCase();
      const lowerId = (characterId || '').toLowerCase();
      const isHindiContext = (options.lang === 'hi') || (charLang === 'hi') || (projectLang === 'hi') || textHasDevanagari;
      if (
        lowerId.includes('earth') ||
        lowerName.includes('earth') ||
        lowerName.includes('terra') ||
        lowerName.includes('planet') ||
        characterName.includes('पृथ्वी')
      ) {
        charVoiceId = isHindiContext ? 'hf_alpha' : 'bm_daniel';
        charLang = isHindiContext ? 'hi' : (charLang || 'en');
      } else if (lowerId.includes('pip') || lowerName.includes('bear')) {
        charVoiceId = isHindiContext ? 'hm_omega' : 'bm_george';
        charLang = isHindiContext ? 'hi' : (charLang || 'en');
      } else if (lowerId.includes('sammy') || lowerName.includes('kid') || lowerName.includes('boy')) {
        charVoiceId = isHindiContext ? 'hm_omega' : 'am_adam';
        charLang = isHindiContext ? 'hi' : (charLang || 'en');
      } else if (lowerName.includes('robot')) {
        charVoiceId = 'bm_lewis';
        charLang = charLang || 'en';
      } else if (lowerName.includes('girl')) {
        charVoiceId = isHindiContext ? 'hf_beta' : 'af_bella';
        charLang = isHindiContext ? 'hi' : (charLang || 'en');
      }
    }

    // C. Scene overrides (characterPerformances)
    const animData = (scene as any)?.animationData;
    const scenePerf =
      (characterInstanceId && animData?.characterPerformances?.[characterInstanceId]) ||
      (characterId && animData?.characterPerformances?.[characterId]) ||
      (characterName && animData?.characterPerformances?.[characterName]);

    const sceneLang = scenePerf?.lang;
    const sceneVoiceId = scenePerf?.voiceId;
    const sceneSpeed = scenePerf?.speed;
    const sceneEmotion = scenePerf?.emotion;
    const sceneIntensity = scenePerf?.emotionIntensity;
    const sceneProvider = scenePerf?.provider;

    // D. Dialogue-line overrides
    const lineLang = options.lang;
    const lineVoiceId = (options.voice && options.voice !== 'default') ? options.voice : undefined;
    const lineSpeed = options.speed;
    const lineEmotion = emotion || speakingDirection;
    const lineIntensity = emotionIntensity;
    const lineEffect = (effect && effect !== 'normal') ? effect : undefined;
    const effectiveProvider = provider || sceneProvider || charProvider || undefined;

    // Effective language resolution: Line override -> Scene override -> Character setting -> Text content -> Story project -> Default Hindi
    const effectiveLang = resolveEffectiveLanguage({
      lang: lineLang || sceneLang || charLang,
      text: textToSpeak,
      projectLang: (story as any)?.language,
      characterLang: charLang,
    });

    // Effective voice resolution with strict language compatibility (never allows English voice for Hindi)
    const effectiveVoice = resolveEffectiveVoice({
      requestedVoice: lineVoiceId || sceneVoiceId || charVoiceId,
      characterName: characterName || (fetchedChar as any)?.name,
      species: (fetchedChar as any)?.species,
      lang: effectiveLang,
      provider: effectiveProvider,
    });

    const effectiveEmotion = ((lineEmotion || sceneEmotion || charEmotion || 'neutral') as string).toLowerCase() as SpeakingEmotion;
    const baseSpeed = lineSpeed ?? sceneSpeed ?? charSpeed ?? 1.0;
    const baseEffect = lineEffect || charEffect || 'normal';

    // Effective intensity according to strict precedence: neutral = 0%, subtle non-neutral = 15%
    let effectiveIntensity = lineIntensity !== undefined
      ? lineIntensity
      : (sceneIntensity !== undefined
        ? sceneIntensity
        : (charIntensity !== undefined ? charIntensity : undefined));

    if (effectiveIntensity === undefined) {
      effectiveIntensity = effectiveEmotion === 'neutral' ? 0 : 15;
    }

    // Calculate emotion delivery with intensity
    const delivery = calculateEmotionDelivery({
      emotion: effectiveEmotion,
      intensity: effectiveIntensity,
      baseSpeed,
      baseEffect,
    });

    console.log(
      `[AudioGeneration] Generating dialogue for character "${characterName}": "${textToSpeak.slice(0, 40)}..." (lang: ${effectiveLang}, voice: ${effectiveVoice}, provider: ${effectiveProvider || 'default'}, speed: ${delivery.calibratedSpeed}, effect: ${delivery.effectiveEffect}, emotion: ${effectiveEmotion}, intensity: ${delivery.intensity}%)`
    );

    // 2. Synthesize speech using TTS provider (Kokoro-82M by default or Fish Audio)
    const providerInstance = await TTSProviderFactory.getProvider(effectiveProvider);
    let ttsResult;
    try {
      ttsResult = await providerInstance.generateSpeech(textToSpeak, {
        voice: effectiveVoice,
        speed: delivery.calibratedSpeed,
        effect: delivery.effectiveEffect,
        lang: effectiveLang,
        emotion: effectiveEmotion,
        emotionIntensity: delivery.intensity,
        sentencePause: delivery.sentencePause,
        clausePause: delivery.clausePause,
        pitchShiftSemitones: delivery.pitchShiftSemitones,
        presenceGainDb: delivery.presenceGainDb,
      });
    } catch (err: any) {
      console.warn(`[AudioGeneration] Dialogue TTS with provider "${providerInstance.name}" failed:`, err);
      // For Fish Audio: do NOT silently fallback to Google or paid models. Throw clear error.
      if (providerInstance.name === 'fish_audio') {
        throw new Error(`Fish Audio dialogue speech generation failed: ${err.message || String(err)}`);
      }
      if (providerInstance.name !== 'google') {
        console.log('[AudioGeneration] Falling back to Google TTS for dialogue...');
        const fallback = await TTSProviderFactory.getProvider('google');
        const fallbackVoice = effectiveLang === 'hi' ? 'hi-IN-Standard' : 'en-US-Standard';
        try {
          ttsResult = await fallback.generateSpeech(textToSpeak, {
            voice: fallbackVoice,
            speed: delivery.calibratedSpeed,
            effect: delivery.effectiveEffect,
            lang: toTTSLanguageCode(effectiveLang, 'google'),
          });
        } catch (fallbackErr: any) {
          throw new Error(`Dialogue speech generation failed for language "${effectiveLang}": ${err.message || String(err)} (fallback: ${fallbackErr.message || String(fallbackErr)})`);
        }
      } else {
        throw new Error(`Dialogue speech generation failed for language "${effectiveLang}": ${err.message || String(err)}`);
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
      durationMs = Math.round((words * 400 + 400) / delivery.calibratedSpeed);
    }

    // 4. Derive deterministic lip-sync viseme cues
    const visemeCues = generateVisemeCues(textToSpeak, durationMs);

    const dialogueItem: SceneDialogue = {
      id: randomUUID(),
      characterId,
      characterInstanceId,
      characterName,
      text: textToSpeak,
      lang: effectiveLang,
      voice: ttsResult.voice || effectiveVoice,
      speakingDirection: effectiveEmotion,
      emotion: effectiveEmotion,
      emotionIntensity: delivery.intensity,
      facialExpression,
      speed: baseSpeed,
      effect: delivery.effectiveEffect,
      volume: typeof volume === 'number' && Number.isFinite(volume) ? Math.max(0, Math.min(2.0, volume)) : 1.0,
      audioUrl: `/storage/audio/${filename}`,
      audioMeta: {
        text: textToSpeak,
        lang: effectiveLang,
        voice: ttsResult.voice || effectiveVoice,
        provider: ttsResult.provider,
        emotion: effectiveEmotion,
        emotionIntensity: delivery.intensity,
        speed: baseSpeed,
        effect: delivery.effectiveEffect,
        volume: typeof volume === 'number' && Number.isFinite(volume) ? Math.max(0, Math.min(2.0, volume)) : 1.0,
      },
      startMs,
      durationMs,
      visemeCues,
    };

    return dialogueItem;
  }

  /**
   * Batch generates speech audio for all dialogue lines in a scene,
   * updates viseme cues, and saves the updated dialogue lines to the scene.
   */
  async generateAllSceneDialogues(
    sceneId: string,
    options: {
      provider?: string;
      effect?: AudioEffectType;
      forceRegenerate?: boolean;
    } = {}
  ): Promise<SceneDialogue[]> {
    const scene = await getSceneBySceneId(sceneId);
    if (!scene) {
      throw new Error(`Scene not found: ${sceneId}`);
    }

    const story = scene.storyId ? await getStoryByStoryId(scene.storyId) : null;
    const projectLang = resolveEffectiveLanguage({ projectLang: (story as any)?.language });

    const animData = (scene as any).animationData;
    if (!animData || !Array.isArray(animData.dialogueLines) || animData.dialogueLines.length === 0) {
      return [];
    }

    const updatedDialogueLines = [...animData.dialogueLines];

    for (let i = 0; i < updatedDialogueLines.length; i++) {
      const line = updatedDialogueLines[i];
      if (!line.text || !line.text.trim()) continue;

      let lineVoice = line.voice;
      if (options.forceRegenerate || !lineVoice || lineVoice === 'default') {
        try {
          let char = line.characterId ? await getCharacterById(line.characterId) : null;
          if (!char && line.characterName) {
            char = await getCharacterByName(line.characterName);
          }
          const cfg = (char?.canonicalAppearance as any)?.voiceConfig || (char as any)?.voiceConfig;
          if (cfg?.voiceId) {
            lineVoice = cfg.voiceId;
          }
        } catch {
          // keep existing lineVoice
        }
      }

      // If audio already exists and we are not forcing regeneration, verify file existence and settings compatibility
      if (line.audioUrl && !options.forceRegenerate) {
        const localRel = line.audioUrl.startsWith('/') ? line.audioUrl.slice(1) : line.audioUrl;
        const absPath = path.join(process.cwd(), localRel);
        const meta = (line as any).audioMeta;
        const targetIntensity = normalizeEmotionIntensity(line.emotionIntensity, line.emotion);
        const targetLang = resolveEffectiveLanguage({
          lang: line.lang,
          text: line.text,
          projectLang,
        });
        const targetVoice = resolveEffectiveVoice({
          requestedVoice: line.voice || lineVoice,
          characterName: line.characterName,
          lang: targetLang,
          provider: options.provider,
        });
        const targetSpeed = line.speed || 1.0;
        const targetEffect = line.effect || options.effect || 'normal';
        const targetEmotion = line.emotion || line.speakingDirection || 'neutral';

        // Audio is ONLY compatible if:
        // 1. Valid metadata exists (audio without metadata cannot be trusted and must be regenerated)
        // 2. The spoken text matches
        // 3. The language matches (crucial: avoids English audio serving Hindi lines)
        // 4. The voice matches (crucial: avoids bm_daniel serving hf_alpha)
        // 5. Emotion, intensity, speed, and audio effect match
        const isCompatible = Boolean(meta) && (
          meta.text === line.text.trim() &&
          meta.lang === targetLang &&
          meta.voice === targetVoice &&
          (!options.provider || !meta.provider || meta.provider === options.provider) &&
          meta.emotion === targetEmotion &&
          meta.emotionIntensity === targetIntensity &&
          meta.speed === targetSpeed &&
          (meta.effect || 'normal') === targetEffect
        );

        if (fs.existsSync(absPath) && isCompatible) {
          continue;
        }
      }

      try {
        const generated = await this.generateCharacterDialogueAudio({
          sceneId: scene.sceneId,
          characterId: line.characterId,
          characterInstanceId: line.characterInstanceId,
          characterName: line.characterName,
          text: line.text,
          lang: line.lang,
          voice: lineVoice,
          speakingDirection: line.speakingDirection,
          emotion: line.emotion,
          emotionIntensity: line.emotionIntensity,
          facialExpression: line.facialExpression,
          speed: line.speed,
          startMs: line.startMs,
          effect: line.effect || options.effect || 'normal',
          provider: options.provider,
        });

        // Preserve original id and startMs
        generated.id = line.id || generated.id;
        generated.startMs = typeof line.startMs === 'number' ? line.startMs : generated.startMs;
        updatedDialogueLines[i] = generated;
      } catch (err) {
        console.error(`[AudioGeneration] Failed generating dialogue audio for line "${line.text}":`, err);
      }
    }

    // Save updated dialogue lines to scene
    await updateScene(scene.sceneId, {
      animationData: {
        ...animData,
        dialogueLines: updatedDialogueLines,
      },
    });

    return updatedDialogueLines;
  }

  /**
   * Regenerates dialogue audio for lines spoken by a specific character in a scene.
   */
  async regenerateCharacterDialogueInScene(
    sceneId: string,
    characterIdOrName: string,
    options: { provider?: string } = {}
  ): Promise<SceneDialogue[]> {
    const scene = await getSceneBySceneId(sceneId);
    if (!scene) {
      throw new Error(`Scene not found: ${sceneId}`);
    }

    const animData = (scene as any).animationData;
    if (!animData || !Array.isArray(animData.dialogueLines) || animData.dialogueLines.length === 0) {
      return [];
    }

    let charObj = await getCharacterById(characterIdOrName);
    if (!charObj) {
      charObj = await getCharacterByName(characterIdOrName);
    }
    const resolvedVoice = (charObj?.canonicalAppearance as any)?.voiceConfig?.voiceId;

    const updatedDialogueLines = [...animData.dialogueLines];

    for (let i = 0; i < updatedDialogueLines.length; i++) {
      const line = updatedDialogueLines[i];
      const matchesChar =
        (line.characterId && line.characterId === characterIdOrName) ||
        (charObj && line.characterId === charObj.id) ||
        (line.characterName && line.characterName.toLowerCase() === characterIdOrName.toLowerCase()) ||
        (charObj && line.characterName && line.characterName.toLowerCase() === charObj.name.toLowerCase());

      if (!matchesChar || !line.text || !line.text.trim()) continue;

      try {
        const generated = await this.generateCharacterDialogueAudio({
          sceneId: scene.sceneId,
          characterId: line.characterId || charObj?.id,
          characterInstanceId: line.characterInstanceId,
          characterName: line.characterName || charObj?.name || 'Character',
          text: line.text,
          lang: line.lang,
          voice: resolvedVoice || line.voice,
          speakingDirection: line.speakingDirection,
          emotion: line.emotion,
          emotionIntensity: line.emotionIntensity,
          facialExpression: line.facialExpression,
          speed: line.speed,
          startMs: line.startMs,
          effect: line.effect || 'normal',
          provider: options.provider,
        });

        generated.id = line.id || generated.id;
        generated.startMs = typeof line.startMs === 'number' ? line.startMs : generated.startMs;
        updatedDialogueLines[i] = generated;
      } catch (err) {
        console.error(`[AudioGeneration] Failed regenerating dialogue audio for character ${characterIdOrName}:`, err);
      }
    }

    await updateScene(scene.sceneId, {
      animationData: {
        ...animData,
        dialogueLines: updatedDialogueLines,
      },
    });

    return updatedDialogueLines;
  }

  /**
   * Batch generates dialogue audio for all scenes across an entire story.
   */
  async generateAllStoryDialogues(
    storyId: string,
    options: {
      provider?: string;
      effect?: AudioEffectType;
      forceRegenerate?: boolean;
    } = {}
  ): Promise<{ sceneId: string; dialogues: SceneDialogue[] }[]> {
    const scenes = await getScenesByStoryId(storyId);
    const results: { sceneId: string; dialogues: SceneDialogue[] }[] = [];

    for (const scene of scenes) {
      try {
        const dialogues = await this.generateAllSceneDialogues(scene.sceneId, options);
        results.push({ sceneId: scene.sceneId, dialogues });
      } catch (err) {
        console.error(`[AudioGeneration] Error generating dialogues for scene ${scene.sceneId}:`, err);
        results.push({ sceneId: scene.sceneId, dialogues: [] });
      }
    }

    return results;
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
