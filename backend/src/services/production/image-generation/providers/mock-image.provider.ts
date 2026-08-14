import { ImageGenerationProvider, ImageGenerationInput, ImageGenerationOutput } from '../image-generation.provider.js';

export class MockImageProvider implements ImageGenerationProvider {
  async generateImage(input: ImageGenerationInput): Promise<ImageGenerationOutput> {
    // Extract scene number from prompt if possible, otherwise use default
    const sceneMatch = input.prompt.match(/scene\s*(\d+)/i);
    const sceneNumber = sceneMatch ? sceneMatch[1] : '1';
    
    const width = input.width || 1024;
    const height = input.height || 1024;
    
    return {
      url: `https://placehold.co/${width}x${height}/3b82f6/white?text=Scene+${sceneNumber}`,
    };
  }
}
