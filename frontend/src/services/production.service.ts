import { getApiUrl } from '../utils/urlHelper';

export async function generateSceneImage(
  sceneId: string,
  sceneNumber: number,
  sceneDescription: string,
  sceneTitle: string,
  sceneNarration?: string,
  storyId?: string,
  storyTitle?: string,
  storyLogline?: string,
  storyLesson?: string
): Promise<{ imageUrl: string }> {
  const API_URL = getApiUrl();
  const response = await fetch(
    `${API_URL}/api/production/scenes/${sceneId}/image`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        sceneNumber,
        sceneDescription,
        sceneTitle,
        sceneNarration,
        storyId,
        storyTitle,
        storyLogline,
        storyLesson,
      }),
    }
  );

  if (!response.ok) {
    throw new Error('Failed to generate image');
  }

  const data = await response.json();
  return {
    imageUrl: data.image.url,
  };
}
