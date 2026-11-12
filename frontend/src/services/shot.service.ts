import { getApiUrl } from '../utils/urlHelper';
import { CinematicShot } from '../types/editor';

const API_URL = getApiUrl();

export async function planShotsForStory(
  storyId: string,
  forceRegenerate: boolean = false
): Promise<{ success: boolean; count: number; shots: CinematicShot[] }> {
  const res = await fetch(`${API_URL}/api/shots/story/${storyId}/plan`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ forceRegenerate }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Failed to plan cinematic shots');
  }
  return res.json();
}

export async function fetchShotsForStory(
  storyId: string
): Promise<{ success: boolean; count: number; shots: CinematicShot[] }> {
  const res = await fetch(`${API_URL}/api/shots/story/${storyId}`);
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Failed to fetch shots for story');
  }
  return res.json();
}

export async function fetchShotsForScene(
  sceneId: string
): Promise<{ success: boolean; count: number; shots: CinematicShot[] }> {
  const res = await fetch(`${API_URL}/api/shots/scene/${sceneId}`);
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Failed to fetch shots for scene');
  }
  return res.json();
}

export async function updateShotData(
  shotId: string,
  updates: Partial<CinematicShot>
): Promise<{ success: boolean; shot: CinematicShot }> {
  const res = await fetch(`${API_URL}/api/shots/${shotId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(updates),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Failed to update shot');
  }
  return res.json();
}

export async function regenerateShotPrompt(
  shotId: string,
  type: 'background' | 'video' | 'both',
  instructions?: string
): Promise<{ success: boolean; shot: CinematicShot }> {
  const res = await fetch(`${API_URL}/api/shots/${shotId}/regenerate-prompt`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ type, instructions }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Failed to regenerate prompt');
  }
  return res.json();
}

export async function approveShotPrompt(
  shotId: string
): Promise<{ success: boolean; shot: CinematicShot }> {
  const res = await fetch(`${API_URL}/api/shots/${shotId}/approve`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Failed to approve shot');
  }
  return res.json();
}

export async function associateShotAsset(
  shotId: string,
  asset: { type: 'image' | 'video'; url: string }
): Promise<{ success: boolean; shot: CinematicShot }> {
  const res = await fetch(`${API_URL}/api/shots/${shotId}/asset`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(asset),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Failed to associate asset');
  }
  return res.json();
}

export async function deleteShotRecord(shotId: string): Promise<{ success: boolean }> {
  const res = await fetch(`${API_URL}/api/shots/${shotId}`, {
    method: 'DELETE',
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Failed to delete shot');
  }
  return res.json();
}
