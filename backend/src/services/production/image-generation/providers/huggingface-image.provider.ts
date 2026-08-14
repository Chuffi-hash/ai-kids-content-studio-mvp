import { InferenceClient } from "@huggingface/inference";
import { ImageGenerationProvider, ImageGenerationInput, ImageGenerationOutput } from '../image-generation.provider.js';
import { StorageService } from '../../../storage/storage.service.js';

export class HuggingFaceImageProvider implements ImageGenerationProvider {
  private client: InferenceClient;
  private model: string;

  constructor(
    private storageService: StorageService
  ) {
    const token = process.env.HF_TOKEN || '';
    this.model = process.env.HF_IMAGE_MODEL || 'black-forest-labs/FLUX.1-schnell';

    if (!token) {
      throw new Error('HF_TOKEN environment variable is required for HuggingFaceImageProvider');
    }

    console.log('[HuggingFaceImageProvider] Initialized with model:', this.model);
    this.client = new InferenceClient(token);
  }

  async generateImage(input: ImageGenerationInput): Promise<ImageGenerationOutput> {
    const { prompt } = input;

    console.log('[HuggingFaceImageProvider] Starting generation');
    console.log(`[HuggingFaceImageProvider] Model: ${this.model}`);
    console.log(`[HuggingFaceImageProvider] Prompt: "${prompt.substring(0, 50)}..."`);

    try {
      // Use Hugging Face Inference SDK with blob output
      const imageBlob = await this.client.textToImage({
        model: this.model,
        inputs: prompt,
      }, { outputType: "blob" });

      // Validate Blob type
      if (!imageBlob.type.startsWith('image/')) {
        throw new Error(`Invalid image content type: ${imageBlob.type}`);
      }

      // Convert Blob to Buffer
      const arrayBuffer = await imageBlob.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);

      console.log(`[HuggingFaceImageProvider] Image buffer size: ${buffer.length} bytes`);

      if (buffer.length === 0) {
        throw new Error('Empty image response from Hugging Face');
      }

      // Validate image signature
      this.validateImageSignature(buffer, imageBlob.type);
      console.log('[HuggingFaceImageProvider] Image validation successful');

      // Generate unique filename
      const filename = `scene-${Date.now()}-${Math.random().toString(36).substring(7)}.png`;

      // Save via StorageService
      const storageResult = await this.storageService.saveFile(buffer, filename, imageBlob.type);
      console.log('[HuggingFaceImageProvider] Image saved successfully');

      return { url: storageResult.url };
    } catch (error) {
      console.error('[HuggingFaceImageProvider] Generation failed');
      if (error instanceof Error) {
        console.error('[HuggingFaceImageProvider] Error name:', error.name);
        console.error('[HuggingFaceImageProvider] Error message:', error.message);
        if ('cause' in error) {
          console.error('[HuggingFaceImageProvider] Error cause:', error.cause);
        }
        if ('status' in error) {
          console.error('[HuggingFaceImageProvider] Status:', (error as any).status);
        }
        if ('response' in error) {
          console.error('[HuggingFaceImageProvider] Response:', (error as any).response);
        }

        // Handle specific error types
        if (error.message.includes('401') || error.message.includes('403')) {
          console.error('[HuggingFaceImageProvider] Authentication failed');
          throw new Error('Hugging Face authentication failed. Check HF_TOKEN.');
        }
        if (error.message.includes('429')) {
          console.error('[HuggingFaceImageProvider] Rate limit exceeded');
          throw new Error('Hugging Face rate limit exceeded. Please try again later.');
        }
        if (error.message.includes('Model') || error.message.includes('loading')) {
          console.error('[HuggingFaceImageProvider] Model unavailable or loading');
          throw new Error('Hugging Face model is unavailable or still loading. Please try again later.');
        }
        if (error.name === 'AbortError' || error.message.includes('timeout')) {
          console.error('[HuggingFaceImageProvider] Request timeout');
          throw new Error('Hugging Face request timeout');
        }

        // Preserve original error for upstream handling
        throw error;
      }
      console.error('[HuggingFaceImageProvider] Unknown error type:', error);
      throw new Error('Unknown error during Hugging Face image generation');
    }
  }

  private validateImageSignature(buffer: Buffer, contentType: string): void {
    if (contentType === 'image/png') {
      // PNG signature: 89 50 4E 47 0D 0A 1A 0A
      const pngSignature = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);
      if (buffer.length < 8 || !buffer.subarray(0, 8).equals(pngSignature)) {
        throw new Error('Invalid PNG signature in response');
      }
    } else if (contentType === 'image/jpeg') {
      // JPEG signature: FF D8 FF
      if (buffer.length < 3 || buffer[0] !== 0xFF || buffer[1] !== 0xD8 || buffer[2] !== 0xFF) {
        throw new Error('Invalid JPEG signature in response');
      }
    }
  }
}
