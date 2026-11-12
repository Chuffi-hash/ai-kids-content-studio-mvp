import { AssetProvenanceRecord } from '../asset-rights/asset-rights.service.js';

export type BackgroundProviderType =
  | 'google_flow'
  | 'gemini'
  | 'pollinations'
  | 'comfyui'
  | 'mock'
  | 'upload';

export interface BackgroundAsset {
  id: string;
  name: string;
  environmentType: string;
  description: string;
  prompt: string;
  originalPrompt?: string;
  imageUrl: string;
  storagePath?: string;
  provider: BackgroundProviderType;
  aspectRatio: '16:9' | '9:16' | '1:1' | '4:5';
  width: number;
  height: number;
  originalDimensions?: { width: number; height: number };
  originalAspectRatio?: '16:9' | '9:16' | '1:1' | '4:5';
  fitMode?: 'cover' | 'contain' | 'fill';
  focalPoint?: { x: number; y: number };
  stylePreset?: string;
  customStyleInstructions?: string;
  mode?: 'environment_only' | 'complete_scene';
  isCompleteSceneWithEmbeddedCharacters?: boolean;
  areCharactersIndependentlyAnimated?: boolean;
  disclaimer?: string;
  provenance?: AssetProvenanceRecord;
  tags?: string[];
  createdAt: string;
}
