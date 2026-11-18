/**
 * Authoritative Speech Schedule Types & Engine (Remotion)
 *
 * Enforces unified speech timing across Simple Editor, Timeline, and Remotion.
 * Default standard values:
 * - INITIAL_PAUSE_MS = 250 (brief pause before speech starts)
 * - SPEECH_GAP_MS = 350 (gap between conversational turns)
 */

export const INITIAL_PAUSE_MS = 250;
export const SPEECH_GAP_MS = 350;

export interface ScheduledSpeechItem {
  id: string;
  type: 'narration' | 'dialogue';
  speakerId: string;
  speakerName: string;
  characterInstanceId?: string;
  startMs: number;
  durationMs: number;
  endMs: number;
  allowSimultaneous?: boolean;
  audioUrl?: string;
  isEstimate?: boolean;
}

export interface SpeechScheduleOverlap {
  item1Id: string;
  item1Speaker: string;
  item2Id: string;
  item2Speaker: string;
  overlapStartMs: number;
  overlapEndMs: number;
  overlapDurationMs: number;
  isIntentional: boolean;
}

export interface SceneSpeechSchedule {
  version: 1;
  initialPauseMs: number;
  speechGapMs: number;
  narrationStartMs: number;
  narrationDurationMs: number;
  items: ScheduledSpeechItem[];
  totalSpeechDurationMs: number;
  hasUnintendedOverlap: boolean;
  overlaps: SpeechScheduleOverlap[];
}

export interface CalculateScheduleInput {
  narration?: {
    text?: string;
    audioUrl?: string;
    durationMs?: number;
    startMs?: number;
    isEstimate?: boolean;
  } | null;
  dialogues: Array<{
    id?: string;
    characterId?: string;
    characterInstanceId?: string;
    characterName?: string;
    text?: string;
    audioUrl?: string;
    durationMs?: number;
    startMs?: number;
    allowSimultaneous?: boolean;
    isEstimate?: boolean;
  }>;
  initialPauseMs?: number;
  speechGapMs?: number;
}

export function calculateAuthoritativeSpeechSchedule(
  input: CalculateScheduleInput
): SceneSpeechSchedule {
  const initialPause = typeof input.initialPauseMs === 'number' ? input.initialPauseMs : INITIAL_PAUSE_MS;
  const gap = typeof input.speechGapMs === 'number' ? input.speechGapMs : SPEECH_GAP_MS;

  const items: ScheduledSpeechItem[] = [];

  let narrStartMs = initialPause;
  let narrDurationMs = 0;
  let narrEndMs = 0;

  if (input.narration && (input.narration.audioUrl || (input.narration.text && input.narration.text.trim().length > 0))) {
    narrStartMs = typeof input.narration.startMs === 'number' ? input.narration.startMs : initialPause;
    narrDurationMs = Math.max(0, input.narration.durationMs || 0);
    narrEndMs = narrStartMs + narrDurationMs;

    items.push({
      id: 'narration',
      type: 'narration',
      speakerId: 'narrator',
      speakerName: 'Narrator',
      startMs: narrStartMs,
      durationMs: narrDurationMs,
      endMs: narrEndMs,
      allowSimultaneous: false,
      audioUrl: input.narration.audioUrl,
      isEstimate: Boolean(input.narration.isEstimate),
    });
  }

  let currentCursorMs = narrEndMs > 0 ? narrEndMs + gap : initialPause;

  for (let i = 0; i < input.dialogues.length; i++) {
    const dlg = input.dialogues[i];
    const dlgId = dlg.id || `dlg-${i + 1}`;
    const duration = Math.max(0, dlg.durationMs || 0);

    let startMs: number;
    if (dlg.allowSimultaneous) {
      startMs = typeof dlg.startMs === 'number' ? Math.max(0, dlg.startMs) : currentCursorMs;
    } else {
      if (typeof dlg.startMs === 'number' && dlg.startMs >= currentCursorMs) {
        startMs = dlg.startMs;
      } else {
        startMs = currentCursorMs;
      }
      currentCursorMs = Math.max(currentCursorMs, startMs + duration + gap);
    }

    const endMs = startMs + duration;

    items.push({
      id: dlgId,
      type: 'dialogue',
      speakerId: dlg.characterId || 'unknown',
      speakerName: dlg.characterName || 'Character',
      characterInstanceId: dlg.characterInstanceId,
      startMs,
      durationMs: duration,
      endMs,
      allowSimultaneous: Boolean(dlg.allowSimultaneous),
      audioUrl: dlg.audioUrl,
      isEstimate: Boolean(dlg.isEstimate),
    });
  }

  const overlaps: SpeechScheduleOverlap[] = [];
  for (let a = 0; a < items.length; a++) {
    for (let b = a + 1; b < items.length; b++) {
      const item1 = items[a];
      const item2 = items[b];

      const overlapStart = Math.max(item1.startMs, item2.startMs);
      const overlapEnd = Math.min(item1.endMs, item2.endMs);

      if (overlapEnd > overlapStart) {
        const isIntentional = Boolean(item1.allowSimultaneous || item2.allowSimultaneous);
        overlaps.push({
          item1Id: item1.id,
          item1Speaker: item1.speakerName,
          item2Id: item2.id,
          item2Speaker: item2.speakerName,
          overlapStartMs: overlapStart,
          overlapEndMs: overlapEnd,
          overlapDurationMs: overlapEnd - overlapStart,
          isIntentional,
        });
      }
    }
  }

  const hasUnintendedOverlap = overlaps.some((o) => !o.isIntentional);
  const totalSpeechDurationMs = items.reduce((max, item) => Math.max(max, item.endMs), 0);

  return {
    version: 1,
    initialPauseMs: initialPause,
    speechGapMs: gap,
    narrationStartMs: narrStartMs,
    narrationDurationMs: narrDurationMs,
    items,
    totalSpeechDurationMs,
    hasUnintendedOverlap,
    overlaps,
  };
}
