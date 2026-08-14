import { ImageGenerationProvider } from './image-generation.provider.js';

export class ImageGenerationService {
  constructor(private provider: ImageGenerationProvider) {}

  async generateSceneImage(options: {
    prompt: string;
    width?: number;
    height?: number;
  }): Promise<{
    imageBuffer: Buffer;
    mimeType: string;
  }> {
    return await this.provider.generateImage(options);
  }
}
