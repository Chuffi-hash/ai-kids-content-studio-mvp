export type AspectRatio = '16:9' | '9:16' | '1:1' | '4:5';

export type FacialExpression =
  | 'neutral'
  | 'happy'
  | 'sad'
  | 'angry'
  | 'surprised'
  | 'scared'
  | 'confused'
  | 'curious';

export type MouthShape = 'rest' | 'open' | 'wide' | 'round' | 'closed';

export type AnimationAction = 'idle' | 'walk' | 'wave' | 'jump' | 'point';

export interface VectorPartShape {
  type: 'circle' | 'ellipse' | 'rect' | 'path';
  cx?: number;
  cy?: number;
  r?: number;
  rx?: number;
  ry?: number;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  d?: string;
  fill?: string;
  stroke?: string;
  strokeWidth?: number;
  strokeLinecap?: 'butt' | 'round' | 'square';
  strokeLinejoin?: 'miter' | 'round' | 'bevel';
  opacity?: number;
  transform?: string;
  tag?: 'base' | 'eyes' | 'mouth' | 'feature' | 'detail' | string;
}

export interface VectorRigPart {
  id: string;
  name: string;
  zIndex: number;
  pivot: { x: number; y: number };
  shapes: VectorPartShape[];
}

export interface VectorRigDefinition {
  id: string;
  name: string;
  species?: string;
  baseWidth: number;
  baseHeight: number;
  parts: {
    head: VectorRigPart;
    torso: VectorRigPart;
    leftArm: VectorRigPart;
    leftForearm?: VectorRigPart;
    rightArm: VectorRigPart;
    rightForearm?: VectorRigPart;
    leftLeg: VectorRigPart;
    rightLeg: VectorRigPart;
  };
}

export interface CustomCharacterAppearance {
  species?: string;
  primaryColor?: string;
  secondaryColor?: string;
  accentColor?: string;
  eyeColor?: string;
  skinTone?: string;
  clothingStyle?: string;
  headShape?: string;
  bodyProportions?: string;
  distinctiveFeatures?: string[];
  features?: string[];
  scale?: number;
}

export interface MotionPath {
  startX: number;
  startY: number;
  endX: number;
  endY: number;
  easing?: 'linear' | 'easeInOut' | 'easeIn' | 'easeOut';
}

export interface CharacterInstance {
  instanceId: string;
  characterId: string;
  assetType?: string;
  name?: string;
  x: number;
  y: number;
  scale: number;
  rotation: number;
  flipX: boolean;
  zIndex: number;
  customRig?: VectorRigDefinition;
  appearance?: CustomCharacterAppearance;
  expression?: FacialExpression;
}

export interface AnimationClip {
  clipId: string;
  instanceId: string;
  action: AnimationAction;
  startMs: number;
  durationMs: number;
  loop: boolean;
  speedMultiplier?: number;
  motionMode?: 'in_place' | 'motion_path';
  motionPath?: MotionPath;
}

export interface ExpressionCue {
  id?: string;
  instanceId?: string;
  characterInstanceId?: string;
  characterId?: string;
  expression: FacialExpression;
  startMs: number;
  durationMs: number;
}

export interface VisemeCue {
  timeMs: number;
  shape: MouthShape;
  durationMs: number;
}

export interface DialogueLine {
  id: string;
  characterName: string;
  characterInstanceId?: string;
  characterId?: string;
  text: string;
  url?: string;
  audioUrl?: string;
  startMs: number;
  durationMs: number;
  volume?: number;
  facialExpression?: FacialExpression;
  emotion?: string;
  speakingDirection?: string;
  visemeCues?: VisemeCue[];
}

export type EducationalOverlayType =
  | 'location_pin'
  | 'route_line'
  | 'highlight_ring'
  | 'directional_arrow'
  | 'callout_label';

export interface EducationalOverlay {
  id: string;
  type: EducationalOverlayType;
  x: number;
  y: number;
  scale?: number;
  rotation?: number;
  color?: string;
  label?: string;
  endX?: number;
  endY?: number;
  radius?: number;
  startMs?: number;
  durationMs?: number;
  layerDepth?: 'below_characters' | 'above_characters';
  text?: string; // backwards compatibility with pilot text overlays
}

export interface CameraConfig {
  movement?: string;
  rotation?: string;
  rotationDegrees?: number;
}

export interface BackgroundConfig {
  imageUrl?: string;
  fit?: 'cover' | 'contain';
  removed?: boolean;
}

export interface NarrationConfig {
  url: string;
  durationMs?: number;
  volume?: number;
}

export interface TransitionConfig {
  type?: 'cut' | 'fade';
  durationMs?: number;
}

export interface FormatVariantConfig {
  aspectRatio: AspectRatio;
  characterOverrides?: Record<string, {
    x?: number;
    y?: number;
    scale?: number;
  }>;
  background?: {
    fit?: 'cover' | 'contain';
  };
  overlayOverrides?: Record<string, {
    x?: number;
    y?: number;
    scale?: number;
  }>;
}

