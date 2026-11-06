import { TTSProvider, SupportedVoice } from './tts-provider.interface.js';
import { KokoroTTSProvider } from './kokoro-tts.provider.js';
import { GoogleTTSProvider } from './google-tts.provider.js';
import { FishAudioProvider } from './providers/fish-audio.provider.js';

export class TTSProviderFactory {
  private static kokoroProvider: KokoroTTSProvider = new KokoroTTSProvider();
  private static googleProvider: GoogleTTSProvider = new GoogleTTSProvider();
  private static fishAudioProvider: FishAudioProvider = new FishAudioProvider();

  /**
   * Resolves the requested or optimal TTS provider.
   * If 'fish_audio' is requested, returns the Fish Audio provider.
   * If 'google' is requested, returns Google TTS.
   * If 'kokoro' is requested or default, it checks availability.
   * If kokoro is available, returns it; otherwise falls back gracefully to Google TTS.
   */
  static async getProvider(preferred?: string): Promise<TTSProvider> {
    const pref = (preferred || process.env.DEFAULT_TTS_PROVIDER || 'kokoro').toLowerCase();

    if (pref === 'fish_audio' || pref === 'fish' || pref === 'fishaudio' || pref === 'fish-audio') {
      return this.fishAudioProvider;
    }

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
   * Preserves backward compatibility: default call returns Kokoro/Google catalogue (32 Kokoro voices),
   * while also surfacing Fish Audio availability and voices.
   */
  static async getAllVoices(providerName?: string): Promise<{
    activeProvider: string;
    isKokoroAvailable: boolean;
    isFishAudioAvailable: boolean;
    voices: SupportedVoice[];
    fishAudioVoices: SupportedVoice[];
    effects: Array<{ id: string; name: string; description: string }>;
    providers: Array<{ id: string; name: string; available: boolean; model?: string; isFree?: boolean }>;
  }> {
    const isKokoroAvailable = await this.kokoroProvider.isAvailable();
    const isFishAudioAvailable = await this.fishAudioProvider.isAvailable();

    const effects = [
      { id: 'normal', name: 'Normal', description: 'Natural generated voice without post-processing' },
      { id: 'robot', name: 'Robot', description: 'Electronic, synthesized mechanical robot voice' },
      { id: 'cartoon', name: 'Cartoon Creature', description: 'Playful, high-pitched creature / chipmunk character' },
    ];

    const providers = [
      { id: 'kokoro', name: 'Kokoro-82M (Local ONNX)', available: isKokoroAvailable, model: 'kokoro-v0_19', isFree: true },
      { id: 'fish_audio', name: 'Fish Audio (Cloud - s2.1-pro-free)', available: isFishAudioAvailable, model: 's2.1-pro-free', isFree: true },
      { id: 'google', name: 'Google TTS (Fallback)', available: true, isFree: true },
    ];

    const fishAudioVoices = await this.fishAudioProvider.getSupportedVoices();

    const normalizedReq = (providerName || '').toLowerCase();
    if (normalizedReq === 'fish_audio' || normalizedReq === 'fish' || normalizedReq === 'fishaudio') {
      return {
        activeProvider: 'fish_audio',
        isKokoroAvailable,
        isFishAudioAvailable,
        voices: fishAudioVoices,
        fishAudioVoices,
        effects,
        providers,
      };
    }

    const activeProvider = isKokoroAvailable ? 'kokoro' : 'google';
    const primaryProvider = isKokoroAvailable ? this.kokoroProvider : this.googleProvider;
    const voices = await primaryProvider.getSupportedVoices();

    return {
      activeProvider,
      isKokoroAvailable,
      isFishAudioAvailable,
      voices,
      fishAudioVoices,
      effects,
      providers,
    };
  }

  static getFishAudioProvider(): FishAudioProvider {
    return this.fishAudioProvider;
  }
}

