import fs from 'fs';
import path from 'path';
import { promisify } from 'util';
import { execFile } from 'child_process';
// @ts-ignore
import ffprobeStatic from '@ffprobe-installer/ffprobe';
import {
  TTSProvider,
  SupportedVoice,
  TTSGenerationOptions,
  TTSGenerationResult,
} from '../tts-provider.interface.js';
import { AudioEffectsService } from '../audio-effects.service.js';
import {
  resolveEffectiveLanguage,
  resolveEffectiveVoice,
} from '../language-resolver.service.js';
import {
  composeFishAudioText,
  stripDirectionTags,
} from '../fish-emotion-composer.js';

const execFileAsync = promisify(execFile);

export const DEFAULT_FISH_MODEL = 's2.1-pro-free';
export const ALLOWED_FREE_MODELS = ['s2.1-pro-free'] as const;

/**
 * Curated preset voices for Fish Audio with verified gender classifications and characteristics.
 */
export const FISH_VOICE_PRESETS: Record<string, { referenceId?: string; gender: 'male' | 'female' | 'neutral'; lang: string; name: string; description: string }> = {
  'fish_default': {
    gender: 'neutral',
    lang: 'hi',
    name: 'Fish Audio Default Voice',
    description: 'Fish Audio base multilingual zero-shot voice for natural storytelling',
  },
  'fish_female_narrator': {
    referenceId: 'e86e4e5d6d844c8eb5607b019800a7fa',
    gender: 'female',
    lang: 'hi',
    name: 'Pooja (Female - Warm Storyteller)',
    description: 'Warm, expressive female narrator ideal for bedtime stories and calm scenes',
  },
  'fish_female_bright': {
    referenceId: '7f92f8afb8ec43bf81429cc1c9199cb1',
    gender: 'female',
    lang: 'en',
    name: 'Aria (Female - Bright & Cheerful)',
    description: 'Lively, friendly female voice perfect for girl characters and upbeat narration',
  },
  'fish_male_narrator': {
    referenceId: '1b4f4c4a4a5848fa88c5efb0f279f001',
    gender: 'male',
    lang: 'hi',
    name: 'Kabir (Male - Deep Narrator)',
    description: 'Rich, cinematic male narrator for adventurous, grand, and educational stories',
  },
  'fish_male_friendly': {
    referenceId: '3d8a7c2b4e1f486fa029bc4178201a4e',
    gender: 'male',
    lang: 'en',
    name: 'Leo (Male - Friendly Explorer)',
    description: 'Enthusiastic and warm male voice suitable for brave boy characters and sidekicks',
  },
};

/**
 * Curated Fish Audio voice catalogue with gender and language metadata.
 */
export const DEFAULT_FISH_VOICES: SupportedVoice[] = Object.entries(FISH_VOICE_PRESETS).map(
  ([id, meta]) => ({
    id,
    name: meta.name,
    gender: meta.gender,
    lang: meta.lang,
    accent: meta.lang === 'hi' ? 'Hindi / Multilingual' : 'English / Multilingual',
    description: meta.description,
  })
);

/**
 * Checks if a voice identifier belongs to the Kokoro-82M TTS engine.
 * Used to prevent Kokoro IDs from ever leaking into Fish Audio as reference IDs.
 */
export function isKokoroVoiceId(voice?: string | null): boolean {
  if (!voice || typeof voice !== 'string') return false;
  const v = voice.toLowerCase().trim();
  return (
    v.startsWith('hf_') ||
    v.startsWith('hm_') ||
    v.startsWith('af_') ||
    v.startsWith('am_') ||
    v.startsWith('bf_') ||
    v.startsWith('bm_') ||
    v.startsWith('kokoro')
  );
}

/**
 * Validates whether a model string meets the strict free-model safeguard policy.
 */
export function validateFreeModelPolicy(model?: string): string {
  const targetModel = (model || process.env.FISH_AUDIO_MODEL || DEFAULT_FISH_MODEL).trim();
  const isAllowed = ALLOWED_FREE_MODELS.some((m) => m.toLowerCase() === targetModel.toLowerCase());
  if (!isAllowed) {
    throw new Error(
      `Free-model policy violation: Model "${targetModel}" is not permitted under the studio free-model safeguard. ` +
      `Only the free developer tier model "${DEFAULT_FISH_MODEL}" is allowed to prevent unintended billing charges.`
    );
  }
  return targetModel;
}

/**
 * Splits and sanitizes API keys from string or array inputs.
 */
export function parseApiKeys(source?: string | string[]): string[] {
  if (!source) return [];
  if (Array.isArray(source)) {
    return source.map((k) => k.trim()).filter((k) => k.length > 0);
  }
  return source
    .split(/[,\n;]/)
    .map((k) => k.trim())
    .filter((k) => k.length > 0);
}

