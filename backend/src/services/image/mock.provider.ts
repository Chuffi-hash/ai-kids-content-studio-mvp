import { ImageGenerationProvider } from './provider.interface.js';

export class MockImageProvider implements ImageGenerationProvider {
  async generateImage(prompt: string): Promise<string> {
    // Extract scene number from prompt if possible, otherwise use default
    const sceneMatch = prompt.match(/scene\s*(\d+)/i);
    const sceneNumber = sceneMatch ? sceneMatch[1] : '1';
    
    return `https://placehold.co/1024x1024/3b82f6/white?text=Scene+${sceneNumber}`;
  }
}
