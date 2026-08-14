import { Scene } from '../types/story';
import { getApiUrl } from '../utils/urlHelper';

export async function generateScenes(
  storyId: string,
  story: {
    title: string;
    logline: string;
    lesson: string;
  },
  characters: Array<{
    name: string;
    species: string;
    personality: string;
    description: string;
  }>
): Promise<Scene[]> {
  const API_URL = getApiUrl();
  const response = await fetch(
    `${API_URL}/api/content/story/${storyId}/scenes/generate`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        story,
        characters,
        sceneCount: 5,
      }),
    }
  );

  if (!response.ok) {
    throw new Error('Failed to generate scenes');
  }

  const data = await response.json();
  return data.scenes;
}
