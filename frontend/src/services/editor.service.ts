import { getApiUrl } from '../utils/urlHelper';
import {
  EditorStory,
  EditorScene,
  ExportJobStatus,
  SceneVersionItem,
  DraftStoryboardResult,
  DraftStoryboardScene,
} from '../types/editor';
import { SceneDialogue } from '../types/animation';

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

export interface GenerateSceneImageOptions {
  cameraDirection?: string;
  cameraMovement?: string;
  aspectRatio?: string;
  visualStyle?: string;
  projectLook?: any;
  fit?: 'cover' | 'contain';
  previewOnly?: boolean;
}

export async function generateSceneImage(
  sceneId: string,
  storyId: string,
  characters: any[],
  promptOverride?: string,
  options?: GenerateSceneImageOptions
): Promise<{ url: string; imageId: string; prompt?: string; image?: any; scene?: any }> {
  const res = await fetch(`${API_URL}/api/content/scenes/${sceneId}/image`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      storyId,
      characters,
      prompt: promptOverride,
      cameraDirection: options?.cameraDirection,
      cameraMovement: options?.cameraMovement,
      aspectRatio: options?.aspectRatio,
      visualStyle: options?.visualStyle,
      projectLook: options?.projectLook,
      fit: options?.fit,
      previewOnly: options?.previewOnly,
    }),
  });
  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.message || 'Failed to generate image');
  }
  const data = await res.json();
  return {
    url: data.imageUrl || data.image?.url || data.image?.filePath,
    imageId: data.image?.id,
    prompt: data.prompt || data.image?.prompt,
    image: data.image,
    scene: data.scene,
  };
}

export interface SupportedVoice {
  id: string;
  name: string;
  gender: 'female' | 'male' | 'neutral';
  lang: string;
  accent?: string;
  grade?: string;
  description?: string;
}

export interface TTSVoicesResponse {
  activeProvider: string;
  isKokoroAvailable: boolean;
  isFishAudioAvailable?: boolean;
  voices: SupportedVoice[];
  fishAudioVoices?: SupportedVoice[];
  effects: Array<{ id: string; name: string; description: string }>;
  providers?: Array<{ id: string; name: string; available: boolean; model?: string; isFree?: boolean }>;
}

export async function getTTSVoices(provider?: string): Promise<TTSVoicesResponse> {
  const url = provider
    ? `${API_URL}/api/content/tts/voices?provider=${encodeURIComponent(provider)}`
    : `${API_URL}/api/content/tts/voices`;
  const res = await fetch(url);
  if (!res.ok) throw new Error('Failed to load voices catalogue');
  return res.json();
}

export async function previewVoice(options: {
  voice: string;
  provider?: string;
  speed?: number;
  effect?: 'normal' | 'robot' | 'cartoon' | 'whisper' | 'shout';
  sampleText?: string;
  lang?: string;
  emotion?: string;
  emotionIntensity?: number;
}): Promise<{ audioUrl: string; durationMs: number; voice: string; effect: string; emotion?: string; emotionIntensity?: number }> {
  const res = await fetch(`${API_URL}/api/content/tts/preview`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(options),
  });
  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.message || 'Failed to preview voice');
  }
  return res.json();
}

export async function suggestEmotion(text: string): Promise<{
  emotion: string;
  facialExpression: string;
  confidence: number;
  rationale: string;
}> {
  const res = await fetch(`${API_URL}/api/content/suggest-emotion`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text }),
  });
  if (!res.ok) throw new Error('Failed to suggest emotion');
  const data = await res.json();
  return data.suggestion;
}

export async function generateSceneVoice(
  sceneId: string,
  narration?: string,
  options?: {
    provider?: string;
    voice?: string;
    speed?: number;
    effect?: 'normal' | 'robot' | 'cartoon' | 'whisper' | 'shout';
    lang?: string;
    emotion?: string;
    emotionIntensity?: number;
  }
): Promise<{
  audioUrl: string;
  durationMs: number;
  provider?: string;
  voice?: string;
  effect?: string;
  emotion?: string;
  emotionIntensity?: number;
}> {
  const res = await fetch(`${API_URL}/api/content/scenes/${sceneId}/voice`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      narration,
      ...options,
    }),
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
    format?: '16:9' | '9:16' | '1:1' | '4:5' | 'custom';
    selectedSceneIds?: string[];
    targetDurationSec?: number;
    renderer?: 'ffmpeg' | 'remotion';
    templateId?: 'kids-story' | 'moral-story' | 'educational' | 'nursery-learning' | 'intro-outro';
    subtitleTheme?: 'classic' | 'karaoke' | 'speech-bubble' | 'minimal';
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

