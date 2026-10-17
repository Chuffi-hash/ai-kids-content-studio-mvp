import { StoryGenerationInput } from './story-generation.types.js';

export interface StoryGenerationProvider {
  name: string;
  isAvailable(): Promise<boolean>;
  generateRaw(prompt: string, input: StoryGenerationInput): Promise<string>;
}
