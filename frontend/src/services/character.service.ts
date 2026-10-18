import { getApiUrl } from '../utils/urlHelper';
import { CharacterVoiceConfig } from '../types/animation';

export interface Character {
  id: string;
  name: string;
  species: string;
  personality: string;
  visualDescription: string;
  distinctiveFeatures: string;
  canonicalAppearance?: any;
  referenceImageUrl?: string;
  referenceImagePrompt?: string;
  createdAt: string;
  updatedAt: string;
}

export async function getAllCharacters(): Promise<Character[]> {
  const API_URL = getApiUrl();
  const response = await fetch(`${API_URL}/api/characters`);
  if (!response.ok) {
    throw new Error('Failed to fetch characters');
  }
  return response.json();
}

export async function getCharacterById(id: string): Promise<Character> {
  const API_URL = getApiUrl();
  const response = await fetch(`${API_URL}/api/characters/${id}`);
  if (!response.ok) {
    throw new Error('Failed to fetch character');
  }
  return response.json();
}

export async function createCharacter(data: {
  name: string;
  species: string;
  personality: string;
  visualDescription: string;
  distinctiveFeatures?: string;
  canonicalAppearance?: any;
}): Promise<Character> {
  const API_URL = getApiUrl();
  const response = await fetch(`${API_URL}/api/characters`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(data),
  });
  if (!response.ok) {
    throw new Error('Failed to create character');
  }
  return response.json();
}

export async function updateCharacter(
  id: string,
  data: {
    name?: string;
    species?: string;
    personality?: string;
    visualDescription?: string;
    distinctiveFeatures?: string;
    canonicalAppearance?: any;
  }
): Promise<Character> {
  const API_URL = getApiUrl();
  const response = await fetch(`${API_URL}/api/characters/${id}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(data),
  });
  if (!response.ok) {
    throw new Error('Failed to update character');
  }
  return response.json();
}

export async function duplicateCharacter(id: string): Promise<Character> {
  const API_URL = getApiUrl();
  const response = await fetch(`${API_URL}/api/characters/${id}/duplicate`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
  });
  if (!response.ok) {
    throw new Error('Failed to duplicate character');
  }
  return response.json();
}

export async function deleteCharacter(id: string): Promise<void> {
  const API_URL = getApiUrl();
  const response = await fetch(`${API_URL}/api/characters/${id}`, {
    method: 'DELETE',
  });
  if (!response.ok) {
    throw new Error('Failed to delete character');
  }
}

export async function generateCharacterReferenceImage(id: string): Promise<{
  success: boolean;
  referenceImageUrl: string;
  referenceImagePrompt: string;
}> {
  const API_URL = getApiUrl();
  const response = await fetch(`${API_URL}/api/characters/${id}/reference-image`, {
    method: 'POST',
  });
  if (!response.ok) {
    throw new Error('Failed to generate character reference image');
  }
  return response.json();
}

export async function getCharacterVoice(id: string): Promise<{
  characterId: string;
  name: string;
  voiceConfig: CharacterVoiceConfig;
}> {
  const API_URL = getApiUrl();
  const response = await fetch(`${API_URL}/api/characters/${id}/voice`);
  if (!response.ok) {
    throw new Error('Failed to fetch character voice');
  }
  return response.json();
}

export async function updateCharacterVoice(
  id: string,
  voiceConfig: CharacterVoiceConfig
): Promise<{
  success: boolean;
  characterId: string;
  voiceConfig: CharacterVoiceConfig;
  character: Character;
}> {
  const API_URL = getApiUrl();
  const response = await fetch(`${API_URL}/api/characters/${id}/voice`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(voiceConfig),
  });
  if (!response.ok) {
    throw new Error('Failed to update character voice');
  }
  return response.json();
}