export interface Scene {
  id: string;
  sceneNumber?: number;
  durationMs: number;
  title?: string;
  caption?: string;
  background?: BackgroundConfig;
  camera?: 'static' | 'zoom-in' | 'zoom-out' | 'pan-left' | 'pan-right' | CameraConfig;
  cameraMovement?: string;
  cameraRotation?: string;
  cameraRotationDegrees?: number;
  narration?: NarrationConfig;
  dialogues?: DialogueLine[];
  characterInstances?: CharacterInstance[];
  animationClips?: AnimationClip[];
  expressionCues?: ExpressionCue[];
  overlays?: EducationalOverlay[];
  formatVariants?: Record<string, FormatVariantConfig>;
  transition?: TransitionConfig;

  // Backwards compatibility with pilot
  backgroundUrl?: string;
  narrationUrl?: string;
}

export interface VideoManifest {
  version?: string | number;
  storyId?: string;
  storyTitle?: string;
  fps?: number;
  resolution?: '720p' | '1080p';
  format?: AspectRatio;
  backgroundMusic?: string;
  musicVolume?: number;
  scenes: Scene[];
}

export function validateManifest(value: unknown): VideoManifest {
  if (!value || typeof value !== 'object') throw new Error('Manifest must be an object');
  const m = value as VideoManifest;
  if (!Array.isArray(m.scenes) || m.scenes.length === 0) throw new Error('Manifest requires scenes');
  if (m.fps !== undefined && (!Number.isInteger(m.fps) || m.fps < 1 || m.fps > 60)) {
    throw new Error('fps must be between 1 and 60');
  }
  if (m.resolution && !['720p', '1080p'].includes(m.resolution)) throw new Error('Invalid resolution');
  if (m.format && !['16:9', '9:16', '1:1', '4:5'].includes(m.format)) throw new Error('Invalid format');

  for (const scene of m.scenes) {
    if (!scene.id || !Number.isFinite(scene.durationMs) || scene.durationMs < 500 || scene.durationMs > 300000) {
      throw new Error(`Scene ${scene.id || 'unknown'} needs an id and durationMs between 500 and 300000`);
    }

    // Normalize pilot backwards compatibility properties
    if (scene.backgroundUrl && !scene.background) {
      scene.background = { imageUrl: scene.backgroundUrl, fit: 'cover' };
    }
    if (scene.narrationUrl && !scene.narration) {
      scene.narration = { url: scene.narrationUrl, volume: 1.0 };
    }

    const isValidMediaUrl = (u: string) =>
      /^https?:\/\//i.test(u) ||
      u.startsWith('data:') ||
      u.startsWith('/storage/') ||
      u.startsWith('storage/') ||
      u.startsWith('file:') ||
      /^[a-zA-Z]:[\\/]/.test(u);

    // Validate media URLs if present
    const bgUrl = scene.background?.imageUrl || scene.backgroundUrl;
    const narrUrl = scene.narration?.url || scene.narrationUrl;
    for (const url of [bgUrl, narrUrl]) {
      if (url && !isValidMediaUrl(url)) {
        throw new Error(`Media URL must be HTTP(S), storage path, file path, or data URI: "${url}"`);
      }
    }

    for (const d of scene.dialogues ?? []) {
      const dUrl = d.url || d.audioUrl;
      if (dUrl && !isValidMediaUrl(dUrl)) {
        throw new Error(`Dialogue audio URL must be HTTP(S), storage path, file path, or data URI: "${dUrl}"`);
      }
    }

    for (const overlay of scene.overlays ?? []) {
      if (overlay.startMs !== undefined && (!Number.isFinite(overlay.startMs) || overlay.startMs < 0)) {
        throw new Error('Overlay startMs must be a positive number');
      }
      if (overlay.durationMs !== undefined && (!Number.isFinite(overlay.durationMs) || overlay.durationMs <= 0)) {
        throw new Error('Overlay durationMs must be a positive number');
      }
    }
  }

  return m;
}

export function dimensions(format: AspectRatio = '16:9', resolution: '720p' | '1080p' = '720p'): { width: number; height: number } {
  const size = resolution === '1080p' ? 1080 : 720;
  let w = 1280;
  let h = 720;

  switch (format) {
    case '9:16':
      w = size;
      h = Math.round((size * 16) / 9 / 2) * 2;
      break;
    case '1:1':
      w = size;
      h = size;
      break;
    case '4:5':
      w = size;
      h = Math.round((size * 5) / 4 / 2) * 2;
      break;
    case '16:9':
    default:
      w = Math.round((size * 16) / 9 / 2) * 2;
      h = size;
      break;
  }

  return {
    width: Math.round(w / 2) * 2,
    height: Math.round(h / 2) * 2,
  };
}

export function frames(ms: number, fps: number): number {
  return Math.max(1, Math.round((ms * fps) / 1000));
}
