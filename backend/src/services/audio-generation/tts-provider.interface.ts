export type AudioEffectType = 'normal' | 'robot' | 'cartoon';

export interface SupportedVoice {
  id: string;
  name: string;
  gender: 'female' | 'male' | 'neutral';
  lang: string;
  accent?: string;
  grade?: string;
  description?: string;
}

export interface TTSGenerationOptions {
  voice?: string;
  lang?: string;
  speed?: number; // 0.5 - 2.0
  effect?: AudioEffectType;
  outputFormat?: 'wav' | 'mp3';
}

export interface TTSGenerationResult {
  audioBuffer: Buffer;
  format: 'wav' | 'mp3';
  durationMs: number;
  sampleRate: number;
  provider: string;
  voice: string;
  effect: AudioEffectType;
}

export interface TTSProvider {
  name: string;
  isAvailable(): Promise<boolean>;
  getSupportedVoices(): Promise<SupportedVoice[]>;
  generateSpeech(text: string, options?: TTSGenerationOptions): Promise<TTSGenerationResult>;
}

