import fs from 'fs';
import path from 'path';
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
import { promisify } from 'util';
import { execFile } from 'child_process';
// @ts-ignore
import ffprobeStatic from '@ffprobe-installer/ffprobe';

const execFileAsync = promisify(execFile);

export const DEFAULT_FISH_MODEL = 's2.1-pro-free';
export const ALLOWED_FREE_MODELS = ['s2.1-pro-free'] as const;

export const DEFAULT_FISH_VOICES: SupportedVoice[] = [
  {
    id: 'fish_hi_aditi',
    name: 'Aditi (Hindi Female - Warm Storyteller)',
    gender: 'female',
    lang: 'hi',
    accent: 'Hindi',
    description: 'Warm and gentle storytelling voice for children tales',
  },
  {
    id: 'fish_hi_kabir',
    name: 'Kabir (Hindi Male - Gentle Narrator)',
    gender: 'male',
    lang: 'hi',
    accent: 'Hindi',
    description: 'Calm, friendly male narrator voice for bedtime and adventure',
  },
  {
    id: 'fish_hi_ananya',
    name: 'Ananya (Hindi Girl - Curious & Sweet)',
    gender: 'female',
    lang: 'hi',
    accent: 'Hindi',
    description: 'Youthful, sweet girl voice for child characters like Maya',
  },
  {
    id: 'fish_hi_aarav',
    name: 'Aarav (Hindi Boy - Playful Explorer)',
    gender: 'male',
    lang: 'hi',
    accent: 'Hindi',
    description: 'Playful boy voice for young animal and child characters',
  },
  {
    id: 'fish_en_clara',
    name: 'Clara (English Female - Warm Storyteller)',
    gender: 'female',
    lang: 'en-us',
    accent: 'American',
    description: 'Gentle and expressive female storyteller for children',
  },
  {
    id: 'fish_en_oliver',
    name: 'Oliver (English Male - Calm Narrator)',
    gender: 'male',
    lang: 'en-us',
    accent: 'American',
    description: 'Friendly and clear male narrator for adventure stories',
  },
  {
    id: 'fish_en_lily',
    name: 'Lily (English Girl - Cheerful & Gentle)',
    gender: 'female',
    lang: 'en-us',
    accent: 'American',
    description: 'Sweet, bright girl voice for young protagonists',
  },
  {
    id: 'fish_en_leo',
    name: 'Leo (English Boy - Playful Explorer)',
    gender: 'male',
    lang: 'en-us',
    accent: 'American',
    description: 'Energetic and friendly boy voice for character dialogue',
  },
];

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

export interface FishAudioProviderOptions {
  apiKey?: string;
  model?: string;
  baseUrl?: string;
  timeoutMs?: number;
}

export class FishAudioProvider implements TTSProvider {
  name = 'fish_audio';
  private apiKey?: string;
  private model: string;
  private baseUrl: string;
  private timeoutMs: number;
  private effectsService: AudioEffectsService;

  constructor(options?: FishAudioProviderOptions) {
    this.apiKey = options?.apiKey || process.env.FISH_API_KEY;
    this.model = options?.model || process.env.FISH_AUDIO_MODEL || DEFAULT_FISH_MODEL;
    this.baseUrl = options?.baseUrl || process.env.FISH_AUDIO_BASE_URL || 'https://api.fish.audio';
    this.timeoutMs = options?.timeoutMs || 20000;
    this.effectsService = new AudioEffectsService();
  }

