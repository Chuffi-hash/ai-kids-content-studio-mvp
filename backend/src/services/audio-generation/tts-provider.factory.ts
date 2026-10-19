import { TTSProvider, SupportedVoice } from './tts-provider.interface.js';
import { KokoroTTSProvider } from './kokoro-tts.provider.js';
import { GoogleTTSProvider } from './google-tts.provider.js';

export class TTSProviderFactory {
  private static kokoroProvider: KokoroTTSProvider = new KokoroTTSProvider();
  private static googleProvider: GoogleTTSProvider = new GoogleTTSProvider();

  /**
   * Resolves the requested or optimal TTS provider.
   * If 'kokoro' is requested or default, it checks availability.
   * If kokoro is available, returns it; otherwise falls back gracefully to Google TTS.
   */
  static async getProvider(preferred?: string): Promise<TTSProvider> {
    const pref = (preferred || process.env.DEFAULT_TTS_PROVIDER || 'kokoro').toLowerCase();

    if (pref === 'google') {
      return this.googleProvider;
    }

    // Default to Kokoro, with automatic fallback
    const kokoroOk = await this.kokoroProvider.isAvailable();
    if (kokoroOk) {
      return this.kokoroProvider;
    }

    console.warn('[TTSProviderFactory] Kokoro-82M is not available locally. Falling back to Google TTS.');
    return this.googleProvider;
  }

  /**
   * Returns list of supported voices from all available providers.
   */
  static async getAllVoices(): Promise<{
    activeProvider: string;
    isKokoroAvailable: boolean;
    voices: SupportedVoice[];
    effects: Array<{ id: string; name: string; description: string }>;
  }> {
    const isKokoroAvailable = await this.kokoroProvider.isAvailable();
    const activeProvider = isKokoroAvailable ? 'kokoro' : 'google';
    const provider = isKokoroAvailable ? this.kokoroProvider : this.googleProvider;
    const voices = await provider.getSupportedVoices();

    const effects = [
      { id: 'normal', name: 'Normal', description: 'Natural generated voice without post-processing' },
      { id: 'robot', name: 'Robot', description: 'Electronic, synthesized mechanical robot voice' },
      { id: 'cartoon', name: 'Cartoon Creature', description: 'Playful, high-pitched creature / chipmunk character' },
    ];

    return {
      activeProvider,
      isKokoroAvailable,
      voices,
      effects,
    };
  }
}

