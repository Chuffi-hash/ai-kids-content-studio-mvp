export interface Character {
  name: string;
  species: string;
  personality: string;
  description: string;
}

export interface Scene {
  sceneNumber: number;
  title: string;
  description: string;
  narration: string;
}

export interface Story {
  id: string;
  title: string;
  logline: string;
  lesson: string;
  characters: Character[];
}
