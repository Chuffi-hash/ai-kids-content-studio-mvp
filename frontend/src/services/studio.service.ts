const API_BASE = '/api';

export interface BackgroundAsset {
  id: string;
  name: string;
  environmentType: string;
  description: string;
  prompt: string;
  imageUrl: string;
  provider: 'google_flow' | 'gemini' | 'pollinations' | 'upload';
  aspectRatio: '16:9' | '9:16' | '1:1' | '4:5';
  width: number;
  height: number;
  tags?: string[];
  createdAt: string;
}

export interface StructuredSceneDirection {
  sceneId: string;
  sceneNumber: number;
  shotType: 'wide_establishing' | 'medium_twoshot' | 'closeup_speaker' | 'character_focus';
  backgroundImageUrl?: string;
  cameraMovement: string;
  cameraZoom?: number;
  transition: {
    type: 'fade' | 'cut';
    durationMs: number;
  };
  characterPlacements: Array<{
    instanceId: string;
    characterId: string;
    name?: string;
    x: number;
    y: number;
    scale: number;
    flipX: boolean;
    zIndex: number;
    action: string;
    expression: string;
    isSpeaker?: boolean;
  }>;
}

// Character Studio API
export async function getCharacterStudioTemplates() {
  const res = await fetch(`${API_BASE}/character-studio/templates`);
  if (!res.ok) throw new Error('Failed to fetch character templates');
  return await res.json();
}

export async function generateCharacterStudioAsset(data: {
  characterId?: string;
  type: 'main' | 'turnaround' | 'expression' | 'pose';
  character: {
    name: string;
    species?: string;
    age?: string;
    gender?: string;
    visualDescription: string;
    clothing?: string;
    artStyle?: string;
    transparentBackground?: boolean;
  };
  provider?: string;
  width?: number;
  height?: number;
}) {
  const res = await fetch(`${API_BASE}/character-studio/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || 'Generation failed');
  }
  return await res.json();
}

export async function importFlowCharacterAsset(data: {
  characterId?: string;
  characterName: string;
  assetType: 'main' | 'turnaround' | 'expression' | 'pose';
  imageBufferOrBase64: string;
  filename?: string;
  notes?: string;
}) {
  const res = await fetch(`${API_BASE}/character-studio/import-flow`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || 'Flow import failed');
  }
  return await res.json();
}

export async function uploadCharacterStudioAsset(data: {
  characterId: string;
  assetType: 'main' | 'transparent' | 'turnaround' | 'expression' | 'pose';
  base64Data: string;
  filename?: string;
}) {
  const res = await fetch(`${API_BASE}/character-studio/upload`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || 'Upload failed');
  }
  return await res.json();
}

export async function syncCharacterStudioReferences(characterId: string, data: {
  references: any;
  canonicalAppearance?: any;
}) {
  const res = await fetch(`${API_BASE}/character-studio/sync-to-character/${characterId}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || 'Failed to sync character references');
  }
  return await res.json();
}

// Background Studio API
export async function getAllBackgroundAssets(): Promise<BackgroundAsset[]> {
  const res = await fetch(`${API_BASE}/background-studio`);
  if (!res.ok) throw new Error('Failed to fetch backgrounds');
  return await res.json();
}

export async function getBackgroundStudioTemplates() {
  const res = await fetch(`${API_BASE}/background-studio/templates`);
  if (!res.ok) throw new Error('Failed to fetch background templates');
  return await res.json();
}

export async function generateBackgroundAsset(data: {
  name?: string;
  environmentType: string;
  details?: string;
  mood?: string;
  artStyle?: string;
  aspectRatio?: '16:9' | '9:16' | '1:1' | '4:5';
  provider?: string;
}) {
  const res = await fetch(`${API_BASE}/background-studio/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || 'Background generation failed');
  }
  return await res.json();
}

export async function importFlowBackgroundAsset(data: {
  name?: string;
  environmentType?: string;
  imageBufferOrBase64: string;
  filename?: string;
  notes?: string;
  aspectRatio?: '16:9' | '9:16' | '1:1' | '4:5';
}) {
  const res = await fetch(`${API_BASE}/background-studio/import-flow`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || 'Background import failed');
  }
  return await res.json();
}

export async function uploadBackgroundAsset(data: {
  name?: string;
  environmentType?: string;
  base64Data: string;
  filename?: string;
  aspectRatio?: '16:9' | '9:16' | '1:1' | '4:5';
}) {
  const res = await fetch(`${API_BASE}/background-studio/upload`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || 'Upload failed');
  }
  return await res.json();
}

// Scene Director API
export async function autoDirectStory(storyId: string, format = '16:9') {
  const res = await fetch(`${API_BASE}/scene-director/auto-direct/${storyId}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ format }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || 'Auto-direct failed');
  }
  return await res.json();
}

export async function applySceneDirection(sceneId: string, direction: StructuredSceneDirection, existingAnimationData: any) {
  const res = await fetch(`${API_BASE}/scene-director/apply/${sceneId}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ direction, existingAnimationData }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || 'Failed to apply direction');
  }
  return await res.json();
}
