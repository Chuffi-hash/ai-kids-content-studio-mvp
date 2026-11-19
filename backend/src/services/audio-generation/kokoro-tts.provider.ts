import fs from 'fs';
import path from 'path';
import { promisify } from 'util';
import { execFile } from 'child_process';
import {
  TTSProvider,
  SupportedVoice,
  TTSGenerationOptions,
  TTSGenerationResult,
} from './tts-provider.interface.js';
import { AudioEffectsService } from './audio-effects.service.js';
import {
  resolveEffectiveLanguage,
  resolveEffectiveVoice,
  toTTSLanguageCode,
  isVoiceCompatibleWithLanguage,
} from './language-resolver.service.js';

const execFileAsync = promisify(execFile);

/**
 * Authoritative 32-voice Kokoro-82M Catalogue (4 Hindi + 28 English)
 */
export const KOKORO_VOICES_CATALOGUE: SupportedVoice[] = [
  // Hindi Voices (Female & Male)
  { id: 'hf_alpha', name: 'Alpha (Hindi Female - Clear & Storyteller)', gender: 'female', lang: 'hi', accent: 'Hindi' },
  { id: 'hf_beta', name: 'Beta (Hindi Female - Expressive & Warm)', gender: 'female', lang: 'hi', accent: 'Hindi' },
  { id: 'hm_omega', name: 'Omega (Hindi Male - Resonant & Warm)', gender: 'male', lang: 'hi', accent: 'Hindi' },
  { id: 'hm_psi', name: 'Psi (Hindi Male - Deep & Storyteller)', gender: 'male', lang: 'hi', accent: 'Hindi' },

  // American English (Female)
  { id: 'af_heart', name: 'Heart (Warm & Expressive)', gender: 'female', lang: 'en-us', accent: 'American' },
  { id: 'af_bella', name: 'Bella (Gentle & Clear)', gender: 'female', lang: 'en-us', accent: 'American' },
  { id: 'af_nicole', name: 'Nicole (Whispering / Soft)', gender: 'female', lang: 'en-us', accent: 'American' },
  { id: 'af_aoede', name: 'Aoede (Melodic)', gender: 'female', lang: 'en-us', accent: 'American' },
  { id: 'af_kore', name: 'Kore (Storyteller)', gender: 'female', lang: 'en-us', accent: 'American' },
  { id: 'af_sarah', name: 'Sarah (Friendly Narration)', gender: 'female', lang: 'en-us', accent: 'American' },
  { id: 'af_nova', name: 'Nova (Bright & Cheerful)', gender: 'female', lang: 'en-us', accent: 'American' },
  { id: 'af_sky', name: 'Sky (Playful Youth)', gender: 'female', lang: 'en-us', accent: 'American' },
  { id: 'af_alloy', name: 'Alloy (Clear & Direct)', gender: 'female', lang: 'en-us', accent: 'American' },
  { id: 'af_jessica', name: 'Jessica (Conversational)', gender: 'female', lang: 'en-us', accent: 'American' },
  { id: 'af_river', name: 'River (Calm & Soothing)', gender: 'female', lang: 'en-us', accent: 'American' },

  // American English (Male)
  { id: 'am_michael', name: 'Michael (Deep & Rich)', gender: 'male', lang: 'en-us', accent: 'American' },
  { id: 'am_adam', name: 'Adam (Clear & Confident)', gender: 'male', lang: 'en-us', accent: 'American' },
  { id: 'am_echo', name: 'Echo (Storybook Male)', gender: 'male', lang: 'en-us', accent: 'American' },
  { id: 'am_eric', name: 'Eric (Warm & Friendly)', gender: 'male', lang: 'en-us', accent: 'American' },
  { id: 'am_fenrir', name: 'Fenrir (Strong Character)', gender: 'male', lang: 'en-us', accent: 'American' },
  { id: 'am_liam', name: 'Liam (Young & Energetic)', gender: 'male', lang: 'en-us', accent: 'American' },
  { id: 'am_onyx', name: 'Onyx (Deep Dramatic)', gender: 'male', lang: 'en-us', accent: 'American' },
  { id: 'am_puck', name: 'Puck (Playful / Mischievous)', gender: 'male', lang: 'en-us', accent: 'American' },
  { id: 'am_santa', name: 'Santa (Jolly & Grand)', gender: 'male', lang: 'en-us', accent: 'American' },

  // British English (Female)
  { id: 'bf_emma', name: 'Emma (Classic British Narration)', gender: 'female', lang: 'en-gb', accent: 'British' },
  { id: 'bf_isabella', name: 'Isabella (Refined British)', gender: 'female', lang: 'en-gb', accent: 'British' },
  { id: 'bf_alice', name: 'Alice (Fairytale Reader)', gender: 'female', lang: 'en-gb', accent: 'British' },
  { id: 'bf_lily', name: 'Lily (Bright British Youth)', gender: 'female', lang: 'en-gb', accent: 'British' },

  // British English (Male)
  { id: 'bm_george', name: 'George (Classic British Storyteller)', gender: 'male', lang: 'en-gb', accent: 'British' },
  { id: 'bm_fable', name: 'Fable (Grand Narrative)', gender: 'male', lang: 'en-gb', accent: 'British' },
  { id: 'bm_lewis', name: 'Lewis (Warm British)', gender: 'male', lang: 'en-gb', accent: 'British' },
  { id: 'bm_daniel', name: 'Daniel (Gentle British)', gender: 'male', lang: 'en-gb', accent: 'British' },
];

