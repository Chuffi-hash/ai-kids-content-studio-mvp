import { ImageGenerationProvider, ImageGenerationInput, ImageGenerationOutput } from '../image-generation.provider.js';

export class HostedImageProvider implements ImageGenerationProvider {
  private apiUrl: string;
  private apiKey: string;

  constructor() {
    this.apiUrl = process.env.IMAGE_API_URL || '';
    this.apiKey = process.env.IMAGE_API_KEY || '';

    if (!this.apiUrl) {
      throw new Error('IMAGE_API_URL environment variable is required for HostedImageProvider');
    }
    if (!this.apiKey) {
      throw new Error('IMAGE_API_KEY environment variable is required for HostedImageProvider');
    }
  }

  async generateImage(input: ImageGenerationInput): Promise<ImageGenerationOutput> {
    const { prompt, negativePrompt, width = 1024, height = 1024, seed } = input;

    console.log(`[HostedImageProvider] Generating image with prompt: "${prompt.substring(0, 50)}..."`);

    try {
      const response = await fetch(this.apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          prompt,
          negative_prompt: negativePrompt,
          width,
          height,
          seed,
        }),
        signal: AbortSignal.timeout(60000), // 60 second timeout
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`[HostedImageProvider] API error: ${response.status} - ${errorText}`);
        throw new Error(`Image generation API error: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();

      if (!data.url) {
        console.error('[HostedImageProvider] Invalid response: missing URL');
        throw new Error('Invalid response from image generation API: missing URL');
      }

      console.log(`[HostedImageProvider] Image generated successfully`);
      return { url: data.url };
    } catch (error) {
      if (error instanceof Error) {
        if (error.name === 'AbortError') {
          console.error('[HostedImageProvider] Request timeout');
          throw new Error('Image generation request timeout');
        }
        console.error(`[HostedImageProvider] Generation failed: ${error.message}`);
        throw error;
      }
      console.error('[HostedImageProvider] Unknown error');
      throw new Error('Unknown error during image generation');
    }
  }
}
