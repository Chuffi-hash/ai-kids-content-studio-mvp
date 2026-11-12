export type ShotType =
  | 'extreme_wide'
  | 'wide_establishing'
  | 'medium'
  | 'medium_twoshot'
  | 'medium_closeup'
  | 'closeup'
  | 'closeup_speaker'
  | 'extreme_closeup'
  | 'over_the_shoulder'
  | 'character_focus';

export type CameraAngleType =
  | 'eye_level'
  | 'low_angle'
  | 'high_angle'
  | 'birds_eye'
  | 'aerial'
  | 'dutch_angle';

export type CameraMovementType =
  | 'static'
  | 'zoom_in'
  | 'zoom_out'
  | 'pan_left'
  | 'pan_right'
  | 'tilt_up'
  | 'tilt_down'
  | 'slow_zoom_in'
  | 'tracking'
  | 'dolly'
  | 'push_in'
  | 'pull_out';

/**
 * Normalizes any free-form or variant camera movement string into canonical CameraMovementType
 */
export function normalizeCameraMovement(raw?: string): CameraMovementType {
  if (!raw) return 'static';
  const clean = raw.toLowerCase().trim().replace(/[-_]+/g, ' ');
  if (clean.includes('push in') || clean.includes('slow zoom in') || clean.includes('zoom in')) {
    return 'slow_zoom_in';
  }
  if (clean.includes('pull out') || clean.includes('slow zoom out') || clean.includes('zoom out')) {
    return 'zoom_out';
  }
  if (clean.includes('pan left')) {
    return 'pan_left';
  }
  if (clean.includes('pan right')) {
    return 'pan_right';
  }
  if (clean.includes('tilt up')) {
    return 'tilt_up';
  }
  if (clean.includes('tilt down')) {
    return 'tilt_down';
  }
  if (clean.includes('tracking') || clean.includes('truck')) {
    return 'tracking';
  }
  if (clean.includes('dolly')) {
    return 'dolly';
  }
  return 'static';
}

export interface ShotComposition {
  foreground?: string;
  middleground?: string;
  background?: string;
  depthOfField?: 'shallow' | 'medium' | 'deep';
  characterPlacementZone?: 'left' | 'center' | 'right' | 'two_shot_split' | 'open_stage';
}

export interface PromptVersionRecord {
  version: number;
  backgroundPrompt: string;
  videoPrompt: string;
  createdAt: string;
  approved?: boolean;
  notes?: string;
}

export interface DirectedCharacterPlacement {
  instanceId: string;
  characterId: string;
  name?: string;
  x: number;
  y: number;
  scale: number;
  flipX: boolean;
  zIndex: number;
  action: 'idle' | 'walk' | 'run' | 'jump' | 'wave' | 'point' | 'sit' | 'talk';
  expression: 'neutral' | 'happy' | 'excited' | 'surprised' | 'sad' | 'angry' | 'thinking' | 'confused' | 'curious';
  isSpeaker?: boolean;
}

export interface StructuredSceneDirection {
  sceneId: string;
  sceneNumber: number;
  shotType: ShotType;
  backgroundAssetId?: string;
  backgroundImageUrl?: string;
  cameraMovement: CameraMovementType;
  cameraZoom?: number;
  transition: {
    type: 'fade' | 'cut';
    durationMs: number;
  };
  characterPlacements: DirectedCharacterPlacement[];
}

export interface CinematicShotData {
  shotId: string;
  sceneId: string;
  storyId: string;
  number: number;
  order: number;
  title: string;
  description: string;
  durationMs: number;
  shotType: ShotType;
  cameraAngle: CameraAngleType;
  cameraMovement: CameraMovementType;
  lighting: string;
  composition: ShotComposition;
  characterPlacements: DirectedCharacterPlacement[];
  requiredProps: string[];
  requiredEffects: string[];
  startMs: number;
  endMs: number;
  transition: {
    type: 'fade' | 'cut';
    durationMs: number;
  };
  backgroundPrompt: string;
  videoPrompt: string;
  promptHistory: PromptVersionRecord[];
  backgroundUrl?: string | null;
  videoUrl?: string | null;
  assetStatus: 'pending' | 'generating' | 'imported' | 'approved';
  approvalStatus: 'pending' | 'approved' | 'rejected';
  productionStatus: 'draft' | 'ready' | 'completed';
}
