import { ImageGenerationProvider } from '../image-generation.provider.js';

export class MockImageProvider implements ImageGenerationProvider {
  async generateImage(options: {
    prompt: string;
    width?: number;
    height?: number;
  }): Promise<{
    imageBuffer: Buffer;
    mimeType: string;
  }> {
    const { prompt, width = 1024, height = 576 } = options;

    // Extract scene number from prompt if possible, otherwise use default
    const sceneMatch = prompt.match(/scene\s*(\d+)/i);
    const sceneNumber = sceneMatch ? sceneMatch[1] : '1';

    // For mock, we'll create a simple SVG as a buffer
    const svg = `
      <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
        <rect width="100%" height="100%" fill="#3b82f6"/>
        <text x="50%" y="50%" font-family="Arial" font-size="48" fill="white" text-anchor="middle" dominant-baseline="middle">
          Scene ${sceneNumber}
        </text>
      </svg>
    `;

    const buffer = Buffer.from(svg, 'utf-8');

    return {
      imageBuffer: buffer,
      mimeType: 'image/svg+xml',
    };
  }
}
