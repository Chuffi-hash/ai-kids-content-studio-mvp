import { VideoGenerationProvider, VideoGenerationInput, VideoGenerationOutput } from '../video-generation.provider.js';

export class MockVideoProvider implements VideoGenerationProvider {
  async generateVideo(input: VideoGenerationInput): Promise<VideoGenerationOutput> {
    // Simulate video generation with a short delay
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // Extract scene number from image URL if possible
    const sceneMatch = input.imageUrl.match(/Scene\+(\d+)/);
    const sceneNumber = sceneMatch ? sceneMatch[1] : '1';
    
    return {
      url: `https://placehold.co/1024x1024/10b981/white?text=Video+Scene+${sceneNumber}`,
    };
  }
}