export async function importStory(data: {
  rawText: string;
  title?: string;
  language?: string;
  genre?: string;
  visualStyle?: string;
  topic?: string;
  ageGroup?: string;
  format?: string;
}): Promise<any> {
  const res = await fetch(`${API_URL}/api/content/story/import`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.message || 'Failed to import story');
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

export interface SceneBackgroundResult {
  success: boolean;
  sceneId: string;
  background?: {
    imageUrl: string;
    fit: 'cover' | 'contain';
  };
  scene?: EditorScene;
  message?: string;
}

export interface StoryBackgroundImage {
  imageUrl: string;
  sceneId: string;
  sceneTitle: string;
  sceneNumber?: number;
  prompt?: string;
  createdAt?: string;
}

/**
 * Uploads a local PNG/JPEG/WebP file to serve as a scene background.
 */
export async function uploadSceneBackground(
  sceneId: string,
  file: File,
  fit: 'cover' | 'contain' = 'cover',
  source: 'imported' | 'google_flow_manual' | string = 'imported',
  prompt?: string
): Promise<SceneBackgroundResult> {
  const validTypes = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp'];
  if (!validTypes.includes(file.type.toLowerCase())) {
    throw new Error('Only PNG, JPEG, and WebP image formats are supported');
  }
  const MAX_SIZE = 15 * 1024 * 1024; // 15MB limit
  if (file.size > MAX_SIZE) {
    throw new Error(`File size exceeds 15MB limit (${(file.size / (1024 * 1024)).toFixed(1)}MB)`);
  }

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

  const res = await fetch(`${API_URL}/api/content/scenes/${sceneId}/background/upload`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      filename: file.name,
      fileData: base64Data,
      fit,
      source,
      prompt,
    }),
  });

  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.message || 'Failed to upload background image');
  }

  return res.json();
}

/**
 * Assigns an existing image URL or updates fit mode for a scene background.
 */
export async function setSceneBackground(
  sceneId: string,
  imageUrl: string,
  fit: 'cover' | 'contain' = 'cover',
  meta?: {
    source?: 'ai_generated' | 'imported';
    prompt?: string;
    cameraDirection?: string;
    aspectRatio?: string;
    dimensions?: { width: number; height: number };
  }
): Promise<SceneBackgroundResult> {
  const res = await fetch(`${API_URL}/api/content/scenes/${sceneId}/background`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      imageUrl,
      fit,
      ...meta,
    }),
  });

  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.message || 'Failed to set scene background');
  }

  return res.json();
}

/**
 * Updates fit mode ('cover' or 'contain') for the active scene background.
 */
export async function updateBackgroundFit(
  sceneId: string,
  fit: 'cover' | 'contain'
): Promise<SceneBackgroundResult> {
  const res = await fetch(`${API_URL}/api/content/scenes/${sceneId}/background`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ fit }),
  });

  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.message || 'Failed to update background fit mode');
  }

  return res.json();
}

/**
 * Removes the scene background and restores the default stylized stage.
 */
export async function removeSceneBackground(sceneId: string): Promise<SceneBackgroundResult> {
  const res = await fetch(`${API_URL}/api/content/scenes/${sceneId}/background`, {
    method: 'DELETE',
  });

  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.message || 'Failed to remove scene background');
  }

  return res.json();
}

/**
 * Fetches all candidate background images created across scenes in a story.
 */
export async function fetchStoryBackgrounds(storyId: string): Promise<StoryBackgroundImage[]> {
  const res = await fetch(`${API_URL}/api/content/story/${storyId}/backgrounds`);
  if (!res.ok) throw new Error('Failed to fetch story backgrounds');
  const data = await res.json();
  return data.backgrounds || [];
}

/**
 * Generates character dialogue audio using Kokoro-82M TTS and derives lip-sync visemes.
 */
