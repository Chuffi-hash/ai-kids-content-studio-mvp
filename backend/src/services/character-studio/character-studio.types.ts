import { AssetProvenanceRecord } from '../asset-rights/asset-rights.service.js';

export type CharacterFacingDirection =
  | 'front'
  | 'front-left'
  | 'front-right'
  | 'left'
  | 'right'
  | 'back-left'
  | 'back-right'
  | 'back';

export type CharacterDirectionalViews = Partial<Record<CharacterFacingDirection, string>>;

export type CharacterProviderType =
  | 'native'
  | 'google_flow'
  | 'gemini'
  | 'pollinations'
  | 'upload';

export type CharacterDirection =
  | 'front'
  | 'left'
  | 'right'
  | 'back'
  | 'three_quarter_left'
  | 'three_quarter_right'
  | 'looking_over_left_shoulder'
  | 'looking_over_right_shoulder'
  | 'looking_upward'
  | 'looking_downward';

export type BodyPoseAction =
  | 'standing'
  | 'walking'
  | 'running'
  | 'jumping'
  | 'sitting'
  | 'kneeling'
  | 'dancing'
  | 'waving'
  | 'pointing'
  | 'hands_on_hips'
  | 'arms_crossed'
  | 'thinking'
  | 'sleeping'
  | 'falling'
  | 'flying'
  | 'custom';

export type FacialExpression =
  | 'neutral'
  | 'happy'
  | 'very_happy'
  | 'laughing'
  | 'sad'
  | 'crying'
  | 'angry'
  | 'surprised'
  | 'scared'
  | 'confused'
  | 'curious'
  | 'excited'
  | 'sleepy'
  | 'thinking'
  | 'custom';

export type CameraFraming =
  | 'full_body'
  | 'half_body'
  | 'portrait'
  | 'close_up'
  | 'wide_shot'
  | 'side_profile'
  | 'character_turnaround'
  | 'front_view'
  | 'back_view';

export type GenerationCategory =
  | 'main'
  | 'turnaround'
  | 'expression'
  | 'pose'
  | 'custom';

export interface CharacterGenerationPrompt {
  characterId?: string;
  characterName: string;
  characterDescription: string;
  species?: string;
  age?: string;
  gender?: string;
  direction?: CharacterDirection | string;
  action?: BodyPoseAction | string;
  customAction?: string;
  expression?: FacialExpression | string;
  customExpression?: string;
  cameraAngle?: string;
  framing?: CameraFraming | string;
  clothingInstructions?: string;
  backgroundInstructions?: string;
  artStyle?: string;
  customInstructions?: string;
  negativePrompt?: string;
  referenceImageUrl?: string;
  referenceImageId?: string;
  generationType: GenerationCategory;
  customCombinedPrompt?: string;
}

export interface CharacterAssetRecord {
  id: string;
  characterId: string;
  assetType: GenerationCategory;
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

export interface ProviderCapabilities {
  provider: 'gemini' | 'pollinations';
  model: string;
  supportsReferenceImage: boolean;
  supportsNegativePrompt: boolean;
  supportsCustomAspectRatio: boolean;
  notes: string;
}

export interface GenerateAssetResult {
  assetId: string;
  url: string;
  storagePath: string;
  prompt: string;
  negativePrompt?: string;
  provider: CharacterProviderType;
  model: string;
  generationType: GenerationCategory;
  isMasterReference?: boolean;
  referenceImageUrl?: string;
}

// Backward-compatibility interfaces
export interface CharacterTurnaround {
  front?: string;
  threeQuarterFront?: string;
  side?: string;
  threeQuarterBack?: string;
  back?: string;
}

export interface CharacterExpressions {
  happy?: string;
  excited?: string;
  surprised?: string;
  sad?: string;
  angry?: string;
  thinking?: string;
  confused?: string;
  laughing?: string;
}

export interface CharacterPoses {
  idle?: string;
  walk?: string;
  run?: string;
  jump?: string;
  wave?: string;
  point?: string;
  sit?: string;
  talk?: string;
}

export interface CharacterReferenceAssets {
  mainUrl?: string;
  transparentUrl?: string;
  characterType?: 'vector' | 'raster';
  directionalViews?: CharacterDirectionalViews;
  turnaround?: CharacterTurnaround;
  expressions?: CharacterExpressions;
  poses?: CharacterPoses;
  provenance?: AssetProvenanceRecord;
  sheetUrls?: {
    turnaroundSheetUrl?: string;
    expressionSheetUrl?: string;
    poseSheetUrl?: string;
  };
  promptUsed?: {
    main?: string;
    turnaround?: string;
    expression?: string;
    pose?: string;
  };
}
