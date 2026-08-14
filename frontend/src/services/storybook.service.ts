import { getApiUrl } from '../utils/urlHelper';

export interface StorybookImage {
  id: string;
  sceneId: string;
  provider: string;
  model: string;
  prompt: string;
  storageKey: string;
  imageUrl: string;
  width: number;
  height: number;
  status: 'completed' | 'generating' | 'pending' | 'failed';
}

export interface StorybookScene {
  id: string;
  sceneId: string;
  storyId: string;
  title: string;
  number: number;
  narration: string;
  image: StorybookImage | null;
}

export interface StorybookStory {
  id: string;
  storyId: string;
  title: string;
  logline: string;
  lesson: string;
  scenes: StorybookScene[];
}

export async function fetchStory(storyId: string): Promise<StorybookStory> {
  const API_URL = getApiUrl();
  const response = await fetch(`${API_URL}/api/content/story/${storyId}`);

  if (!response.ok) {
    if (response.status === 404) {
      throw new Error('Story not found');
    }
    throw new Error('Failed to fetch story');
  }

  return response.json();
}