export interface FishAudioProviderOptions {
  apiKey?: string;
  apiKeys?: string[];
  model?: string;
  baseUrl?: string;
  timeoutMs?: number;
}

export interface AudioProbeMetadata {
  durationMs: number;
  sampleRate: number;
  channels: number;
  format: string;
}

export class FishAudioProvider implements TTSProvider {
  name = 'fish_audio';
  private apiKeys: string[] = [];
  private explicitKeysProvided: boolean = false;
  private currentKeyIndex = 0;
  private model: string;
  private baseUrl: string;
  private timeoutMs: number;
  private effectsService: AudioEffectsService;

  constructor(options?: FishAudioProviderOptions) {
    if (options?.apiKey !== undefined || options?.apiKeys !== undefined) {
      this.explicitKeysProvided = true;
      const directKeys = [
        ...(options?.apiKeys || []),
        ...parseApiKeys(options?.apiKey),
      ];
      this.apiKeys = Array.from(new Set(directKeys));
    } else {
      this.explicitKeysProvided = false;
      this.apiKeys = [];
    }
    this.model = options?.model || process.env.FISH_AUDIO_MODEL || DEFAULT_FISH_MODEL;
    this.baseUrl = options?.baseUrl || process.env.FISH_AUDIO_BASE_URL || 'https://api.fish.audio';
    this.timeoutMs = options?.timeoutMs || 20000;
    this.effectsService = new AudioEffectsService();
  }

  /**
   * Refreshes list of effective API keys from instance and process environment.
   */
  getEffectiveApiKeys(): string[] {
    if (this.explicitKeysProvided) {
      return [...this.apiKeys];
    }
    const envKeys = [
      ...parseApiKeys(process.env.FISH_API_KEYS),
      ...parseApiKeys(process.env.FISH_API_KEY),
    ];
    return Array.from(new Set(envKeys));
  }

  /**
   * Returns the primary or configured API key.
   */
  getNextApiKey(): string | undefined {
    const keys = this.getEffectiveApiKeys();
    if (keys.length === 0) return undefined;
    const key = keys[this.currentKeyIndex % keys.length];
    this.currentKeyIndex = (this.currentKeyIndex + 1) % keys.length;
    return key;
  }

  /**
   * Refreshes credentials and model configuration from environment.
   */
  private getEffectiveConfig(): { apiKey: string | undefined; apiKeys: string[]; model: string; baseUrl: string } {
    const keys = this.getEffectiveApiKeys();
    return {
      apiKey: keys[0],
      apiKeys: keys,
      model: (this.model || process.env.FISH_AUDIO_MODEL || DEFAULT_FISH_MODEL).trim(),
      baseUrl: (this.baseUrl || process.env.FISH_AUDIO_BASE_URL || 'https://api.fish.audio').trim(),
    };
  }

  /**
   * Enforces the strict free-model safeguard.
   * Rejects any configured model that is not an explicitly approved free model (s2.1-pro-free).
   * Prevents accidental billing or automatic paid model fallbacks.
   */
  validateFreeModelPolicy(): string {
    const { model } = this.getEffectiveConfig();
    return validateFreeModelPolicy(model);
  }

  /**
   * Checks whether Fish Audio is configured and ready.
   */
  async isAvailable(): Promise<boolean> {
    const keys = this.getEffectiveApiKeys();
    return keys.length > 0;
  }

  /**
   * Alias for getSupportedVoices()
   */
  async getVoices(): Promise<SupportedVoice[]> {
    return this.getSupportedVoices();
  }

  /**
   * Returns supported voices catalogue for Fish Audio.
   * Features honest provider default voice plus verified account custom models.
   */
  async getSupportedVoices(): Promise<SupportedVoice[]> {
    const defaultList = [...DEFAULT_FISH_VOICES];

    const { apiKey, baseUrl } = this.getEffectiveConfig();
    if (!apiKey) {
      return defaultList;
    }

    // Retrieve custom voice models from user account if available
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 4000);
      const res = await fetch(`${baseUrl}/model?self=true&page_size=50`, {
        headers: {
          Authorization: `Bearer ${apiKey}`,
        },
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      if (res.ok) {
        const data = (await res.json()) as any;
        const items = Array.isArray(data) ? data : Array.isArray(data?.items) ? data.items : [];
        const customVoices: SupportedVoice[] = items.map((m: any) => ({
          id: m._id || m.id,
          name: `${m.title || 'Custom Voice'} (Fish Audio Custom)`,
          gender: m.tags?.includes('female') ? 'female' : m.tags?.includes('male') ? 'male' : 'neutral',
          lang: m.languages?.includes('hi') ? 'hi' : m.languages?.includes('en') ? 'en-us' : 'hi',
          description: m.description || 'Custom Fish Audio Voice Reference',
        }));
        return [...defaultList, ...customVoices];
      }
    } catch {
      // Gracefully fall back to default list on network or permission issues
    }

    return defaultList;
  }

