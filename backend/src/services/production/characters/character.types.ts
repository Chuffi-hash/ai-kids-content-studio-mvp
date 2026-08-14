export interface Character {
  id: string;
  name: string;
  species: string;
  age?: string;
  appearance: string;
  clothing?: string;
  personality?: string;
  colors?: string[];
  artStyle?: string;
}

export interface SceneWithCharacters {
  sceneNumber: number;
  description: string;
  characters: string[];
}
