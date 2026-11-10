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

export interface CharacterStudioCapabilities {
  providers: Array<{
    provider: 'gemini' | 'pollinations';
    model: string;
    supportsReferenceImage: boolean;
    supportsNegativePrompt: boolean;
    supportsCustomAspectRatio: boolean;
    notes: string;
  }>;
  directions: Array<{ key: string; label: string; description: string }>;
  actions: Array<{ key: string; label: string; description: string }>;
  expressions: Array<{ key: string; label: string; description: string }>;
  framings: Array<{ key: string; label: string; description: string }>;
  styles: Array<{ key: string; label: string; description: string }>;
  defaultNegativePrompt: string;
}

export interface CharacterAssetRecord {
  id: string;
  characterId: string;
  assetType: 'main' | 'turnaround' | 'expression' | 'pose' | 'custom';
  direction?: string;
  action?: string;
  expression?: string;
  cameraAngle?: string;
  framing?: string;
  prompt: string;
  negativePrompt?: string;
  referenceImageUrl?: string;
  referenceImageId?: string;
  provider: string;
  model: string;
  url: string;
  storagePath?: string;
  isMasterReference?: boolean;
  createdAt: string;
}

export interface CharacterGenerationPrompt {
  characterId?: string;
  characterName: string;
  characterDescription: string;
  species?: string;
  age?: string;
  gender?: string;
  direction?: string;
  action?: string;
  customAction?: string;
  expression?: string;
  customExpression?: string;
  cameraAngle?: string;
  framing?: string;
  clothingInstructions?: string;
  backgroundInstructions?: string;
  artStyle?: string;
  customInstructions?: string;
  negativePrompt?: string;
  referenceImageUrl?: string;
  referenceImageId?: string;
  generationType: 'main' | 'turnaround' | 'expression' | 'pose' | 'custom';
  customCombinedPrompt?: string;
}

// Character Studio API
export async function getCharacterStudioCapabilities(): Promise<CharacterStudioCapabilities> {
  const res = await fetch(`${API_BASE}/character-studio/capabilities`);
  if (!res.ok) throw new Error('Failed to fetch character studio capabilities');
  return await res.json();
}

export async function getCharacterStudioTemplates() {
  const res = await fetch(`${API_BASE}/character-studio/templates`);
  if (!res.ok) throw new Error('Failed to fetch character templates');
  return await res.json();
}

export async function buildCharacterStudioPrompt(promptData: CharacterGenerationPrompt): Promise<{
  success: boolean;
  prompt: string;
  negativePrompt: string;
  summary: string;
}> {
  const res = await fetch(`${API_BASE}/character-studio/build-prompt`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(promptData),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || 'Failed to construct prompt');
  }
  return await res.json();
}

export async function generateCharacterStudioAsset(data: {
  characterId?: string;
  promptData?: CharacterGenerationPrompt;
  type?: 'main' | 'turnaround' | 'expression' | 'pose' | 'custom';
  character?: {
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
  aspectRatio?: '1:1' | '9:16' | '16:9' | '4:3' | '3:4';
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

export async function createCharacterFromStudio(data: {
  name: string;
  species?: string;
  personality?: string;
  visualDescription?: string;
  clothing?: string;
  distinctiveFeatures?: string;
  artStyle?: string;
  masterReferenceUrl?: string;
  masterPrompt?: string;
}) {
  const res = await fetch(`${API_BASE}/character-studio/characters`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || 'Failed to create character');
  }
  return await res.json();
}

export async function getCharacterStudioAssets(characterId: string): Promise<{ success: boolean; assets: CharacterAssetRecord[] }> {
  const res = await fetch(`${API_BASE}/character-studio/characters/${characterId}/assets`);
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || 'Failed to fetch character assets');
  }
  return await res.json();
}

export async function saveCharacterStudioAsset(
  characterId: string,
  asset: Partial<CharacterAssetRecord> & { url: string }
): Promise<{ success: boolean; character: any; asset: CharacterAssetRecord }> {
  const res = await fetch(`${API_BASE}/character-studio/characters/${characterId}/assets`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(asset),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || 'Failed to save character asset');
  }
  return await res.json();
}

export async function setMasterReferenceAsset(characterId: string, assetId: string) {
  const res = await fetch(`${API_BASE}/character-studio/characters/${characterId}/master-reference`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ assetId }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || 'Failed to set master reference');
  }
  return await res.json();
}

export async function deleteCharacterStudioAsset(characterId: string, assetId: string, force: boolean = false) {
  const res = await fetch(`${API_BASE}/character-studio/characters/${characterId}/assets/${assetId}?force=${force}`, {
    method: 'DELETE',
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || 'Failed to delete asset');
  }
  return await res.json();
}

export async function importFlowCharacterAsset(data: {
  characterId?: string;
  characterName: string;
  assetType: 'main' | 'turnaround' | 'expression' | 'pose' | 'custom';
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
  assetType: 'main' | 'turnaround' | 'expression' | 'pose' | 'custom';
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

export async function deleteBackgroundAsset(id: string): Promise<boolean> {
  const res = await fetch(`${API_BASE}/background-studio/${id}`, {
    method: 'DELETE',
  });
  return res.ok;
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
