import { Character } from './character.types.js';

export class CharacterService {
  private characters: Map<string, Character> = new Map();

  constructor() {
    // Initialize with example character
    this.addCharacter({
      id: 'milo',
      name: 'Milo',
      species: 'small white rabbit',
      age: 'young',
      appearance: 'fluffy white fur, long ears, cute pink nose, expressive eyes',
      clothing: 'blue denim overalls with yellow buttons',
      personality: 'friendly, curious, adventurous',
      colors: ['white', 'blue', 'yellow'],
      artStyle: '3D children\'s storybook style, Pixar-like, soft lighting',
    });
  }

  addCharacter(character: Character): void {
    this.characters.set(character.id, character);
  }

  getCharacter(id: string): Character | undefined {
    return this.characters.get(id);
  }

  getAllCharacters(): Character[] {
    return Array.from(this.characters.values());
  }

  updateCharacter(id: string, updates: Partial<Character>): void {
    const existing = this.characters.get(id);
    if (existing) {
      this.characters.set(id, { ...existing, ...updates });
    }
  }

  deleteCharacter(id: string): void {
    this.characters.delete(id);
  }
}
