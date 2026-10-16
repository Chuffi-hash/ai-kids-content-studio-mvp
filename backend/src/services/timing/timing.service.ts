/**
 * Deterministic Timing Engine for AI Media Studio
 * 
 * Handles integer millisecond timeline positioning,
 * speech duration estimation, ripple edits, and timing validation.
 */

export const DEFAULT_WORDS_PER_MINUTE = 130; // Storybook narration pace
export const MIN_SCENE_DURATION_MS = 1500;
export const DEFAULT_SCENE_DURATION_MS = 5000;

export interface SceneTiming {
  sceneId: string;
  order: number;
  startMs: number;
  endMs: number;
  durationMs: number;
  estimatedDurationMs?: number;
  actualAudioDurationMs?: number | null;
}

/**
 * Calculates estimated speech duration in milliseconds from narration text.
 * Uses words-per-minute with natural speech pause buffers.
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

  // Words per minute converted to ms per word
  const msPerWord = (60 * 1000) / wpm;
  // Account for natural opening and closing breath/pause (1000ms total buffer)
  const speechMs = Math.round(words * msPerWord + 1000);

  return Math.max(MIN_SCENE_DURATION_MS, speechMs);
}

/**
 * Validates scene timing against narration duration.
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
      warning: `Narration audio (${formatTimeMs(scene.actualAudioDurationMs)}) exceeds scene duration (${formatTimeMs(durationMs)}) by ${overflowMs}ms. Audio will be truncated or overlap.`,
      overflowMs,
    };
  }

  return { isValid: true };
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
 * Formats milliseconds as a clean human-readable duration, e.g. "5.2s" or "1m 12s"
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
 * Recalculates contiguous startMs and endMs for an array of scenes in order.
 * Ensures no gaps and no overlaps.
 */
export function recalculateContiguousTimeline<T extends { sceneId: string; durationMs: number }>(
  items: T[],
  startOffsetMs = 0
): Array<T & { order: number; startMs: number; endMs: number }> {
  let currentTime = startOffsetMs;
  return items.map((item, index) => {
    const duration = Math.max(MIN_SCENE_DURATION_MS, Math.round(item.durationMs));
    const startMs = currentTime;
    const endMs = startMs + duration;
    currentTime = endMs;

    return {
      ...item,
      order: index + 1,
      startMs,
      endMs,
      durationMs: duration,
    };
  });
}

/**
 * Calculates a ripple edit when a single scene's duration is modified.
 * Adjusts all subsequent scenes by the time delta.
 */
export function calculateRippleEdit<T extends { sceneId: string; startMs: number; endMs: number }>(
  scenes: T[],
  targetSceneId: string,
  newDurationMs: number
): T[] {
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
      };
    }
    // Subsequent scenes shifted by delta
    return {
      ...scene,
      startMs: scene.startMs + delta,
      endMs: scene.endMs + delta,
    };
  });
}

