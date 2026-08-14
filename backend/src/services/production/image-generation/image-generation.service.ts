import { ImageGenerationProvider, ImageGenerationInput, ImageGenerationOutput } from './image-generation.provider.js';
import { StorageService } from '../../storage/storage.service.js';

export class ImageGenerationService {
  constructor(
    private provider: ImageGenerationProvider,
    private storageService: StorageService
  ) {}

  async generateSceneImage(input: ImageGenerationInput): Promise<ImageGenerationOutput> {
    try {
      // Generate image using provider
      const providerResult = await this.provider.generateImage(input);

      // If provider already returned a storage URL (e.g., HuggingFace provider saves directly), return it
      if (providerResult.url.startsWith('/storage/')) {
        return providerResult;
      }

      // Download the generated image
      const { buffer, contentType } = await this.downloadImage(providerResult.url);

      // Determine file extension from content type
      const extension = this.getExtensionFromContentType(contentType);

      // Generate unique filename
      const filename = `scene-${Date.now()}-${Math.random().toString(36).substring(7)}.${extension}`;

      // Store the image permanently
      const storageResult = await this.storageService.saveFile(buffer, filename, contentType);

      return { url: storageResult.url };
    } catch (error) {
      console.error('[ImageGenerationService] Image generation failed');
      if (error instanceof Error) {
        console.error('[ImageGenerationService] Error name:', error.name);
        console.error('[ImageGenerationService] Error message:', error.message);
        if ('cause' in error) {
          console.error('[ImageGenerationService] Error cause:', error.cause);
        }
        // Preserve original error for upstream handling
        throw error;
      }
      console.error('[ImageGenerationService] Unknown error type:', error);
      throw new Error('Unknown error during image generation');
    }
  }

  private async downloadImage(url: string): Promise<{ buffer: Buffer; contentType: string }> {
    // Handle internal:// URLs (binary data from providers like HuggingFace)
    if (url.startsWith('internal://')) {
      const parts = url.replace('internal://', '').split('/');
      const contentType = parts[0];
      const base64Data = parts[1];
      return {
        buffer: Buffer.from(base64Data, 'base64'),
        contentType,
      };
    }

    // Handle data URLs (e.g., from MockImageProvider)
    if (url.startsWith('data:')) {
      const match = url.match(/^data:(image\/[a-z]+);base64,(.+)$/);
      if (match) {
        return {
          buffer: Buffer.from(match[2], 'base64'),
          contentType: match[1],
        };
      }
      // Fallback for simple data URLs without explicit content type
      const base64Data = url.split(',')[1];
      return {
        buffer: Buffer.from(base64Data, 'base64'),
        contentType: 'image/png',
      };
    }

    // Handle regular HTTP URLs
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to download image: ${response.statusText}`);
    }
    const contentType = response.headers.get('content-type') || 'image/png';
    const arrayBuffer = await response.arrayBuffer();
    return {
      buffer: Buffer.from(arrayBuffer),
      contentType,
    };
  }

  private getExtensionFromContentType(contentType: string): string {
    switch (contentType) {
      case 'image/jpeg':
      case 'image/jpg':
        return 'jpg';
      case 'image/png':
      default:
        return 'png';
    }
  }
}
