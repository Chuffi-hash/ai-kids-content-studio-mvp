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
  expression?: FacialExpression;
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
  tag?: 'face_base' | 'eyebrows' | 'eyes' | 'mouth' | 'nose' | 'hair' | 'ears' | 'accessories' | string;
}

export interface VectorRigPart {
  id: string;
  label: string;
  pivot: { x: number; y: number };
  zIndex: number;
  shapes: VectorPartShape[];
}

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

export type SpeakingEmotion =
  | 'neutral'
  | 'happy'
  | 'excited'
  | 'sad'
  | 'sleepy'
  | 'confused'
  | 'worried'
  | 'curious'
  | 'calm'
  | 'serious'
  | 'angry'
  | 'surprised'
  | 'whispering'
  | 'shouting';

export type SpeakingDirection =
  | SpeakingEmotion
  | 'cheerful';

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

export interface CharacterPerformanceOverride {
  lang?: 'hi' | 'en' | string;
  voiceId?: string;
  emotion?: SpeakingEmotion;
  emotionIntensity?: number; // 0 - 100%
  speed?: number;
  effect?: 'normal' | 'cartoon' | 'robot' | 'whisper' | 'shout';
  defaultExpression?: FacialExpression;
  facialExpression?: FacialExpression;
}

export interface SceneDialogue {
  id: string;
  characterId?: string;
  characterInstanceId?: string;
  characterName: string;
  text: string;
  lang?: string;
  voice?: string;
  speakingDirection?: SpeakingDirection;
  emotion?: SpeakingEmotion;
  emotionIntensity?: number; // 0 - 100%
  facialExpression?: FacialExpression;
  speed?: number;
  effect?: 'normal' | 'cartoon' | 'robot' | 'whisper' | 'shout';
  audioUrl?: string;
  audioMeta?: {
    text: string;
    lang: string;
    voice: string;
    emotion: string;
    emotionIntensity: number;
    speed: number;
    effect?: string;
  };
  startMs: number;
  durationMs: number;
  visemeCues?: VisemeCue[];
}

export interface CharacterVoiceConfig {
  lang?: 'hi' | 'en' | string;
  voiceId: string;
  speed?: number;
  emotion?: SpeakingEmotion;
  emotionIntensity?: number; // 0 - 100%
  style?: SpeakingDirection;
  effect?: 'normal' | 'cartoon' | 'robot' | 'whisper' | 'shout';
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

export type EducationalOverlayType =
  | 'location_pin'
  | 'route_line'
  | 'highlight_ring'
  | 'arrow_pointer'
  | 'callout_label'
  | 'spotlight'
  | 'glow'
  | 'sparkles'
  | 'flying_birds'
  | 'moving_clouds'
  | 'title_card'
  | 'rain'
  | 'snowfall'
  | 'wind'
  | 'falling_leaves'
  | 'sunshine_rays'
  | 'heat_shimmer'
  | 'fog_mist'
  | 'lightning'
  | 'water_splashes'
  | 'butterflies';

export interface EducationalOverlay {
  id: string;
  type: EducationalOverlayType;
  title?: string;
  label?: string;
  startMs: number;
  durationMs: number;
  x: number;
  y: number;
  zIndex?: number;
  layerPosition?: 'below_characters' | 'above_characters';
  targetX?: number;
  targetY?: number;
  points?: Array<{ x: number; y: number }>;
  pathD?: string;
  radius?: number;
  radiusX?: number;
  radiusY?: number;
  width?: number;
  height?: number;
  color?: string;
  fillColor?: string;
  textColor?: string;
  strokeWidth?: number;
  fontSize?: number;
  icon?: 'pin' | 'flag' | 'star' | 'mountain' | 'city';
  style?: 'solid' | 'dashed' | 'glow' | 'pulse' | 'radar';
  animationStyle?: 'fade' | 'pop' | 'drop' | 'draw' | 'pulse';
  progressDurationMs?: number;
  hasConnectorLine?: boolean;
  pulseSpeedMs?: number;
}

export type AspectRatioType = '16:9' | '9:16' | '1:1' | '4:5' | 'custom';

export interface FormatVariantPresentation {
  aspectRatio: AspectRatioType;
  width: number;
  height: number;
  characterOverrides?: Record<string, {
    x?: number;
    y?: number;
    scale?: number;
  }>;
  background?: {
    fit?: 'cover' | 'contain';
    focalPoint?: { x: number; y: number };
  };
  overlayOverrides?: Record<string, {
    x?: number;
    y?: number;
    scale?: number;
  }>;
  captionPosition?: 'top' | 'middle' | 'bottom';
}

export interface VectorSceneData {
  version: 1;
  viewport: { width: number; height: number };
  activeFormat?: AspectRatioType;
  formatVariants?: Record<string, FormatVariantPresentation>;
  background?: {
    imageUrl?: string;
    fit?: 'cover' | 'contain';
  };
  characterInstances: CharacterInstance[];
  animationClips: AnimationClip[];
  dialogue?: Array<{ speaker: string; text: string }>;
  characterActions?: Array<{ characterName: string; action: string; pose?: string }>;
  expressionCues?: ExpressionCue[];
  dialogueLines?: SceneDialogue[];
  overlays?: EducationalOverlay[];
  characterPerformances?: Record<string, CharacterPerformanceOverride>;
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
  expression?: FacialExpression;
  mouthState?: MouthShape;
  speaking?: boolean;
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
  species: 'human' | 'bear' | 'robot' | 'animal' | 'alien' | 'fantasy_creature' | 'plant' | 'object' | 'other' | string;
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
  voiceConfig?: CharacterVoiceConfig;
  planet?: PlanetCustomConfig;
}

export interface PlanetCustomConfig {
  oceanColor?: string;
  continentColor?: string;
  landmassStyle?: 'earth' | 'islands' | 'pangaea';
  atmosphereGlow?: 'cyan' | 'gold' | 'white' | 'none';
  clouds?: boolean;
  showHands?: boolean;
}
