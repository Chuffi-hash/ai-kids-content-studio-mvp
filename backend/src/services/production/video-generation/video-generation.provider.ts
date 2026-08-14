export interface VideoGenerationInput {
  imageUrl: string;
  prompt?: string;
  duration?: number;
}

export interface VideoGenerationOutput {
  url: string;
}

export interface VideoGenerationProvider {
  generateVideo(input: VideoGenerationInput): Promise<VideoGenerationOutput>;
}
