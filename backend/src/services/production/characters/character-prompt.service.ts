import { Character, SceneWithCharacters } from './character.types.js';
import { CharacterService } from './character.service.js';

export interface ScenePromptInput {
  scene: SceneWithCharacters;
  artStyle?: string;
  camera?: string;
  lighting?: string;
  composition?: string;
}

export class CharacterPromptService {
  constructor(private characterService: CharacterService) {}

  generateCharacterDescription(character: Character): string {
    const parts: string[] = [];

    // Basic description
    parts.push(`${character.name}, a ${character.species}`);
    
    if (character.age) {
      parts.push(`(${character.age})`);
    }

    // Appearance
    parts.push(character.appearance);

    // Clothing
    if (character.clothing) {
      parts.push(`wearing ${character.clothing}`);
    }

    // Personality (affects expression/pose)
    if (character.personality) {
      parts.push(`with a ${character.personality} expression`);
    }

    // Colors for consistency
    if (character.colors && character.colors.length > 0) {
      parts.push(`color palette: ${character.colors.join(', ')}`);
    }

    return parts.join(', ');
  }

  generateScenePrompt(input: ScenePromptInput): string {
    const { scene, artStyle, camera, lighting, composition } = input;
    const parts: string[] = [];

    // Add scene description
    parts.push(`Scene ${scene.sceneNumber}: ${scene.description}`);

    // Add character descriptions
    if (scene.characters && scene.characters.length > 0) {
      const characterDescriptions = scene.characters
        .map(charId => this.characterService.getCharacter(charId))
        .filter((char): char is Character => char !== undefined)
        .map(char => this.generateCharacterDescription(char));

      if (characterDescriptions.length > 0) {
        parts.push(`Characters: ${characterDescriptions.join('. ')}`);
      }
    }

    // Art style
    const style = artStyle || '3D children\'s storybook style, Pixar-like, soft lighting, vibrant colors';
    parts.push(`Style: ${style}`);

    // Camera
    if (camera) {
      parts.push(`Camera: ${camera}`);
    }

    // Lighting
    if (lighting) {
      parts.push(`Lighting: ${lighting}`);
    }

    // Composition
    if (composition) {
      parts.push(`Composition: ${composition}`);
    }

    // Default quality and safety
    parts.push('High quality, safe for children, detailed, colorful illustration');

    return parts.join('. ');
  }
}
