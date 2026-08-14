export interface ImageGenerationProvider {
  generateImage(options: {
    prompt: string;
    width?: number;
    height?: number;
  }): Promise<{
    imageBuffer: Buffer;
    mimeType: string;
  }>;
}