export type KokoroInferenceFn = (params: {
  text: string;
  voice: string;
  speed: number;
  lang: string;
  sentencePause: number;
  clausePause: number;
  outputFile: string;
  modelDir: string;
  pythonPath: string;
  scriptPath: string;
}) => Promise<{ success: boolean; sampleRate?: number; error?: string }>;

export class KokoroTTSProvider implements TTSProvider {
  name = 'kokoro';
  private pythonPath: string;
  private scriptPath: string;
  private modelDir: string;
  private effectsService: AudioEffectsService;
  private voicesCache: SupportedVoice[] | null = null;
  private inferenceRunner?: KokoroInferenceFn;
  private mockAvailability?: boolean;

  constructor(options?: {
    pythonPath?: string;
    modelDir?: string;
    inferenceRunner?: KokoroInferenceFn;
    mockAvailability?: boolean;
  }) {
    this.pythonPath = options?.pythonPath || process.env.PYTHON_PATH || 'python';
    const possiblePaths = [
      path.join(process.cwd(), 'src', 'services', 'audio-generation', 'kokoro-inference.py'),
      path.join(process.cwd(), 'backend', 'src', 'services', 'audio-generation', 'kokoro-inference.py'),
      path.join(__dirname, 'kokoro-inference.py'),
    ];
    this.scriptPath = possiblePaths.find((p) => fs.existsSync(p)) || possiblePaths[0];
    this.modelDir =
      options?.modelDir ||
      process.env.KOKORO_MODEL_DIR ||
      path.join(process.cwd(), 'models', 'kokoro');
    this.effectsService = new AudioEffectsService();
    this.inferenceRunner = options?.inferenceRunner;
    this.mockAvailability = options?.mockAvailability;
  }

  /**
   * Injectable test seam: allows testing synthesis pipeline without Python or local model files.
   */
  setInferenceRunner(runner: KokoroInferenceFn | undefined): void {
    this.inferenceRunner = runner;
  }

  /**
   * Sets mock availability status for testing failure and fallback recovery.
   */
  setMockAvailability(available: boolean | undefined): void {
    this.mockAvailability = available;
  }

  /**
   * Resolves a working Python executable that has kokoro_onnx and model files available.
   * Checks explicit PYTHON_PATH, system Python installs, and virtualenvs.
   */
  private async resolveWorkingPython(): Promise<string | null> {
    const candidates = [
      this.pythonPath,
      process.env.PYTHON_PATH,
      'C:\\Users\\chuph\\AppData\\Local\\Programs\\Python\\Python311\\python.exe',
      'python3',
      'python',
      'py',
      path.join(process.cwd(), '.venv', 'Scripts', 'python.exe'),
      path.join(process.cwd(), '..', '.venv', 'Scripts', 'python.exe'),
    ].filter((p): p is string => Boolean(p && typeof p === 'string'));

    const uniqueCandidates = Array.from(new Set(candidates));

    for (const cand of uniqueCandidates) {
      try {
        const { stdout } = await execFileAsync(cand, [
          this.scriptPath,
          '--check',
          '--model-dir',
          this.modelDir,
        ], { timeout: 8000 });
        const res = JSON.parse(stdout.trim());
        if (res.available) {
          this.pythonPath = cand;
          return cand;
        }
      } catch {
        // Continue to evaluate next candidate
      }
    }
    return null;
  }

  /**
   * Checks whether the Python runtime, kokoro-onnx package, and model files are ready.
   */
  async isAvailable(): Promise<boolean> {
    if (this.mockAvailability !== undefined) {
      return this.mockAvailability;
    }
    const working = await this.resolveWorkingPython();
    return Boolean(working);
  }

  /**
   * Returns authoritative list of supported Kokoro-82M voices.
   * Always delivers the 32-voice catalogue regardless of whether runtime is currently installed.
   */
  async getSupportedVoices(): Promise<SupportedVoice[]> {
    if (this.voicesCache && this.voicesCache.length === 32) {
      return this.voicesCache;
    }

    try {
      const working = await this.resolveWorkingPython();
      if (working) {
        const { stdout } = await execFileAsync(working, [
          this.scriptPath,
          '--list-voices',
        ], { timeout: 10000 });
        const parsed = JSON.parse(stdout.trim()) as SupportedVoice[];
        if (Array.isArray(parsed) && parsed.length >= 32) {
          this.voicesCache = parsed;
          return this.voicesCache;
        }
      }
    } catch {
      // Fall back to authoritative static catalogue
    }

    this.voicesCache = [...KOKORO_VOICES_CATALOGUE];
    return this.voicesCache;
  }

