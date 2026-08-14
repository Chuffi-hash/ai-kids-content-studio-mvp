export type ProductionStatus = 'pending' | 'queued' | 'generating' | 'completed' | 'failed';

export interface ProductionTrack {
  status: ProductionStatus;
  url?: string;
}

export interface ProductionScene {
  sceneId: string;
  sceneNumber: number;
  title: string;
  description: string;
  narration?: string;
  image: ProductionTrack;
  voice: ProductionTrack;
  animation: ProductionTrack;
  video: ProductionTrack;
}

export interface ProductionState {
  storyId: string;
  storyTitle: string;
  storyLogline?: string;
  storyLesson?: string;
  currentStage: 'story' | 'scenes' | 'images' | 'voice' | 'animation' | 'assembly' | 'complete';
  scenes: ProductionScene[];
}
