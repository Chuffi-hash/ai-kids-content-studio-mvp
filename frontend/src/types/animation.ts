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
  customRig?: VectorRigDefinition;
  appearance?: CustomCharacterAppearance;
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
  dialogue?: Array<{ speaker: string; text: string }>;
  characterActions?: Array<{ characterName: string; action: string; pose?: string }>;
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

export interface ArmLimbConfig {
  shoulderOffset?: { x: number; y: number };
  upperArmLength?: number;
  upperArmThickness?: number;
  elbowOffset?: { x: number; y: number };
  forearmLength?: number;
  forearmThickness?: number;
  handSize?: number;
  handShape?: 'simple' | 'mitten' | 'paw';
  sleeveStyle?: 'short' | 'long' | 'sleeveless';
  skinColor?: string;
}

export interface LegLimbConfig {
  hipOffset?: { x: number; y: number };
  upperLegLength?: number;
  upperLegThickness?: number;
  kneeOffset?: { x: number; y: number };
  lowerLegLength?: number;
  lowerLegThickness?: number;
  footSize?: number;
  pantsStyle?: 'pants' | 'shorts' | 'skirt';
  pantsColor?: string;
  shoeStyle?: 'sneakers' | 'boots' | 'shoes';
  shoeColor?: string;
}

export interface CustomCharacterAppearance {
  version: 1;
  species: 'human' | 'bear' | 'robot' | 'animal';
  gender?: 'neutral' | 'boy' | 'girl';
  head: {
    shape: 'round' | 'oval' | 'square' | 'heart';
    size: number; // 0.8 - 1.3
    skinColor: string;
  };
  neck?: {
    length?: 'short' | 'normal' | 'long';
    thickness?: 'slim' | 'normal' | 'wide';
    style?: 'plain' | 'band' | 'scarf' | 'chibi';
    color?: string;
  };
  hair: {
    style: 'short' | 'curly' | 'spiky' | 'bob' | 'long' | 'ponytail' | 'bear_ears' | 'none';
    color: string;
  };
  eyes: {
    style: 'round' | 'dot' | 'anime' | 'happy' | 'sleepy';
    color: string;
    size: number; // 0.8 - 1.3
  };
  eyebrows: {
    style: 'curved' | 'flat' | 'bushy' | 'arched';
    color: string;
  };
  nose: {
    style: 'button' | 'dot' | 'triangle' | 'oval' | 'bear_snout';
    size: number;
    color?: string;
  };
  mouth: {
    style: 'smile' | 'open_grin' | 'laugh' | 'surprised' | 'line';
    color?: string;
  };
  ears: {
    style: 'round' | 'human' | 'bear' | 'elf';
    size: number;
  };
  accessories?: {
    glasses?: 'none' | 'round' | 'square';
    glassesColor?: string;
    freckles?: boolean;
    blush?: boolean;
    hat?: 'none' | 'cap' | 'beanie';
    hatColor?: string;
  };
  torso: {
    shape: 'standard' | 'slim' | 'stocky';
    width: number; // 0.8 - 1.3
    height: number; // 0.85 - 1.25
    clothingStyle: 'tshirt' | 'hoodie' | 'vest' | 'collared' | 'dress';
    shirtColor: string;
    collarColor?: string;
    pattern?: 'none' | 'star' | 'stripe' | 'circle';
  };
  arms: {
    length: number; // 0.8 - 1.3
    thickness: number; // 0.8 - 1.3
    sleeveStyle: 'short' | 'long' | 'sleeveless';
    handShape: 'simple' | 'mitten' | 'paw';
    skinColor?: string;
  };
  legs: {
    length: number; // 0.8 - 1.3
    thickness: number; // 0.8 - 1.3
    pantsStyle: 'pants' | 'shorts' | 'skirt';
    pantsColor: string;
    shoeStyle: 'sneakers' | 'boots' | 'shoes';
    shoeColor: string;
  };
  // Independent limb custom controls
  leftArm?: ArmLimbConfig;
  rightArm?: ArmLimbConfig;
  leftLeg?: LegLimbConfig;
  rightLeg?: LegLimbConfig;
}