  /**
   * Generates speech using the official Fish Audio REST API.
   * Strict adherence to free developer tier model 's2.1-pro-free'.
   */
  async generateSpeech(
    text: string,
    options?: TTSGenerationOptions
  ): Promise<TTSGenerationResult> {
    if (!text || text.trim().length === 0) {
      throw new Error('Text is required for Fish Audio speech synthesis');
    }

    const keys = this.getEffectiveApiKeys();
    if (keys.length === 0) {
      throw new Error(
        'Fish Audio API key is not configured. Please set FISH_API_KEY in your environment or use Kokoro TTS.'
      );
    }

    const { baseUrl } = this.getEffectiveConfig();

    // Validate model adheres to free-tier policy
    const model = this.validateFreeModelPolicy();

    const effectiveLang = resolveEffectiveLanguage({ lang: options?.lang, text });
    const voice = resolveEffectiveVoice({
      requestedVoice: options?.voice,
      lang: effectiveLang,
      provider: 'fish_audio',
    });

    const effect = options?.effect || 'normal';

    // Compose restrained emotional delivery tag (default intensity 0.15)
    const composed = composeFishAudioText({
      text,
      emotion: options?.emotion,
      intensity: options?.emotionIntensity,
    });

    // Voice reference handling:
    // 1. NEVER send Kokoro voice IDs (e.g. hf_alpha, hm_omega) as reference_id
    // 2. 'fish_default' or 'default' omits reference_id to use base model zero-shot voice
    // 3. Preset voices map to their respective reference_ids
    // 4. Real custom model reference IDs (24-36 hex characters or verified custom IDs) are passed as reference_id
    let referenceId: string | undefined;
    if (voice && !isKokoroVoiceId(voice) && voice !== 'fish_default' && voice !== 'default') {
      const preset = FISH_VOICE_PRESETS[voice];
      if (preset && preset.referenceId) {
        referenceId = preset.referenceId;
      } else if (!voice.startsWith('fish_') || /^[a-f0-9]{24,36}$/i.test(voice)) {
        referenceId = voice;
      }
    }

    const payload: Record<string, any> = {
      text: composed.synthesizedText,
      format: 'mp3',
      normalize: true,
    };
    if (referenceId) {
      payload.reference_id = referenceId;
    }

    // Speaking speed prosody control (multiplier 0.5 - 2.0)
    if (options?.speed && typeof options.speed === 'number' && options.speed !== 1.0) {
      payload.prosody = {
        speed: Math.max(0.5, Math.min(2.0, options.speed)),
      };
    }

    const primaryKey = keys[0];
    const maskedKey = primaryKey.length > 12
      ? `${primaryKey.substring(0, 10)}...${primaryKey.slice(-4)}`
      : '***';

    let audioBuffer: Buffer | null = null;
    let attempts = 0;
    const maxAttempts = 3; // Max 2 retries for transient 5xx/network errors only

    while (attempts < maxAttempts) {
      attempts++;
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.timeoutMs);

      const headers: Record<string, string> = {
        'Authorization': `Bearer ${primaryKey}`,
        'Content-Type': 'application/json',
        'model': model,
      };

      console.log(
        `[FishAudioProvider] Synthesizing speech with model "${model}" (attempt ${attempts}/${maxAttempts}, lang: ${effectiveLang}, voice: ${voice}, ref: ${referenceId || 'none'}, speed: ${options?.speed || 1.0}, tag: ${composed.appliedTag || 'none'})`
      );

      try {
        const response = await fetch(`${baseUrl}/v1/tts`, {
          method: 'POST',
          headers,
          body: JSON.stringify(payload),
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        if (response.ok) {
          const arrayBuffer = await response.arrayBuffer();
          audioBuffer = Buffer.from(arrayBuffer);
          break;
        }

        const statusCode = response.status;
        let errorBody = '';
        try {
          errorBody = await response.text();
        } catch {}

        // 401 / 403 Authentication Failure: do NOT retry or rotate evasively
        if (statusCode === 401 || statusCode === 403) {
          throw new Error(
            'Fish Audio authentication failed (401/403). Please verify that your FISH_API_KEY is valid.'
          );
        }

        // 429 Rate Limit: do NOT rotate keys or evade limits
        if (statusCode === 429) {
          const retryAfter = response.headers?.get?.('retry-after');
          const delayInfo = retryAfter ? ` Retry-After: ${retryAfter}s.` : '';
          throw new Error(
            `Fish Audio rate limit exceeded (429).${delayInfo} Please wait a moment before generating more audio.`
          );
        }

        // 400 Bad Request / 404 Not Found: do NOT retry invalid inputs
        if (statusCode === 400 || statusCode === 404) {
          if (errorBody.toLowerCase().includes('model') || errorBody.toLowerCase().includes('tier')) {
            throw new Error(
              `Fish Audio free model "${model}" rejected: ${errorBody}. Free-model policy prevents falling back to paid models.`
            );
          }
          throw new Error(`Fish Audio bad request (${statusCode}): ${errorBody}`);
        }

        // 5xx Server errors - retry with backoff if attempts remaining
        if (statusCode >= 500 && attempts < maxAttempts) {
          console.warn(`[FishAudioProvider] Transient server error (${statusCode}), retrying attempt ${attempts + 1}...`);
          await new Promise((resolve) => setTimeout(resolve, 1000 * attempts));
          continue;
        }

        throw new Error(`Fish Audio server error (${statusCode}): ${errorBody}`);
      } catch (err: any) {
        clearTimeout(timeoutId);
        if (err.name === 'AbortError') {
          if (attempts < maxAttempts) {
            console.warn(`[FishAudioProvider] Request timed out, retrying attempt ${attempts + 1}...`);
            await new Promise((resolve) => setTimeout(resolve, 1000 * attempts));
            continue;
          }
          throw new Error(
            `Fish Audio request timed out after ${Math.round(this.timeoutMs / 1000)} seconds. Please check your network connection.`
          );
        }
        // Non-retryable errors
        if (
          attempts >= maxAttempts ||
          err.message?.includes('authentication failed') ||
          err.message?.includes('rate limit') ||
          err.message?.includes('bad request') ||
          err.message?.includes('Free-model')
        ) {
          throw err;
        }
      }
    }

    if (!audioBuffer || audioBuffer.length === 0) {
      throw new Error('Fish Audio returned empty audio buffer');
    }

    // Save temporary audio file to measure duration and sample rate via ffprobe
    const tempDir = path.join(process.cwd(), 'storage', 'temp');
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }

    const rawFile = path.join(tempDir, `fish-raw-${Date.now()}-${Math.random().toString(36).substring(7)}.mp3`);
    const procFile = path.join(tempDir, `fish-proc-${Date.now()}-${Math.random().toString(36).substring(7)}.mp3`);

    try {
      await fs.promises.writeFile(rawFile, audioBuffer);

      // Probe actual duration and sample rate via ffprobe
      const probeMeta = await this.probeAudioMetadata(rawFile);
      let durationMs = probeMeta.durationMs;
      const sampleRate = probeMeta.sampleRate;

      if (!durationMs || durationMs <= 0) {
        // Fallback estimation based on spoken word count
        const words = composed.spokenText.split(/\s+/).length;
        durationMs = Math.round(words * 450 + 800);
      }

      let finalBuffer = audioBuffer;

      // Apply audio effects if requested
      if (effect && effect !== 'normal') {
        const effectRes = await this.effectsService.applyEffect(rawFile, procFile, effect, {
          sampleRate,
        });
        if (fs.existsSync(procFile)) {
          finalBuffer = await fs.promises.readFile(procFile);
          durationMs = effectRes.durationMs;
        }
      }

      return {
        audioBuffer: finalBuffer,
        format: 'mp3',
        durationMs,
        sampleRate,
        provider: this.name,
        voice,
        effect,
      };
    } finally {
      try { if (fs.existsSync(rawFile)) fs.unlinkSync(rawFile); } catch {}
      try { if (fs.existsSync(procFile)) fs.unlinkSync(procFile); } catch {}
    }
  }

