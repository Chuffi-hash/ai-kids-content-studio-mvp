import fs from 'fs';
import path from 'path';
// @ts-ignore
import * as googleTTS from 'google-tts-api';
import {
  TTSProvider,
  SupportedVoice,
  TTSGenerationOptions,
  TTSGenerationResult,
} from './tts-provider.interface.js';
import { AudioEffectsService } from './audio-effects.service.js';

export class GoogleTTSProvider implements TTSProvider {
  name = 'google';
  private effectsService: AudioEffectsService;

  constructor() {
    this.effectsService = new AudioEffectsService();
  }

  async isAvailable(): Promise<boolean> {
    return true; // Always available as cloud fallback
  }

  async getSupportedVoices(): Promise<SupportedVoice[]> {
    return [
      { id: 'en-US-Standard', name: 'Google English (Standard)', gender: 'neutral', lang: 'en', accent: 'American' },
      { id: 'en-GB-Standard', name: 'Google British (Standard)', gender: 'neutral', lang: 'en-gb', accent: 'British' },
      { id: 'es-ES-Standard', name: 'Google Spanish (Standard)', gender: 'neutral', lang: 'es', accent: 'Spanish' },
      { id: 'fr-FR-Standard', name: 'Google French (Standard)', gender: 'neutral', lang: 'fr', accent: 'French' },
    ];
  }

  async generateSpeech(
    text: string,
    options?: TTSGenerationOptions
  ): Promise<TTSGenerationResult> {
    if (!text || text.trim().length === 0) {
      throw new Error('Text is required for Google TTS speech synthesis');
    }

    const lang = options?.lang || 'en';
    const effect = options?.effect || 'normal';

    const tempDir = path.join(process.cwd(), 'storage', 'temp');
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }

    const rawFile = path.join(tempDir, `google-raw-${Date.now()}-${Math.random().toString(36).substring(7)}.mp3`);
    const processedFile = path.join(tempDir, `google-proc-${Date.now()}-${Math.random().toString(36).substring(7)}.mp3`);

    try {
      const audioChunks = await googleTTS.getAllAudioBase64(text.trim(), {
        lang,
        slow: false,
        timeout: 15000,
      });
      const rawBuffer = Buffer.concat(
        audioChunks.map((chunk: any) => Buffer.from(chunk.base64, 'base64'))
      );
      await fs.promises.writeFile(rawFile, rawBuffer);

      // Apply effect if needed
      const { durationMs } = await this.effectsService.applyEffect(
        rawFile,
        processedFile,
        effect
      );

      const finalBuffer = await fs.promises.readFile(processedFile);

      return {
        audioBuffer: finalBuffer,
        format: 'mp3',
        durationMs,
        sampleRate: 24000,
        provider: this.name,
        voice: options?.voice || 'en-US-Standard',
        effect,
      };
    } finally {
      try { if (fs.existsSync(rawFile)) fs.unlinkSync(rawFile); } catch {}
      try { if (fs.existsSync(processedFile)) fs.unlinkSync(processedFile); } catch {}
    }
  }
}

