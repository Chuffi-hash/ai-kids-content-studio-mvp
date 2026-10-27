export interface SceneVersionItem {
  id: string;
  sceneId: string;
  versionNumber: number;
  prompt?: string | null;
  narration?: string | null;
  cameraDirection?: string | null;
  imageUrl?: string | null;
  videoUrl?: string | null;
  audioUrl?: string | null;
  durationMs?: number;
  createdAt: string;
}

import { VectorSceneData } from './animation';

export interface EditorScene {
  id: string;
  sceneId: string;
  storyId: string;
  title: string;
  number: number;
  order: number;
  startMs: number;
  endMs: number;
  narration: string;
  visualPrompt?: string | null;
  cameraDirection?: string | null;
  characterIds?: string[];
  imageUrl?: string | null;
  videoUrl?: string | null;
  audioUrl?: string | null;
  generationStatus?: 'draft' | 'generating' | 'completed' | 'failed';
  estimatedDurationMs?: number;
  actualAudioDurationMs?: number | null;
  generationError?: string | null;
  animationData?: VectorSceneData | null;
  dialogue?: Array<{ speaker: string; text: string }>;
  characterActions?: Array<{ characterName: string; action: string; pose?: string }>;
  versions?: SceneVersionItem[];
  image?: {
    id: string;
    imageUrl: string;
    width: number;
    height: number;
    status: string;
  } | null;
  deletedAt?: string | null;
  createdAt?: string;
  updatedAt?: string;
}

export interface EditorCharacter {
  id: string;
  name: string;
  species: string;
  personality: string;
  description: string;
  referenceImageUrl?: string | null;
  canonicalAppearance?: any;
}

export interface EditorStory {
  id: string;
  storyId: string;
  title: string;
  logline: string;
  lesson: string;
  topic?: string | null;
  ageGroup?: string | null;
  audience?: string | null;
  genre?: string | null;
  visualStyle?: string | null;
  targetDuration?: number | null;
  characters?: EditorCharacter[];
  scenes: EditorScene[];
}

export type SaveStatus = 'saved' | 'saving' | 'dirty' | 'error';

export interface ExportJobStatus {
  id: string;
  storyId: string;
  status: 'queued' | 'processing' | 'completed' | 'failed';
  progress: number;
  stage: string;
  downloadUrl?: string;
  filename?: string;
  error?: string;
  createdAt: string;
  completedAt?: string;
}

export interface HistorySnapshot {
  scenes: EditorScene[];
  title: string;
  targetDuration?: number | null;
  activeSceneId: string | null;
}

export interface DraftDialogueLine {
  id: string;
  characterName: string;
  characterId?: string;
  text: string;
  emotion: string;
  voice: string;
  action?: string;
  expression?: string;
}

export interface DraftOverlayItem {
  id: string;
  type: string;
  label: string;
  color?: string;
}

export interface DraftStoryboardScene {
  sceneNumber: number;
  title: string;
  durationSeconds: number;
  visualPrompt: string;
  narration: string;
  dialogue: DraftDialogueLine[];
  characterActions: Array<{ characterName: string; action: string }>;
  suggestedOverlays: DraftOverlayItem[];
}

export interface DraftStoryboardResult {
  title: string;
  targetDurationSeconds: number;
  language: string;
  logline?: string;
  lesson?: string;
  metadata?: {
    topic?: string;
    audience?: string;
    ageGroup?: string;
    genre?: string;
    visualStyle?: string;
    lesson?: string;
  };
  characters: Array<{
    id?: string;
    name: string;
    species?: string;
    role?: string;
    voice?: string;
    description?: string;
  }>;
  scenes: DraftStoryboardScene[];
}

