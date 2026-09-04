import { getApiUrl } from '../utils/urlHelper';

export interface SceneImage {
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

export interface Scene {
  id: string;
  sceneId: string;
  storyId: string;
  title: string;
  number: number;
  narration: string;
  image: SceneImage | null;
  deletedAt?: string | null;
}

export async function generateSceneImage(
  sceneId: string,
  storyId: string,
  characters: Array<{ name: string; species: string; personality: string; description: string }>
): Promise<SceneImage> {
  const API_URL = getApiUrl();
  const response = await fetch(`${API_URL}/api/content/scenes/${sceneId}/image`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      storyId,
      characters,
    }),
  });

  if (!response.ok) {
    throw new Error('Failed to generate image');
  }

  const data = await response.json();
  return {
    id: data.image.id,
    sceneId: data.image.sceneId,
    provider: data.image.provider,
    model: data.image.model || 'default',
    prompt: '',
    storageKey: '',
    imageUrl: data.image.url,
    width: data.image.width,
    height: data.image.height,
    status: 'completed',
  };
}

export async function updateScene(
  sceneId: string,
  data: {
    title?: string;
    narration?: string;
    number?: number;
  }
): Promise<Scene> {
  const API_URL = getApiUrl();
  const response = await fetch(`${API_URL}/api/content/scenes/${sceneId}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(data),
  });

  if (!response.ok) {
    throw new Error('Failed to update scene');
  }

  const updated = await response.json();
  return {
    id: updated.id,
    sceneId: updated.sceneId,
    storyId: updated.storyId,
    title: updated.title,
    number: updated.number,
    narration: updated.narration,
    image: null,
  };
}

export async function deleteScene(sceneId: string): Promise<void> {
  const API_URL = getApiUrl();
  const response = await fetch(`${API_URL}/api/content/scenes/${sceneId}`, {
    method: 'DELETE',
  });

  if (!response.ok) {
    throw new Error('Failed to delete scene');
  }
}

export async function restoreScene(sceneId: string): Promise<Scene> {
  const API_URL = getApiUrl();
  const response = await fetch(`${API_URL}/api/content/scenes/${sceneId}/restore`, {
    method: 'POST',
  });

  if (!response.ok) {
    throw new Error('Failed to restore scene');
  }

  const restored = await response.json();
  return {
    id: restored.id,
    sceneId: restored.sceneId,
    storyId: restored.storyId,
    title: restored.title,
    number: restored.number,
    narration: restored.narration,
    image: null,
    deletedAt: null,
  };
}
