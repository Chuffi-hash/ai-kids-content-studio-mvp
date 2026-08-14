import { ImageGenerationProvider } from './image/provider.interface.js';
import { ComfyUIProvider } from './image/comfyui.provider.js';
import { MockImageProvider } from './image/mock.provider.js';

export interface GenerateSceneImageInput {
  sceneId: string;
  sceneNumber: number;
  sceneDescription: string;
  sceneTitle: string;
  characters?: string[];
  storyContext?: string;
}

export interface GenerateSceneImageOutput {
  imageUrl: string;
}

// Select provider based on environment variable
const comfyUIUrl = process.env.COMFYUI_URL;
const useComfyUI = comfyUIUrl && comfyUIUrl !== 'http://127.0.0.1:8188';
const imageProvider: ImageGenerationProvider = useComfyUI && comfyUIUrl
  ? new ComfyUIProvider(comfyUIUrl)
  : new MockImageProvider();

function buildImagePrompt(input: GenerateSceneImageInput): string {
  const parts: string[] = [];
  
  // Add scene title
  parts.push(`Scene ${input.sceneNumber}: ${input.sceneTitle}`);
  
  // Add description
  parts.push(input.sceneDescription);
  
  // Add characters if available
  if (input.characters && input.characters.length > 0) {
    parts.push(`Characters: ${input.characters.join(', ')}`);
  }
  
  // Add story context if available
  if (input.storyContext) {
    parts.push(`Story context: ${input.storyContext}`);
  }
  
  // Add style guidance for children's content
  parts.push('Style: Colorful, friendly, children\'s book illustration, safe for kids, high quality');
  
  return parts.join('. ');
}

export async function generateSceneImage(
  input: GenerateSceneImageInput
): Promise<GenerateSceneImageOutput> {
  const prompt = buildImagePrompt(input);
  
  try {
    const imageUrl = await imageProvider.generateImage(prompt);
    
    return {
      imageUrl,
    };
  } catch (error) {
    console.error('Image generation failed:', error);
    // Fallback to mock on error
    const fallbackProvider = new MockImageProvider();
    const fallbackUrl = await fallbackProvider.generateImage(prompt);
    
    return {
      imageUrl: fallbackUrl,
    };
  }
}
