export type CharacterProviderType =
  | 'native'
  | 'google_flow'
  | 'gemini'
  | 'pollinations'
  | 'upload';

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
  turnaround?: CharacterTurnaround;
  expressions?: CharacterExpressions;
  poses?: CharacterPoses;
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

export interface CharacterVoiceProfile {
  provider: 'kokoro' | 'fish_audio' | 'google_tts';
  voiceId: string;
  lang: string;
  speed: number;
  style?: string;
  effect?: string;
  emotion?: string;
  emotionIntensity?: number;
}

export interface CharacterAssetRecord {
  id: string;
  name: string;
  species: string;
  personality: string;
  visualDescription: string;
  distinctiveFeatures?: string;
  artStyle?: string;
  provider: CharacterProviderType;
  references: CharacterReferenceAssets;
  rigData?: any; // Vector rig or segmented image rig
  voiceConfig?: CharacterVoiceProfile;
  isLocked?: boolean;
  createdAt: string;
  updatedAt: string;
}
