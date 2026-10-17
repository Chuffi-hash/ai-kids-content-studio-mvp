import { StoryGenerationProvider } from '../story-provider.interface.js';
import { DeterministicStoryProvider } from './deterministic-story.provider.js';
import { OllamaStoryProvider } from './ollama-story.provider.js';
import { OpenAIStoryProvider } from './openai-story.provider.js';
import { StoryGenerationInput } from '../story-generation.types.js';

export class StoryProviderFactory {
  private static mockProvider: StoryGenerationProvider | null = null;

  public static setMockProvider(provider: StoryGenerationProvider | null): void {
    this.mockProvider = provider;
  }

  public static async getProvider(): Promise<StoryGenerationProvider> {
    if (this.mockProvider) {
      return this.mockProvider;
    }

    const requestedProvider = (process.env.AI_STORY_PROVIDER || '').toLowerCase();

    if (requestedProvider === 'openai') {
      const openai = new OpenAIStoryProvider();
      if (await openai.isAvailable()) return openai;
      console.warn('[StoryProviderFactory] OpenAI requested but not available. Falling back to deterministic provider.');
    } else if (requestedProvider === 'ollama') {
      const ollama = new OllamaStoryProvider();
      if (await ollama.isAvailable()) return ollama;
      console.warn('[StoryProviderFactory] Ollama requested but not available. Falling back to deterministic provider.');
    } else if (requestedProvider === 'deterministic' || requestedProvider === 'local') {
      return new DeterministicStoryProvider();
    }

    // Auto-detect best available provider
    if (process.env.OPENAI_API_KEY) {
      const openai = new OpenAIStoryProvider();
      if (await openai.isAvailable()) return openai;
    }

    const ollama = new OllamaStoryProvider();
    if (await ollama.isAvailable()) {
      return ollama;
    }

    return new DeterministicStoryProvider();
  }

  /**
   * Executes story generation with bounded retry and graceful fallback.
   */
  public static async generateStoryJson(
    prompt: string,
    input: StoryGenerationInput,
    maxRetries = 1
  ): Promise<{ rawJson: string; providerName: string }> {
    const provider = await this.getProvider();

    try {
      const raw = await provider.generateRaw(prompt, input);
      return { rawJson: raw, providerName: provider.name };
    } catch (error: any) {
      console.warn(
        `[StoryProviderFactory] Provider ${provider.name} failed (${error?.message || error}). Checking fallback...`
      );

      // If an external provider failed, attempt fallback to DeterministicStoryProvider
      if (provider.name !== 'deterministic') {
        const fallback = new DeterministicStoryProvider();
        const raw = await fallback.generateRaw(prompt, input);
        return { rawJson: raw, providerName: 'deterministic_fallback' };
      }

      throw error;
    }
  }
}
