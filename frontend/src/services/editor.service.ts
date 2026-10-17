import { getApiUrl } from '../utils/urlHelper';
import { EditorStory, EditorScene, ExportJobStatus, SceneVersionItem } from '../types/editor';

const API_URL = getApiUrl();

export async function fetchEditorStory(storyId: string, includeDeleted = false): Promise<EditorStory> {
  const url = includeDeleted
    ? `${API_URL}/api/content/story/${storyId}?includeDeleted=true`
    : `${API_URL}/api/content/story/${storyId}`;

  const res = await fetch(url);
  if (!res.ok) {
    if (res.status === 404) throw new Error('Story not found');
    throw new Error('Failed to load story');
  }
  return res.json();
}

export async function saveStoryMetadata(
  storyId: string,
  metadata: {
    title?: string;
    logline?: string;
    lesson?: string;
    targetDuration?: number | null;
    topic?: string | null;
    ageGroup?: string | null;
    audience?: string | null;
    genre?: string | null;
    visualStyle?: string | null;
  }
): Promise<any> {
  const res = await fetch(`${API_URL}/api/content/story/${storyId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(metadata),
  });
  if (!res.ok) throw new Error('Failed to update story metadata');
  return res.json();
}

export async function regenerateStoryContent(
  storyId: string,
  payload: {
    topic: string;
    ageGroup?: string;
    desiredDurationSeconds?: number;
    language?: string;
    title?: string;
    genre?: string;
    lesson?: string;
    characterIds?: string[];
  }
): Promise<any> {
  const res = await fetch(`${API_URL}/api/content/story/${storyId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => null);
    throw new Error(err?.message || 'Failed to regenerate story');
  }
  return res.json();
}

