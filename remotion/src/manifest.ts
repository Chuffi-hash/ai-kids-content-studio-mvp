export type AspectRatio = '16:9' | '9:16' | '1:1' | '4:5';

export type AudioTrack = {
  src: string;
  startMs: number;
  durationMs: number;
  volume: number;
};

export type Scene = {
  id: string;
  title: string;
  caption?: string;
  durationMs: number;
  /** Ordered PNG frames generated from the project's existing vector animation engine. */
  frames?: string[];
  /** Optional pre-rendered clip for scenes without editable vector animation data. */
  videoSrc?: string;
  /** Optional still background for image-based scenes. */
  backgroundSrc?: string;
  cameraMovement?: string;
  cameraRotation?: string;
  cameraRotationDegrees?: number;
  audioTracks: AudioTrack[];
};

export type VideoManifest = {
  version: 1;
  fps: number;
  width: number;
  height: number;
  scenes: Scene[];
  silentAudioSrc: string;
};

function isSafeAssetPath(value: unknown): value is string {
  return typeof value === 'string'
    && value.length > 0
    && !value.startsWith('/')
    && !value.includes('\\')
    && !value.split('/').some((part) => part === '..' || part === '.')
    && /^[a-zA-Z0-9_./-]+$/.test(value);
}

export function validateManifest(value: unknown): VideoManifest {
  if (!value || typeof value !== 'object') throw new Error('Manifest must be an object');
  const manifest = value as VideoManifest;
  if (manifest.version !== 1) throw new Error('Unsupported Remotion manifest version');
  if (!Number.isInteger(manifest.fps) || manifest.fps < 1 || manifest.fps > 60) throw new Error('fps must be 1-60');
  if (!Number.isInteger(manifest.width) || !Number.isInteger(manifest.height)
    || manifest.width < 2 || manifest.height < 2
    || manifest.width > 3840 || manifest.height > 3840) {
    throw new Error('Invalid composition dimensions');
  }
  if (!Array.isArray(manifest.scenes) || manifest.scenes.length === 0) throw new Error('Manifest requires scenes');
  if (!isSafeAssetPath(manifest.silentAudioSrc)) throw new Error('Invalid silent audio asset path');

  const ids = new Set<string>();
  for (const scene of manifest.scenes) {
    if (!scene.id || ids.has(scene.id)) throw new Error('Scene ids must be present and unique');
    ids.add(scene.id);
    if (!Number.isFinite(scene.durationMs) || scene.durationMs < 500 || scene.durationMs > 120000) {
      throw new Error(`Invalid duration for scene ${scene.id}`);
    }
    if (scene.frames !== undefined) {
      if (!Array.isArray(scene.frames) || scene.frames.length === 0 || scene.frames.some((src) => !isSafeAssetPath(src))) {
        throw new Error(`Invalid image sequence for scene ${scene.id}`);
      }
    }
    if (scene.videoSrc && !isSafeAssetPath(scene.videoSrc)) throw new Error(`Invalid video asset for scene ${scene.id}`);
    if (scene.backgroundSrc && !isSafeAssetPath(scene.backgroundSrc)) throw new Error(`Invalid background asset for scene ${scene.id}`);
    if (scene.frames && scene.videoSrc) throw new Error(`Scene ${scene.id} cannot use both frames and a video source`);
    if (!Array.isArray(scene.audioTracks)) throw new Error(`Audio tracks must be an array for scene ${scene.id}`);
    for (const track of scene.audioTracks) {
      if (!isSafeAssetPath(track.src)) throw new Error(`Invalid audio asset for scene ${scene.id}`);
      if (!Number.isFinite(track.startMs) || track.startMs < 0
        || !Number.isFinite(track.durationMs) || track.durationMs <= 0
        || !Number.isFinite(track.volume) || track.volume < 0 || track.volume > 2) {
        throw new Error(`Invalid audio timing or volume for scene ${scene.id}`);
      }
    }
  }
  return manifest;
}

export function frames(ms: number, fps: number): number {
  return Math.max(1, Math.round(ms * fps / 1000));
}