export async function generateSceneDialogueAudio(
  sceneId: string,
  payload: {
    dialogueId?: string;
    characterId?: string;
    characterInstanceId?: string;
    characterName: string;
    text: string;
    voice?: string;
    speakingDirection?: string;
    emotion?: string;
    emotionIntensity?: number;
    facialExpression?: string;
    speed?: number;
    startMs?: number;
    effect?: string;
    lang?: string;
    volume?: number;
    provider?: string;
    model?: string;
  }
): Promise<{ success: boolean; sceneId: string; dialogue: SceneDialogue }> {
  const res = await fetch(`${API_URL}/api/content/scenes/${sceneId}/dialogue/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.message || 'Failed to generate dialogue audio');
  }

  return res.json();
}

/**
 * Batch generates character dialogue audio for all dialogue lines in a scene.
 */
export async function generateAllSceneDialogueAudios(
  sceneId: string,
  options?: { provider?: string; effect?: string; forceRegenerate?: boolean }
): Promise<{ success: boolean; sceneId: string; dialogueLines: SceneDialogue[] }> {
  const res = await fetch(`${API_URL}/api/content/scenes/${sceneId}/dialogue/generate-all`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(options || {}),
  });

  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.message || 'Failed to generate dialogue audios');
  }

  return res.json();
}

/**
 * Removes a dialogue line from a scene.
 */
export async function deleteSceneDialogue(
  sceneId: string,
  dialogueId: string
): Promise<{ success: boolean; sceneId: string; dialogueId: string }> {
  const res = await fetch(`${API_URL}/api/content/scenes/${sceneId}/dialogue/${dialogueId}`, {
    method: 'DELETE',
  });

  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.message || 'Failed to delete dialogue line');
  }

  return res.json();
}

/**
 * Parses an unstructured raw script into structured draft storyboard scenes for user review.
 */
export async function parseScriptForDraft(payload: {
  rawText: string;
  language?: string;
  title?: string;
  targetDuration?: number;
  targetDurationSeconds?: number;
  desiredDurationSeconds?: number;
  storyId?: string;
  existingCharacters?: Array<{ id: string; name: string; species?: string }>;
}): Promise<DraftStoryboardResult> {
  const res = await fetch(`${API_URL}/api/content/story/parse-script`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.message || 'Failed to parse story script');
  }

  return res.json();
}

/**
 * Commits confirmed/edited draft scenes into an existing story without generating media automatically.
 */
export async function importDraftScenes(
  storyId: string,
  payload: {
    scenes: DraftStoryboardScene[];
    importMode?: 'replace' | 'append';
    updateStoryMetadata?: boolean;
    title?: string;
    targetDurationSeconds?: number;
    language?: string;
  }
): Promise<{ success: boolean; scenes: EditorScene[] }> {
  const res = await fetch(`${API_URL}/api/content/story/${storyId}/scenes/import-draft`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.message || 'Failed to import draft scenes');
  }

  return res.json();
}

/**
 * Generates structured draft storyboard scenes using AI for user review.
 */
export async function generateDraftStory(payload: {
  topic: string;
  ageGroup?: string;
  desiredDurationSeconds?: number;
  language?: string;
  title?: string;
  genre?: string;
  visualStyle?: string;
  lesson?: string;
  sceneCount?: number;
  tone?: string;
  contentRestrictions?: string;
  characterIds?: string[];
}): Promise<DraftStoryboardResult> {
  const res = await fetch(`${API_URL}/api/content/story/generate-draft`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.message || 'Failed to generate draft story');
  }

  return res.json();
}

/**
 * Creates a brand new story with draft scenes from the Storyboard Review Screen.
 */
export async function createStoryFromDraft(payload: {
  title: string;
  targetDurationSeconds?: number;
  language?: string;
  logline?: string;
  lesson?: string;
  genre?: string;
  visualStyle?: string;
  audience?: string;
  topic?: string;
  characters?: Array<{
    id?: string;
    name: string;
    species?: string;
    role?: string;
    voice?: string;
    description?: string;
  }>;
  scenes: DraftStoryboardScene[];
}): Promise<{ success: boolean; storyId: string; story: any; scenes: any[] }> {
  const res = await fetch(`${API_URL}/api/content/story/create-from-draft`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.message || 'Failed to create story from draft');
  }

  return res.json();
}

// =========================================================================
// V2 Visual Bible & Scene Background Prompt Interfaces & Service Calls
// =========================================================================

export interface PromptHistoryEntry {
  id: string;
  version: number;
  prompt: string;
  cameraPerspective?: string;
  aspectRatio?: string;
  locationId?: string;
  timestamp: string;
  isManualEdit?: boolean;
  source?: 'auto_synthesizer' | 'user_edit' | 'google_flow_manual';
  specification?: any;
}

export interface StoryVisualBible {
  version: number;
  updatedAt: string;
  storyId?: string;
  storyTitle?: string;
  createdAt?: string;
  artDirection: {
    primaryStyle?: string;
    style?: string;
    styleDescription?: string;
    renderingTechnique?: string;
    medium?: string;
    detailLevel?: string;
    levelOfDetail?: 'soft' | 'medium' | 'high' | 'intricate' | string;
    targetAgeGroup?: string;
    visualQuality?: string;
    colorPalette?: string;
    textures?: string;
    lightingStyle?: string;
    depthAndPerspective?: string;
    realismOrStylization?: string;
    overallTone?: string;
  };
  worldIdentity: {
    settingType?: string;
    worldDescription?: string;
    geography?: string;
    recurringLocations?: string[] | Record<string, any>;
    recognizableLandmarks?: string[];
    architecture?: string;
    terrainAndVegetation?: string;
    recurringObjects?: string[];
    environmentalDesignRules?: string[];
  };
  lightingAndColorIdentity?: {
    baseColorPalette?: string[];
    dominantMood?: string;
    naturalLightingStyle?: string;
    saturationProfile?: string;
    contrastProfile?: string;
  };
  lightingAndColor?: {
    dominantColors?: string[];
    secondaryColors?: string[];
    lightingQuality?: string;
    contrast?: 'low' | 'medium' | 'high' | string;
    warmth?: 'warm' | 'neutral' | 'cool' | string;
    shadows?: string;
    atmosphericDepth?: string;
  };
  compositionRules?: {
    defaultAspectRatio?: string;
    horizonLinePreference?: string;
    depthLayeringMandate?: string;
    framingStyle?: string;
    negativeSpaceDirective?: string;
    defaultCameraPerspective?: string;
    environmentDepth?: string;
    layers?: {
      foreground?: string;
      middleground?: string;
      background?: string;
    };
    characterPlacementZones?: string[];
    clearingRules?: string;
  };
  exclusionRules?: string[] | {
    negativePrompt?: string;
    prohibitedElements?: string[];
  };
}

export interface V2PromptGenerateResult {
  success: boolean;
  prompt: string;
  specification?: any;
  validation?: {
    valid: boolean;
    violations: string[];
    cleanPrompt: string;
  };
  locationId?: string;
  visualBibleVersion?: number;
  promptEntry?: PromptHistoryEntry;
  totalVersions?: number;
  history?: PromptHistoryEntry[];
}

export async function getStoryVisualBible(storyId: string): Promise<StoryVisualBible> {
  const res = await fetch(`${API_URL}/api/content/stories/${storyId}/visual-bible`);
  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.message || 'Failed to fetch visual bible');
  }
  const data = await res.json();
  return data.visualBible;
}

export async function updateStoryVisualBible(
  storyId: string,
  updates: Partial<StoryVisualBible>
): Promise<StoryVisualBible> {
  const res = await fetch(`${API_URL}/api/content/stories/${storyId}/visual-bible`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(updates),
  });
  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.message || 'Failed to update visual bible');
  }
  const data = await res.json();
  return data.visualBible;
}

export async function generateSceneBackgroundPrompt(
  sceneId: string,
  options?: {
    aspectRatio?: string;
    cameraDirection?: string;
    visualStyle?: string;
    overrides?: any;
  }
): Promise<V2PromptGenerateResult> {
  const res = await fetch(`${API_URL}/api/content/scenes/${sceneId}/background-prompt/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(options || {}),
  });
  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.message || 'Failed to generate background prompt');
  }
  return res.json();
}

