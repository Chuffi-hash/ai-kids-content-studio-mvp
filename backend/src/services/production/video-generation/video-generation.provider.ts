export interface VideoGenerationInput {
  imageUrl?: string;
  prompt?: string;
  duration?: number;
  audioUrl?: string;
  cameraDirection?: string;
  resolution?: string;
  fps?: number;
  workflow?: 'ffmpeg' | 'ai';
  characterReferences?: string[];
}

export interface VideoGenerationOutput {
  url: string;
  duration?: number;
  motionType?: 'ken-burns' | 'ai-motion';
  provider?: string;
}

export interface VideoGenerationProvider {
  generateVideo(input: VideoGenerationInput): Promise<VideoGenerationOutput>;
}

