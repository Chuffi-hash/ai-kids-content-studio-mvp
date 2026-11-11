import {
  ImageGenerationProvider,
  ImageGenerationInput,
  ImageGenerationOutput,
} from '../image-generation.provider.js';
import { StorageService } from '../../../storage/storage.service.js';
import { GeminiImageProvider as CoreGeminiProvider } from '../../../image-generation/providers/gemini-image.provider.js';

export class GeminiImageProvider implements ImageGenerationProvider {
  private coreProvider: CoreGeminiProvider;

  constructor(private storageService: StorageService) {
    this.coreProvider = new CoreGeminiProvider();
  }

  async generateImage(
    input: ImageGenerationInput
  ): Promise<ImageGenerationOutput> {
    const { prompt, negativePrompt, width = 1024, height = 1024 } = input;

    // Convert dimensions to standard aspect ratio for Gemini/Imagen
    let aspectRatio: '1:1' | '16:9' | '9:16' | '4:3' | '3:4' | '4:5' = '1:1';
    const ratio = width / height;
    if (ratio >= 1.5) {
      aspectRatio = '16:9';
    } else if (ratio <= 0.65) {
      aspectRatio = '9:16';
    } else if (ratio > 1.1) {
      aspectRatio = '4:3';
    } else if (ratio < 0.9) {
      aspectRatio = '3:4';
    }

    const result = await this.coreProvider.generateImage({
      prompt,
      negativePrompt,
      width,
      height,
      aspectRatio,
    });

    const ext = result.mimeType.includes('png') ? 'png' : 'jpg';
    const filename = `gemini-prod-${Date.now()}-${Math.random().toString(36).substring(2, 8)}.${ext}`;

    const saved = await this.storageService.saveFile(
      result.imageBuffer,
      filename,
      result.mimeType
    );

    return {
      url: saved.url,
    };
  }
}
