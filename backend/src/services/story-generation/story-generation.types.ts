import { CustomCharacterAppearance } from '../animation/templates/custom-character-rig.js';
import { VectorSceneData } from '../animation/vector-animation.engine.js';

export interface StoryGenerationInput {
  // Required inputs
  topic: string;
  ageGroup?: string; // '2-4 years' | '4-7 years' | '8-10 years' | '10-12 years'
  desiredDurationSeconds?: number; // e.g. 30, 60, 120, 180 (default: 60)
  language?: string; // default: 'English'

  // Optional inputs
  title?: string;
  genre?: string; // 'Adventure' | 'Comedy' | 'Fantasy' | 'Mystery' | 'Educational' | 'Bedtime'
  lesson?: string;
  topicTheme?: string;
  characterIds?: string[]; // IDs of existing characters from character library
  newCharacters?: Array<{
    name: string;
    species?: string;
    description?: string;
  }>;
  sceneCount?: number; // 2 to 8 (default: 4-5 based on duration)
  tone?: string; // 'gentle' | 'funny' | 'exciting' | 'educational' | 'cheerful'
  contentRestrictions?: string;
  idempotencyKey?: string;
  visualStyle?: string;
  audience?: string;
}

export interface StructuredDialogue {
  characterName: string;
  text: string;
  emotion?: string;
}

export interface StructuredCharacterAction {
  characterName: string;
  action: 'walk' | 'wave' | 'jump' | 'idle' | string;
  pose?: string;
  description?: string;
}

export interface StructuredScene {
  sceneNumber: number;
  title: string;
  summary: string;
  visualDescription: string;
  location: string;
  timeOfDay: string;
  narration: string;
  dialogue: StructuredDialogue[];
  characterActions: StructuredCharacterAction[];
  durationSeconds: number;
}

export interface StructuredCharacter {
  name: string;
  role: 'protagonist' | 'antagonist' | 'supporting' | 'mentor' | 'companion' | string;
  species: string;
  description: string;
  personality: string[] | string;
}

export interface StructuredStory {
  title: string;
  logline: string;
  lesson: string;
  targetAudience: string;
  genre: string;
  estimatedDurationSeconds: number;
  characters: StructuredCharacter[];
  scenes: StructuredScene[];
}

export interface PersistedStoryResult {
  story: {
    id: string;
    storyId: string;
    title: string;
    logline: string;
    lesson: string;
    topic: string | null;
    ageGroup: string | null;
    audience: string | null;
    genre: string | null;
    visualStyle: string | null;
    targetDuration: number | null;
    createdAt: Date;
    updatedAt: Date;
  };
  scenes: any[];
  characters: any[];
  storyId: string;
}
