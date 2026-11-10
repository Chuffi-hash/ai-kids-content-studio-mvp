export type ShotType =
  | 'wide_establishing'
  | 'medium_twoshot'
  | 'closeup_speaker'
  | 'character_focus';

export type CameraMovementType =
  | 'static'
  | 'zoom_in'
  | 'zoom_out'
  | 'pan_left'
  | 'pan_right'
  | 'slow_zoom_in';

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
