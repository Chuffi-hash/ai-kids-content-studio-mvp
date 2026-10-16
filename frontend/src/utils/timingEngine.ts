import { EditorScene } from '../types/editor';

export const DEFAULT_WORDS_PER_MINUTE = 130;
export const MIN_SCENE_DURATION_MS = 1500;
export const DEFAULT_SCENE_DURATION_MS = 5000;

/**
 * Calculates estimated speech duration in milliseconds from narration text.
 */
export function estimateSpeechDurationMs(
  narration?: string | null,
  wpm = DEFAULT_WORDS_PER_MINUTE
): number {
  if (!narration || narration.trim().length === 0) {
    return DEFAULT_SCENE_DURATION_MS;
  }

  const words = narration.trim().split(/\s+/).filter(Boolean).length;
  if (words === 0) return DEFAULT_SCENE_DURATION_MS;

  const msPerWord = (60 * 1000) / wpm;
  const speechMs = Math.round(words * msPerWord + 1000);

  return Math.max(MIN_SCENE_DURATION_MS, speechMs);
}

/**
 * Formats milliseconds as MM:SS.mmm
 */
export function formatTimeMs(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return '00:00.000';
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  const millis = Math.floor(ms % 1000);

  const mm = String(minutes).padStart(2, '0');
  const ss = String(seconds).padStart(2, '0');
  const mmm = String(millis).padStart(3, '0');

  return `${mm}:${ss}.${mmm}`;
}

/**
 * Formats milliseconds as a clean duration, e.g. "5.2s" or "1m 15s"
 */
export function formatDurationHuman(ms: number): string {
  if (!Number.isFinite(ms) || ms <= 0) return '0s';
  const seconds = ms / 1000;
  if (seconds < 60) {
    return `${seconds.toFixed(1)}s`;
  }
  const mins = Math.floor(seconds / 60);
  const remSecs = Math.round(seconds % 60);
  return `${mins}m ${remSecs}s`;
}

/**
 * Validates a scene's duration against its narration audio.
 */
export function validateSceneTiming(scene: {
  startMs: number;
  endMs: number;
  actualAudioDurationMs?: number | null;
  narration?: string | null;
}): { isValid: boolean; warning?: string; overflowMs?: number } {
  const durationMs = scene.endMs - scene.startMs;

  if (durationMs < MIN_SCENE_DURATION_MS) {
    return {
      isValid: false,
      warning: `Scene duration (${durationMs}ms) is less than minimum allowed (${MIN_SCENE_DURATION_MS}ms).`,
    };
  }

  if (scene.actualAudioDurationMs && scene.actualAudioDurationMs > durationMs) {
    const overflowMs = scene.actualAudioDurationMs - durationMs;
    return {
      isValid: false,
      warning: `Narration audio (${formatTimeMs(scene.actualAudioDurationMs)}) exceeds scene duration (${formatTimeMs(durationMs)}) by ${overflowMs}ms.`,
      overflowMs,
    };
  }

  return { isValid: true };
}

/**
 * Recalculates contiguous startMs and endMs for all scenes in order.
 */
export function recalculateContiguousTimeline(
  scenes: EditorScene[],
  startOffsetMs = 0
): EditorScene[] {
  let currentTime = startOffsetMs;
  return scenes.map((scene, index) => {
    const duration = Math.max(
      MIN_SCENE_DURATION_MS,
      scene.endMs > scene.startMs ? scene.endMs - scene.startMs : (scene.estimatedDurationMs || DEFAULT_SCENE_DURATION_MS)
    );
    const startMs = currentTime;
    const endMs = startMs + duration;
    currentTime = endMs;

    return {
      ...scene,
      order: index + 1,
      number: index + 1,
      startMs,
      endMs,
      estimatedDurationMs: duration,
    };
  });
}

/**
 * Ripple edit when changing a scene duration.
 */
export function calculateRippleEdit(
  scenes: EditorScene[],
  targetSceneId: string,
  newDurationMs: number
): EditorScene[] {
  const targetIndex = scenes.findIndex((s) => s.sceneId === targetSceneId);
  if (targetIndex === -1) return scenes;

  const validNewDuration = Math.max(MIN_SCENE_DURATION_MS, Math.round(newDurationMs));
  const targetScene = scenes[targetIndex];
  const oldDuration = targetScene.endMs - targetScene.startMs;
  const delta = validNewDuration - oldDuration;

  return scenes.map((scene, index) => {
    if (index < targetIndex) {
      return scene;
    }
    if (index === targetIndex) {
      return {
        ...scene,
        endMs: scene.startMs + validNewDuration,
        estimatedDurationMs: validNewDuration,
      };
    }
    return {
      ...scene,
      startMs: scene.startMs + delta,
      endMs: scene.endMs + delta,
    };
  });
}

