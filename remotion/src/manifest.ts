export type AspectRatio = '16:9' | '9:16' | '1:1' | '4:5';
export type Scene = {
  id: string;
  durationMs: number;
  backgroundUrl?: string;
  narrationUrl?: string;
  title?: string;
  caption?: string;
  camera?: 'static' | 'zoom-in' | 'zoom-out' | 'pan-left' | 'pan-right';
  overlays?: Array<{
    text: string;
    startMs: number;
    durationMs: number;
    x?: number; // 0-100% of frame
    y?: number;
  }>;
};
export type VideoManifest = {
  fps?: number;
  resolution?: '720p' | '1080p';
  format?: AspectRatio;
  scenes: Scene[];
};

export function validateManifest(value: unknown): VideoManifest {
  if (!value || typeof value !== 'object') throw new Error('Manifest must be an object');
  const m = value as VideoManifest;
  if (!Array.isArray(m.scenes) || m.scenes.length === 0) throw new Error('Manifest requires scenes');
  if (m.fps !== undefined && (!Number.isInteger(m.fps) || m.fps < 1 || m.fps > 60)) throw new Error('fps must be 1-60');
  if (m.resolution && !['720p', '1080p'].includes(m.resolution)) throw new Error('Invalid resolution');
  if (m.format && !['16:9', '9:16', '1:1', '4:5'].includes(m.format)) throw new Error('Invalid format');
  for (const scene of m.scenes) {
    if (!scene.id || !Number.isFinite(scene.durationMs) || scene.durationMs < 500 || scene.durationMs > 120000) {
      throw new Error('Each scene needs an id and durationMs between 500 and 120000');
    }
    for (const url of [scene.backgroundUrl, scene.narrationUrl]) {
      if (url && !/^https?:\/\//i.test(url)) throw new Error('Media URLs must be absolute HTTP(S) URLs reachable by Chromium');
    }
    for (const overlay of scene.overlays ?? []) {
      if (!Number.isFinite(overlay.startMs) || !Number.isFinite(overlay.durationMs) || overlay.startMs < 0 || overlay.durationMs <= 0) {
        throw new Error('Overlay timings must be valid milliseconds');
      }
    }
  }
  return m;
}
export function dimensions(format: AspectRatio = '16:9', resolution: '720p' | '1080p' = '720p') {
  const size = resolution === '1080p' ? 1080 : 720;
  switch (format) {
    case '9:16': return { width: size, height: Math.round(size * 16 / 9 / 2) * 2 };
    case '1:1': return { width: size, height: size };
    case '4:5': return { width: size, height: Math.round(size * 5 / 4 / 2) * 2 };
    default: return { width: Math.round(size * 16 / 9 / 2) * 2, height: size };
  }
}
export function frames(ms: number, fps: number) { return Math.max(1, Math.round(ms * fps / 1000)); }
