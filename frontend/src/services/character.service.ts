import { getApiUrl } from '../utils/urlHelper';

export interface Character {
  id: string;
  name: string;
  species: string;
  personality: string;
  visualDescription: string;
  distinctiveFeatures: string;
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

export async function deleteCharacter(id: string): Promise<void> {
  const API_URL = getApiUrl();
  const response = await fetch(`${API_URL}/api/characters/${id}`, {
    method: 'DELETE',
  });
  if (!response.ok) {
    throw new Error('Failed to delete character');
  }
}
