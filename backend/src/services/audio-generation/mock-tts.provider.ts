import {
  TTSProvider,
  SupportedVoice,
  TTSGenerationOptions,
  TTSGenerationResult,
} from "./tts-provider.interface.js";

/**
 * Deterministic PCM provider used only by automated tests.
 *
 * It deliberately produces a short valid WAV tone rather than pretending to
 * synthesize speech. This exercises preview, file persistence, duration
 * probing, and audio post-processing without Python models or network access.
 */
export class MockTTSProvider implements TTSProvider {
  public readonly name = "mock";

  async isAvailable(): Promise<boolean> {
    return true;
  }

  async getSupportedVoices(): Promise<SupportedVoice[]> {
    return [
      {
        id: "mock-neutral",
        name: "Mock Neutral",
        gender: "neutral",
        lang: "hi",
        accent: "Test",
      },
    ];
  }

  async generateSpeech(
    text: string,
    options?: TTSGenerationOptions,
  ): Promise<TTSGenerationResult> {
    const cleanText = String(text || "").trim();
    if (!cleanText) {
      throw new Error("Text is required for mock TTS synthesis.");
    }

    const sampleRate = 24000;
    const channels = 1;
    const bytesPerSample = 2;
    const wordCount = cleanText.split(/\s+/).length;
    const durationMs = Math.max(800, Math.min(5000, 500 + wordCount * 180));
    const sampleCount = Math.floor((sampleRate * durationMs) / 1000);
    const dataBytes = sampleCount * channels * bytesPerSample;
    const wav = Buffer.alloc(44 + dataBytes);

    wav.write("RIFF", 0, "ascii");
    wav.writeUInt32LE(36 + dataBytes, 4);
    wav.write("WAVE", 8, "ascii");
    wav.write("fmt ", 12, "ascii");
    wav.writeUInt32LE(16, 16);
    wav.writeUInt16LE(1, 20); // Linear PCM
    wav.writeUInt16LE(channels, 22);
    wav.writeUInt32LE(sampleRate, 24);
    wav.writeUInt32LE(sampleRate * channels * bytesPerSample, 28);
    wav.writeUInt16LE(channels * bytesPerSample, 32);
    wav.writeUInt16LE(bytesPerSample * 8, 34);
    wav.write("data", 36, "ascii");
    wav.writeUInt32LE(dataBytes, 40);

    // A quiet deterministic tone keeps the WAV valid for ffmpeg/ffprobe.
    const frequency = 330;
    const amplitude = 1200;
    for (let i = 0; i < sampleCount; i += 1) {
      const sample = Math.round(
        amplitude * Math.sin((2 * Math.PI * frequency * i) / sampleRate),
      );
      wav.writeInt16LE(sample, 44 + i * bytesPerSample);
    }

    return {
      audioBuffer: wav,
      format: "wav",
      durationMs,
      sampleRate,
      provider: this.name,
      voice: options?.voice || "mock-neutral",
      effect: options?.effect || "normal",
    };
  }
}
