export type CharacterAssetType =
  | 'vector_rig'      // Built-in modular SVG vector character
  | 'image'           // Flat raster transparent PNG sprite
  | 'svg'             // Custom uploaded static SVG
  | 'layered'         // Multi-part layered cutouts
  | 'spritesheet';    // Frame sequence

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
  assetType: CharacterAssetType;
  name: string;
  x: number;
  y: number;
  scale: number;
  rotation: number;
  flipX: boolean;
  zIndex: number;
}

export type AnimationActionType = 'idle' | 'walk' | 'wave' | 'jump';

export interface AnimationClip {
  clipId: string;
  instanceId: string;
  action: AnimationActionType;
  startMs: number;
  durationMs: number;
  loop: boolean;
  speedMultiplier?: number;
  motionMode?: 'in_place' | 'motion_path';
  motionPath?: MotionPath;
}

export interface VectorPartShape {
  d?: string;
  type?: 'path' | 'circle' | 'ellipse' | 'rect';
  cx?: number;
  cy?: number;
  r?: number;
  rx?: number;
  ry?: number;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  fill?: string;
  stroke?: string;
  strokeWidth?: number;
  strokeLinecap?: 'round' | 'butt' | 'square';
  strokeLinejoin?: 'round' | 'miter' | 'bevel';
  opacity?: number;
  transform?: string;
}

export interface VectorRigPart {
  id: string;
  label: string;
  pivot: { x: number; y: number };
  zIndex: number;
  shapes: VectorPartShape[];
}

export interface VectorRigDefinition {
  id: string;
  name: string;
  species: string;
  viewBox: string;
  baseWidth: number;
  baseHeight: number;
  parts: {
    torso: VectorRigPart;
    head: VectorRigPart;
    leftArm: VectorRigPart;
    rightArm: VectorRigPart;
    leftForearm?: VectorRigPart;
    rightForearm?: VectorRigPart;
    leftLeg: VectorRigPart;
    rightLeg: VectorRigPart;
  };
}

export interface VectorSceneData {
  version: 1;
  viewport: { width: 1280; height: 720 };
  background?: {
    imageUrl?: string;
    fit?: 'cover' | 'contain';
  };
  characterInstances: CharacterInstance[];
  animationClips: AnimationClip[];
}

export interface EvaluatedCharacterPose {
  x: number;
  y: number;
  scale: number;
  rotation: number;
  flipX: boolean;
  torsoBobY: number;
  torsoAngle: number;
  headAngle: number;
  leftArmAngle: number;
  rightArmAngle: number;
  leftForearmAngle: number;
  rightForearmAngle: number;
  leftLegAngle: number;
  rightLegAngle: number;
  chestScaleY: number;
  activeAction: AnimationActionType;
}