  /**
   * Probes audio file metadata (duration, sample rate, channels, format) accurately via ffprobe.
   */
  private async probeAudioMetadata(filePath: string): Promise<AudioProbeMetadata> {
    const ffprobePath = ffprobeStatic?.path || 'ffprobe';
    try {
      const { stdout } = await execFileAsync(ffprobePath, [
        '-v',
        'error',
        '-show_entries',
        'stream=sample_rate,channels,codec_name:format=duration,format_name',
        '-of',
        'json',
        filePath,
      ]);

      const parsed = JSON.parse(stdout);
      const stream = parsed.streams?.[0] || {};
      const format = parsed.format || {};

      const durationSec = parseFloat(format.duration || stream.duration);
      const sampleRate = parseInt(stream.sample_rate, 10);
      const channels = parseInt(stream.channels, 10);
      const formatName = format.format_name || stream.codec_name || 'mp3';

      const durationMs = Number.isFinite(durationSec) && durationSec > 0
        ? Math.round(durationSec * 1000)
        : 0;

      return {
        durationMs,
        sampleRate: Number.isFinite(sampleRate) && sampleRate > 0 ? sampleRate : 44100,
        channels: Number.isFinite(channels) && channels > 0 ? channels : 1,
        format: formatName,
      };
    } catch {
      return {
        durationMs: 0,
        sampleRate: 44100,
        channels: 1,
        format: 'mp3',
      };
    }
  }
}
