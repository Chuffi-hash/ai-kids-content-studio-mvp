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

export class KokoroTTSProvider implements TTSProvider {
  name = 'kokoro';
  private pythonPath: string;
  private scriptPath: string;
  private modelDir: string;
  private effectsService: AudioEffectsService;
  private voicesCache: SupportedVoice[] | null = null;

  constructor(options?: { pythonPath?: string; modelDir?: string }) {
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
    const working = await this.resolveWorkingPython();
    return Boolean(working);
  }

  /**
   * Returns list of supported Kokoro-82M voices.
   */
  async getSupportedVoices(): Promise<SupportedVoice[]> {
    if (this.voicesCache) {
      return this.voicesCache;
    }

    await this.resolveWorkingPython();

    try {
      const { stdout } = await execFileAsync(this.pythonPath, [
        this.scriptPath,
        '--list-voices',
      ], { timeout: 10000 });
      this.voicesCache = JSON.parse(stdout.trim()) as SupportedVoice[];
      return this.voicesCache;
    } catch (e) {
      // Fallback default list if script fails to execute
      return [
        { id: 'hf_alpha', name: 'Alpha (Hindi Female - Clear & Storyteller)', gender: 'female', lang: 'hi', accent: 'Hindi' },
        { id: 'hf_beta', name: 'Beta (Hindi Female - Expressive & Warm)', gender: 'female', lang: 'hi', accent: 'Hindi' },
        { id: 'hm_omega', name: 'Omega (Hindi Male - Resonant & Warm)', gender: 'male', lang: 'hi', accent: 'Hindi' },
        { id: 'hm_psi', name: 'Psi (Hindi Male - Deep & Storyteller)', gender: 'male', lang: 'hi', accent: 'Hindi' },
        { id: 'af_heart', name: 'Heart (Warm & Expressive)', gender: 'female', lang: 'en-us', accent: 'American' },
        { id: 'af_bella', name: 'Bella (Gentle & Clear)', gender: 'female', lang: 'en-us', accent: 'American' },
        { id: 'af_sarah', name: 'Sarah (Friendly Narration)', gender: 'female', lang: 'en-us', accent: 'American' },
        { id: 'am_michael', name: 'Michael (Deep & Rich)', gender: 'male', lang: 'en-us', accent: 'American' },
        { id: 'am_adam', name: 'Adam (Clear & Confident)', gender: 'male', lang: 'en-us', accent: 'American' },
        { id: 'bf_emma', name: 'Emma (Classic British)', gender: 'female', lang: 'en-gb', accent: 'British' },
        { id: 'bm_george', name: 'George (Classic Storyteller)', gender: 'male', lang: 'en-gb', accent: 'British' },
      ];
    }
  }

  /**
   * Generates speech using local Kokoro-82M inference and applies optional post-processing effects.
   */
  async generateSpeech(
    text: string,
    options?: TTSGenerationOptions
  ): Promise<TTSGenerationResult> {
    if (!text || text.trim().length === 0) {
      throw new Error('Text is required for TTS speech synthesis');
    }

    const hasWorkingPython = await this.resolveWorkingPython();
    if (!hasWorkingPython) {
      throw new Error('Kokoro-82M runtime is not available: python packages or models not found');
    }

    const effectiveLang = resolveEffectiveLanguage({ lang: options?.lang, text });

    if (options?.voice && options.voice !== 'default' && !isVoiceCompatibleWithLanguage(options.voice, effectiveLang)) {
      throw new Error(`Kokoro voice "${options.voice}" does not support target language "${effectiveLang}"`);
    }

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

      let inferenceRes: any;
      try {
        inferenceRes = JSON.parse(stdout.trim());
      } catch (parseErr) {
        throw new Error(`Invalid output from Kokoro worker: ${stdout || stderr}`);
      }

      if (!inferenceRes.success) {
        throw new Error(inferenceRes.error || 'Kokoro inference failed');
      }

      // Apply audio effect (normal, robot, cartoon, whisper, shout) and calibrated emotion prosody
      const { durationMs } = await this.effectsService.applyEffect(
        rawFile,
        processedFile,
        effect,
        {
          pitchShiftSemitones: options?.pitchShiftSemitones,
          presenceGainDb: options?.presenceGainDb,
          sampleRate: inferenceRes.sampleRate || 24000,
        }
      );

      const audioBuffer = await fs.promises.readFile(processedFile);

      return {
        audioBuffer,
        format: 'wav',
        durationMs,
        sampleRate: inferenceRes.sampleRate || 24000,
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
