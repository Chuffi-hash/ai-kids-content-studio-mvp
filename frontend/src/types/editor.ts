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

export interface PromptVersionRecord {
  version: number;
  backgroundPrompt: string;
  videoPrompt: string;
  createdAt: string;
  approved?: boolean;
  notes?: string;
}

export interface CinematicShot {
  shotId: string;
  sceneId: string;
  storyId: string;
  number: number;
  order: number;
  title: string;
  description: string;
  durationMs: number;
  shotType: string;
  cameraAngle: string;
  cameraMovement: string;
  lighting?: string;
  composition?: {
    foreground?: string;
    middleground?: string;
    background?: string;
    depthOfField?: string;
    characterPlacementZone?: string;
  };
  characterPlacements?: Array<{
    instanceId: string;
    characterId: string;
    name?: string;
    x: number;
    y: number;
    scale: number;
    flipX: boolean;
    zIndex?: number;
    action?: string;
    expression?: string;
    isSpeaker?: boolean;
  }>;
  requiredProps?: string[];
  requiredEffects?: string[];
  startMs: number;
  endMs: number;
  transition?: {
    type: 'fade' | 'cut';
    durationMs: number;
  };
  backgroundPrompt: string;
  videoPrompt: string;
  promptHistory: PromptVersionRecord[];
  backgroundUrl?: string | null;
  videoUrl?: string | null;
  assetStatus: 'pending' | 'generating' | 'imported' | 'approved';
  approvalStatus: 'pending' | 'approved' | 'rejected';
  productionStatus: 'draft' | 'ready' | 'completed';
}

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
  flowProjectId?: string | null;
  originalScript?: string | null;
  productionStage?: string | null;
  shots?: CinematicShot[];
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
  renderer?: 'ffmpeg' | 'remotion';
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

export interface ScriptWarning {
  code: string;
  message: string;
  line: number;
  column?: number;
  severity: 'info' | 'warning' | 'error';
  suggestion?: string;
  sourceContext?: string;
}

export interface DraftStoryboardScene {
  sceneNumber: number;
  title: string;
  durationSeconds: number;
  visualPrompt: string;
  narration: string;
  dialogue: DraftDialogueLine[];
  characterActions: Array<{ characterName: string; action: string; description?: string }>;
  suggestedOverlays: DraftOverlayItem[];
  breakdown?: any;
  shots?: any[];
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
  look?: any;
  warnings?: ScriptWarning[];
}