export async function regenerateSceneContent(
  sceneId: string,
  prompt?: string
): Promise<any> {
  const res = await fetch(`${API_URL}/api/content/scenes/${sceneId}/regenerate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => null);
    throw new Error(err?.message || 'Failed to regenerate scene');
  }
  return res.json();
}

export async function fetchStoryCharacters(storyId: string): Promise<any[]> {
  const res = await fetch(`${API_URL}/api/content/story/${storyId}/characters`);
  if (!res.ok) throw new Error('Failed to fetch story characters');
  return res.json();
}

export async function linkCharacterToStory(storyId: string, characterId: string): Promise<any> {
  const res = await fetch(`${API_URL}/api/content/story/${storyId}/characters`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ characterId }),
  });
  if (!res.ok) throw new Error('Failed to link character to story');
  return res.json();
}

export async function setStoryCharacters(storyId: string, characterIds: string[]): Promise<any> {
  const res = await fetch(`${API_URL}/api/content/story/${storyId}/characters`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ characterIds }),
  });
  if (!res.ok) throw new Error('Failed to update story characters');
  return res.json();
}

export async function unlinkCharacterFromStory(storyId: string, characterId: string): Promise<any> {
  const res = await fetch(`${API_URL}/api/content/story/${storyId}/characters/${characterId}`, {
    method: 'DELETE',
  });
  if (!res.ok) throw new Error('Failed to unlink character from story');
  return res.json();
}

export async function batchSaveTimeline(storyId: string, scenes: EditorScene[]): Promise<any> {
  const payload = scenes.map((s) => ({
    sceneId: s.sceneId,
    order: s.order,
    startMs: s.startMs,
    endMs: s.endMs,
    estimatedDurationMs: s.estimatedDurationMs,
    actualAudioDurationMs: s.actualAudioDurationMs,
    title: s.title,
    narration: s.narration,
    visualPrompt: s.visualPrompt,
    cameraDirection: s.cameraDirection,
    characterIds: s.characterIds,
    imageUrl: s.imageUrl,
    videoUrl: s.videoUrl,
    audioUrl: s.audioUrl,
    generationStatus: s.generationStatus,
    animationData: s.animationData,
  }));

  const res = await fetch(`${API_URL}/api/content/story/${storyId}/scenes/timeline`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ scenes: payload }),
  });
  if (!res.ok) throw new Error('Failed to save timeline');
  return res.json();
}

export async function createScene(
  storyId: string,
  data?: {
    title?: string;
    narration?: string;
    visualPrompt?: string;
    cameraDirection?: string;
    durationMs?: number;
  }
): Promise<EditorScene> {
  const res = await fetch(`${API_URL}/api/content/story/${storyId}/scenes`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data || {}),
  });
  if (!res.ok) throw new Error('Failed to create scene');
  return res.json();
}

export async function updateScene(
  sceneId: string,
  data: Partial<EditorScene>
): Promise<EditorScene> {
  const res = await fetch(`${API_URL}/api/content/scenes/${sceneId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error('Failed to update scene');
  return res.json();
}

export async function duplicateScene(sceneId: string): Promise<EditorScene> {
  const res = await fetch(`${API_URL}/api/content/scenes/${sceneId}/duplicate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  });
  if (!res.ok) throw new Error('Failed to duplicate scene');
  return res.json();
}

export async function splitScene(sceneId: string, splitMs: number): Promise<any> {
  const res = await fetch(`${API_URL}/api/content/scenes/${sceneId}/split`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ splitMs }),
  });
  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.message || 'Failed to split scene');
  }
  return res.json();
}

export async function mergeScenes(sceneId: string, targetSceneId?: string): Promise<any> {
  const res = await fetch(`${API_URL}/api/content/scenes/${sceneId}/merge`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ targetSceneId }),
  });
  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.message || 'Failed to merge scenes');
  }
  return res.json();
}

export async function deleteScene(sceneId: string): Promise<void> {
  const res = await fetch(`${API_URL}/api/content/scenes/${sceneId}`, {
    method: 'DELETE',
  });
  if (!res.ok) throw new Error('Failed to delete scene');
}

export async function generateSceneImage(
  sceneId: string,
  storyId: string,
  characters: any[],
  promptOverride?: string
): Promise<{ url: string; imageId: string }> {
  const res = await fetch(`${API_URL}/api/content/scenes/${sceneId}/image`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      storyId,
      characters,
      prompt: promptOverride,
    }),
  });
  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.message || 'Failed to generate image');
  }
  const data = await res.json();
  return {
    url: data.image?.url || data.image?.filePath,
    imageId: data.image?.id,
  };
}

export async function generateSceneVoice(
  sceneId: string,
  narration?: string
): Promise<{ audioUrl: string; durationMs: number }> {
  const res = await fetch(`${API_URL}/api/content/scenes/${sceneId}/voice`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ narration }),
  });
  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.message || 'Failed to generate voice narration');
  }
  return res.json();
}

export async function generateSceneVideo(
  sceneId: string,
  imageUrl?: string,
  duration?: number,
  workflow: 'ffmpeg' | 'ai' = 'ffmpeg',
  prompt?: string
): Promise<{ url: string; duration: number; motionType?: string; provider?: string }> {
  const res = await fetch(`${API_URL}/api/production/scenes/${sceneId}/video`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ imageUrl, duration, workflow, prompt }),
  });
  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.message || 'Failed to generate scene video');
  }
  const data = await res.json();
  return {
    url: data.video?.url,
    duration: data.video?.duration,
    motionType: data.video?.motionType,
    provider: data.video?.provider,
  };
}


export async function startExport(
  storyId: string,
  options?: {
    resolution?: '1080p' | '720p';
    fps?: number;
    backgroundMusic?: string | null;
    musicVolume?: number;
  }
): Promise<{ job: ExportJobStatus }> {
  const res = await fetch(`${API_URL}/api/production/story/${storyId}/export`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(options || {}),
  });
  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.message || 'Failed to start export');
  }
  return res.json();
}

export async function pollExportStatus(jobId: string): Promise<ExportJobStatus> {
  const res = await fetch(`${API_URL}/api/production/export/${jobId}`);
  if (!res.ok) throw new Error('Failed to get export job status');
  return res.json();
}

export async function getSceneVersions(sceneId: string): Promise<SceneVersionItem[]> {
  const res = await fetch(`${API_URL}/api/content/scenes/${sceneId}/versions`);
  if (!res.ok) throw new Error('Failed to get scene versions');
  return res.json();
}

export async function restoreSceneVersion(sceneId: string, versionId: string): Promise<any> {
  const res = await fetch(`${API_URL}/api/content/scenes/${sceneId}/versions/${versionId}/restore`, {
    method: 'POST',
  });
  if (!res.ok) throw new Error('Failed to restore scene version');
  return res.json();
}

export async function removeSceneVoice(sceneId: string): Promise<any> {
  const res = await fetch(`${API_URL}/api/content/scenes/${sceneId}/voice`, {
    method: 'DELETE',
  });
  if (!res.ok) throw new Error('Failed to remove voice narration');
  return res.json();
}

export async function uploadAudioFile(
  file: File,
  category: 'music' | 'narration' | 'sfx' = 'music'
): Promise<{ url: string; filename: string; durationMs: number; name: string }> {
  const base64Data = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      const base64 = result.split(',')[1] || result;
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });

  const res = await fetch(`${API_URL}/api/content/audio/upload`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      filename: file.name,
      fileData: base64Data,
      category,
    }),
  });

  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.message || 'Failed to upload audio file');
  }

  const data = await res.json();
  return data.audio;
}

export interface MusicTrackInfo {
  id: string;
  label: string;
  url?: string;
  durationMs?: number;
  isCustom?: boolean;
  isPreset?: boolean;
}

export async function fetchMusicTracks(): Promise<MusicTrackInfo[]> {
  const res = await fetch(`${API_URL}/api/content/music/tracks`);
  if (!res.ok) throw new Error('Failed to fetch music tracks');
  return res.json();
}