  /**
   * Refreshes credentials and model configuration from environment.
   */
  private getEffectiveConfig(): { apiKey: string | undefined; model: string; baseUrl: string } {
    return {
      apiKey: this.apiKey || process.env.FISH_API_KEY,
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
    const { apiKey } = this.getEffectiveConfig();
    return Boolean(apiKey && apiKey.trim().length > 0);
  }

  /**
   * Alias for getSupportedVoices()
   */
  async getVoices(): Promise<SupportedVoice[]> {
    return this.getSupportedVoices();
  }

  /**
   * Returns supported voices catalogue for Fish Audio.
   * Includes curated natural storytelling voices for Hindi and English,
   * plus custom models if the account has any.
   */
  async getSupportedVoices(): Promise<SupportedVoice[]> {
    const curatedVoices = [...DEFAULT_FISH_VOICES];

    const { apiKey, baseUrl } = this.getEffectiveConfig();
    if (!apiKey) {
      return curatedVoices;
    }

    // Try fetching account custom voice models if available
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 4000);
      const res = await fetch(`${baseUrl}/model?self=true&page_size=20`, {
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
        return [...curatedVoices, ...customVoices];
      }
    } catch {
      // Gracefully fall back to curated voices on network or permission issues
    }

    return curatedVoices;
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

    const { apiKey, baseUrl } = this.getEffectiveConfig();
    if (!apiKey || apiKey.trim().length === 0) {
      throw new Error(
        'Fish Audio API key is not configured. Please set FISH_API_KEY in your environment or use Kokoro TTS.'
      );
    }

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

    // Determine voice reference_id if specified (Fish Audio uses 24-32 hex characters for custom models)
    let referenceId: string | undefined;
    if (voice && !voice.startsWith('fish_') && voice !== 'default') {
      referenceId = voice;
    }

    const payload: Record<string, any> = {
      text: composed.synthesizedText,
      format: 'mp3',
    };
    if (referenceId) {
      payload.reference_id = referenceId;
    }

    console.log(
      `[FishAudioProvider] Synthesizing speech with model "${model}" (lang: ${effectiveLang}, voice: ${voice}, emotion: ${options?.emotion || 'neutral'}, tag: ${composed.appliedTag || 'none'})`
    );

    const headers: Record<string, string> = {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'model': model,
    };

    let audioBuffer: Buffer | null = null;
    let attempts = 0;
    const maxAttempts = 3;

    while (attempts < maxAttempts) {
      attempts++;
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.timeoutMs);

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

        if (statusCode === 401 || statusCode === 403) {
          throw new Error(
            'Fish Audio authentication failed (401/403). Please verify that your FISH_API_KEY is valid.'
          );
        }

        if (statusCode === 429) {
          throw new Error(
            'Fish Audio rate limit exceeded (429). Please wait a moment before generating more audio.'
          );
        }

        if (statusCode === 400 || statusCode === 404) {
          // Check if error is related to the free model
          if (errorBody.toLowerCase().includes('model') || errorBody.toLowerCase().includes('tier')) {
            throw new Error(
              `Fish Audio free model "${model}" rejected: ${errorBody}. ` +
              `Free-model policy prevents falling back to paid models.`
            );
          }
          throw new Error(`Fish Audio bad request (${statusCode}): ${errorBody}`);
        }

        // 5xx Server errors - retry with backoff if attempts remaining
        if (statusCode >= 500 && attempts < maxAttempts && this.timeoutMs >= 1000) {
          console.warn(`[FishAudioProvider] Transient error (${statusCode}), retrying attempt ${attempts + 1}...`);
          await new Promise((resolve) => setTimeout(resolve, 800 * attempts));
          continue;
        }

        throw new Error(`Fish Audio server error (${statusCode}): ${errorBody}`);
      } catch (err: any) {
        clearTimeout(timeoutId);
        if (err.name === 'AbortError') {
          if (attempts < maxAttempts && this.timeoutMs >= 1000) {
            console.warn(`[FishAudioProvider] Request timed out, retrying attempt ${attempts + 1}...`);
            await new Promise((resolve) => setTimeout(resolve, 800 * attempts));
            continue;
          }
          throw new Error(`Fish Audio request timed out after ${Math.round(this.timeoutMs / 1000)} seconds. Please check your network connection.`);
        }
        if (attempts >= maxAttempts || err.message?.includes('authentication failed') || err.message?.includes('rate limit') || err.message?.includes('free-model')) {
          throw err;
        }
      }
    }

    if (!audioBuffer || audioBuffer.length === 0) {
      throw new Error('Fish Audio returned empty audio buffer');
    }

    // Save temporary audio file to measure duration and apply optional post-processing effects
    const tempDir = path.join(process.cwd(), 'storage', 'temp');
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }

    const rawFile = path.join(tempDir, `fish-raw-${Date.now()}-${Math.random().toString(36).substring(7)}.mp3`);
    const procFile = path.join(tempDir, `fish-proc-${Date.now()}-${Math.random().toString(36).substring(7)}.mp3`);

    try {
      await fs.promises.writeFile(rawFile, audioBuffer);

      let durationMs = 0;
      try {
        durationMs = await this.probeAudioDuration(rawFile);
      } catch {
        // Fallback estimation based on spoken word count
        const words = composed.spokenText.split(/\s+/).length;
        durationMs = Math.round(words * 450 + 800);
      }

      let finalBuffer = audioBuffer;

      // Apply audio effects if requested
      if (effect && effect !== 'normal') {
        const effectRes = await this.effectsService.applyEffect(rawFile, procFile, effect, {
          sampleRate: 24000,
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
        sampleRate: 24000,
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
   * Probes audio file duration accurately via ffprobe.
   */
  private async probeAudioDuration(filePath: string): Promise<number> {
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

