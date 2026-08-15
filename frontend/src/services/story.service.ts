import { getApiUrl } from '../utils/urlHelper';

export interface Story {
  id: string;
  storyId: string;
  title: string;
  logline: string;
  lesson: string;
  audience?: string | null;
  genre?: string | null;
  visualStyle?: string | null;
  createdAt: string;
  updatedAt: string;
}

export async function getAllStories(): Promise<Story[]> {
  const API_URL = getApiUrl();
  const response = await fetch(`${API_URL}/api/content/stories`);
  
  if (!response.ok) {
    throw new Error('Failed to fetch stories');
  }
  
  return response.json();
}

export async function deleteStory(storyId: string): Promise<void> {
  const API_URL = getApiUrl();
  const response = await fetch(`${API_URL}/api/content/story/${storyId}`, {
    method: 'DELETE',
  });
  
  if (!response.ok) {
    throw new Error('Failed to delete story');
  }
}
