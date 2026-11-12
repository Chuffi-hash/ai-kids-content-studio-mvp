import { ChannelBrandingConfig, DEFAULT_BRANDING_CONFIG, AspectRatioKey, BrandingPosition } from '../../../backend/src/services/branding/branding.types';

export type { ChannelBrandingConfig, BrandingPosition, AspectRatioKey };
export { DEFAULT_BRANDING_CONFIG };

const API_BASE = '/api/branding';

export async function fetchBrandingConfig(storyId?: string): Promise<ChannelBrandingConfig> {
  const url = storyId ? `${API_BASE}?storyId=${encodeURIComponent(storyId)}` : API_BASE;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Failed to load branding: ${res.statusText}`);
  }
  const data = await res.json();
  return { ...DEFAULT_BRANDING_CONFIG, ...data };
}

export async function saveBrandingConfig(
  config: ChannelBrandingConfig,
  storyId?: string
): Promise<ChannelBrandingConfig> {
  const url = storyId ? `${API_BASE}?storyId=${encodeURIComponent(storyId)}` : API_BASE;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(config),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || `Failed to save branding: ${res.statusText}`);
  }
  const result = await res.json();
  return result.config || config;
}

export async function uploadBrandingFile(
  file: File,
  assetType: 'logo' | 'secondary' | 'badge' = 'logo',
  storyId?: string
): Promise<{ url: string; width?: number; height?: number }> {
  // Convert file to base64
  const base64Data = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });

  const res = await fetch(`${API_BASE}/upload`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      base64Data,
      filename: file.name,
      assetType,
      storyId,
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || 'Failed to upload logo');
  }

  const result = await res.json();
  return {
    url: result.url,
    width: result.width,
    height: result.height,
  };
}
