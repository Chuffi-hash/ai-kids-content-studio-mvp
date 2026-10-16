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

