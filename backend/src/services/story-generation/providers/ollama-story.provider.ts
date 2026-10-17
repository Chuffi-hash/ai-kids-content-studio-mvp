import ollama from 'ollama';
import { StoryGenerationProvider } from '../story-provider.interface.js';
import { StoryGenerationInput } from '../story-generation.types.js';

export class OllamaStoryProvider implements StoryGenerationProvider {
  name = 'ollama';
  private model: string;
  private timeoutMs: number;

  constructor(model = 'llama3.2:3b', timeoutMs = 15000) {
    this.model = process.env.OLLAMA_MODEL || model;
    this.timeoutMs = timeoutMs;
  }

  async isAvailable(): Promise<boolean> {
    try {
      const controller = new AbortController();
      const id = setTimeout(() => controller.abort(), 2000);
      const res = await fetch('http://127.0.0.1:11434/api/tags', { signal: controller.signal });
      clearTimeout(id);
      return res.ok;
    } catch {
      return false;
    }
  }

  async generateRaw(prompt: string, input: StoryGenerationInput): Promise<string> {
    const isAvail = await this.isAvailable();
    if (!isAvail) {
      throw new Error(`Ollama service is not reachable at http://127.0.0.1:11434`);
    }

    const response = await Promise.race([
      ollama.chat({
        model: this.model,
        messages: [{ role: 'user', content: prompt }],
        format: 'json',
        options: {
          temperature: 0.4,
          num_predict: 4096,
        },
      }),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error(`Ollama request timed out after ${this.timeoutMs}ms`)), this.timeoutMs)
      ),
    ]);

    return response.message.content;
  }
}

