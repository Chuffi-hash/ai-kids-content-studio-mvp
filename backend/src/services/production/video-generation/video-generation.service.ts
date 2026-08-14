import { VideoGenerationProvider, VideoGenerationInput, VideoGenerationOutput } from './video-generation.provider.js';

export class VideoGenerationService {
  constructor(private provider: VideoGenerationProvider) {}

  async generateSceneVideo(input: VideoGenerationInput): Promise<VideoGenerationOutput> {
    return await this.provider.generateVideo(input);
  }
}
