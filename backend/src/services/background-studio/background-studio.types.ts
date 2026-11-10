export type BackgroundProviderType =
  | 'google_flow'
  | 'gemini'
  | 'pollinations'
  | 'upload';

export interface BackgroundAsset {
  id: string;
  name: string;
  environmentType: string;
  description: string;
  prompt: string;
  imageUrl: string;
  storagePath?: string;
  provider: BackgroundProviderType;
  aspectRatio: '16:9' | '9:16' | '1:1' | '4:5';
  width: number;
  height: number;
  tags?: string[];
  createdAt: string;
}
