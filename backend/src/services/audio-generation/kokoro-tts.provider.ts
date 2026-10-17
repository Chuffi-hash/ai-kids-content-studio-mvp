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
   * Checks whether the Python runtime, kokoro-onnx package, and model files are ready.
   */
  async isAvailable(): Promise<boolean> {
    try {
      const { stdout } = await execFileAsync(this.pythonPath, [
        this.scriptPath,
        '--check',
        '--model-dir',
        this.modelDir,
      ], { timeout: 10000 });
      const res = JSON.parse(stdout.trim());
      return Boolean(res.available);
    } catch (e) {
      return false;
    }
  }

  /**
   * Returns list of supported Kokoro-82M voices.
   */
  async getSupportedVoices(): Promise<SupportedVoice[]> {
    if (this.voicesCache) {
      return this.voicesCache;
    }

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

    const voice = options?.voice || 'af_heart';
    const lang = options?.lang || (voice.startsWith('b') ? 'en-gb' : 'en-us');
    const speed = Math.max(0.5, Math.min(2.0, options?.speed || 1.0));
    const effect = options?.effect || 'normal';

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
          '--output', rawFile,
          '--model-dir', this.modelDir,
        ],
        { timeout: 35000 }
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

      // Apply audio effect (normal, robot, cartoon)
      const { durationMs } = await this.effectsService.applyEffect(
        rawFile,
        processedFile,
        effect
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