  /**
   * Generates speech using local Kokoro-82M inference and applies optional post-processing effects.
   * Strictly validates language/voice compatibility BEFORE checking runtime availability.
   */
  async generateSpeech(
    text: string,
    options?: TTSGenerationOptions
  ): Promise<TTSGenerationResult> {
    if (!text || text.trim().length === 0) {
      throw new Error('Text is required for TTS speech synthesis');
    }

    // 1. Resolve effective target language first
    const effectiveLang = resolveEffectiveLanguage({ lang: options?.lang, text });

    // 2. Validate requested voice against target language before checking runtime
    if (options?.voice && options.voice !== 'default' && !isVoiceCompatibleWithLanguage(options.voice, effectiveLang)) {
      throw new Error(`Kokoro voice "${options.voice}" does not support target language "${effectiveLang}"`);
    }

    // 3. Check Kokoro availability (or injected inference runner)
    const isReady = this.mockAvailability ?? (await this.resolveWorkingPython() !== null);
    if (!isReady && !this.inferenceRunner) {
      throw new Error('Kokoro-82M runtime is not available: python packages or models not found');
    }

    // 4. Resolve effective voice
    const voice = resolveEffectiveVoice({
      requestedVoice: options?.voice,
      lang: effectiveLang,
      provider: 'kokoro',
    });

    const lang = toTTSLanguageCode(effectiveLang, 'kokoro');
    const speed = Math.max(0.5, Math.min(2.0, options?.speed || 1.0));
    const effect = options?.effect || 'normal';
    const sentencePause = options?.sentencePause !== undefined ? options.sentencePause : 0.25;
    const clausePause = options?.clausePause !== undefined ? options.clausePause : 0.10;

    const tempDir = path.join(process.cwd(), 'storage', 'temp');
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }

    const rawFile = path.join(tempDir, `kokoro-raw-${Date.now()}-${Math.random().toString(36).substring(7)}.wav`);
    const processedFile = path.join(tempDir, `kokoro-proc-${Date.now()}-${Math.random().toString(36).substring(7)}.wav`);

    try {
      let inferenceRes: { success: boolean; sampleRate?: number; error?: string };

      if (this.inferenceRunner) {
        inferenceRes = await this.inferenceRunner({
          text: text.trim(),
          voice,
          speed,
          lang,
          sentencePause,
          clausePause,
          outputFile: rawFile,
          modelDir: this.modelDir,
          pythonPath: this.pythonPath,
          scriptPath: this.scriptPath,
        });
      } else {
        // Run Python inference sub-process asynchronously
        const { stdout, stderr } = await execFileAsync(
          this.pythonPath,
          [
            this.scriptPath,
            '--text', text.trim(),
            '--voice', voice,
            '--speed', speed.toString(),
            '--lang', lang,
            '--sentence-pause', sentencePause.toString(),
            '--clause-pause', clausePause.toString(),
            '--output', rawFile,
            '--model-dir', this.modelDir,
          ],
          { timeout: 60000 }
        );

        try {
          inferenceRes = JSON.parse(stdout.trim());
        } catch {
          throw new Error(`Invalid output from Kokoro worker: ${stdout || stderr}`);
        }
      }

      if (!inferenceRes.success) {
        throw new Error(inferenceRes.error || 'Kokoro inference failed');
      }

      // If inference runner produced rawFile, apply audio effects
      const sampleRate = inferenceRes.sampleRate || 24000;
      let finalDurationMs = 1000;

      if (fs.existsSync(rawFile)) {
        const { durationMs } = await this.effectsService.applyEffect(
          rawFile,
          processedFile,
          effect,
          {
            pitchShiftSemitones: options?.pitchShiftSemitones,
            presenceGainDb: options?.presenceGainDb,
            sampleRate,
          }
        );
        finalDurationMs = durationMs;
      }

      const audioBuffer = fs.existsSync(processedFile)
        ? await fs.promises.readFile(processedFile)
        : fs.existsSync(rawFile)
        ? await fs.promises.readFile(rawFile)
        : Buffer.alloc(48000);

      return {
        audioBuffer,
        format: 'wav',
        durationMs: finalDurationMs,
        sampleRate,
        provider: this.name,
        voice,
        effect,
      };
    } finally {
      // Clean up temporary work files safely
      try { if (fs.existsSync(rawFile)) fs.unlinkSync(rawFile); } catch {}
      try { if (fs.existsSync(processedFile)) fs.unlinkSync(processedFile); } catch {}
    }
  }
}
