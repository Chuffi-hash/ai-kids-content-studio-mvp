import { StoryGenerationService } from './story-generation/story-generation.service.js';
import { type Story } from '../schemas/story.schema.js';
import { randomUUID } from 'crypto';

export interface StoryRequest {
  topic: string;
  ageGroup?: string;
  lesson?: string;
  audience?: string;
  genre?: string;
  visualStyle?: string;
  desiredDurationSeconds?: number;
  characterIds?: string[];
  sceneCount?: number;
  tone?: string;
}

export async function generateStory(
  input: StoryRequest
): Promise<Story & { id: string }> {
  const structured = await StoryGenerationService.generateStructuredStory({
    topic: input.topic,
    ageGroup: input.ageGroup,
    lesson: input.lesson,
    audience: input.audience,
    genre: input.genre,
    visualStyle: input.visualStyle,
    desiredDurationSeconds: input.desiredDurationSeconds,
    characterIds: input.characterIds,
    sceneCount: input.sceneCount,
    tone: input.tone,
  });

  return {
    id: randomUUID(),
    title: structured.title,
    logline: structured.logline,
    lesson: structured.lesson,
    characters: structured.characters.map((c) => ({
      name: c.name,
      species: c.species,
      personality: Array.isArray(c.personality) ? c.personality.join(', ') : c.personality,
      description: c.description,
    })),
  };
}