export async function getScenePromptHistory(sceneId: string): Promise<PromptHistoryEntry[]> {
  const res = await fetch(`${API_URL}/api/content/scenes/${sceneId}/background-prompt/history`);
  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.message || 'Failed to get prompt history');
  }
  const data = await res.json();
  return data.history || [];
}

export async function saveScenePrompt(
  sceneId: string,
  payload: {
    prompt: string;
    cameraPerspective?: string;
    aspectRatio?: string;
    locationId?: string;
  }
): Promise<{
  success: boolean;
  prompt: string;
  validation: any;
  promptEntry: PromptHistoryEntry;
  totalVersions: number;
  history: PromptHistoryEntry[];
}> {
  const res = await fetch(`${API_URL}/api/content/scenes/${sceneId}/background-prompt/save`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.message || 'Failed to save prompt');
  }
  return res.json();
}

export async function restoreScenePrompt(
  sceneId: string,
  versionId: string
): Promise<{
  success: boolean;
  prompt: string;
  restoredEntry: PromptHistoryEntry;
  history: PromptHistoryEntry[];
}> {
  const res = await fetch(`${API_URL}/api/content/scenes/${sceneId}/background-prompt/restore`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ versionId }),
  });
  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.message || 'Failed to restore prompt');
  }
  return res.json();
}


