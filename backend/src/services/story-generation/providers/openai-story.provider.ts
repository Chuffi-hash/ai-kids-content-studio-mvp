import OpenAI from 'openai';
import { StoryGenerationProvider } from '../story-provider.interface.js';
import { StoryGenerationInput } from '../story-generation.types.js';

export class OpenAIStoryProvider implements StoryGenerationProvider {
  name = 'openai';
  private client: OpenAI | null = null;
  private model: string;

  constructor(model = 'gpt-4o-mini') {
    this.model = process.env.OPENAI_MODEL || model;
    if (process.env.OPENAI_API_KEY) {
      this.client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    }
  }

  async isAvailable(): Promise<boolean> {
    return Boolean(process.env.OPENAI_API_KEY && this.client);
  }

  async generateRaw(prompt: string, input: StoryGenerationInput): Promise<string> {
    if (!this.client || !process.env.OPENAI_API_KEY) {
      throw new Error('OPENAI_API_KEY is not configured');
    }

    const response = await this.client.chat.completions.create({
      model: this.model,
      messages: [
        {
          role: 'system',
          content: 'You are an expert children’s animation story writer. Output ONLY a valid JSON object according to the requested schema. No code fences, no commentary.',
        },
        {
          role: 'user',
          content: prompt,
        },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.5,
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      throw new Error('Empty response received from OpenAI API');
    }

    return content;
  }
}
