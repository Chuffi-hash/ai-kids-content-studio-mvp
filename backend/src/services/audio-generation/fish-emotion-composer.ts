/**
 * Restrained Fish Audio Emotion & Delivery Policy Composer
 *
 * Enforces the core product requirement:
 * "Natural, understandable children's storytelling voices - not exaggerated,
 * theatrical or excessively emotional voices."
 *
 * Rules:
 * 1. Default is neutral conversational speech without forced emotion tags.
 * 2. Subtle emotional delivery only when requested.
 * 3. Default intensity is 0.15 (15%).
 * 4. At most one restrained bracket tag per line.
 * 5. If intensity is below 0.15 or emotion is neutral, NO bracket tag is added.
 * 6. Never alter, transliterate, or corrupt Devanagari Hindi text.
 * 7. Never expose bracket tags to character spoken dialogue transcripts, subtitles, or visemes.
 */

export type RestrainedEmotion =
  | 'neutral'
  | 'happy'
  | 'cheerful'
  | 'warm'
  | 'sad'
  | 'excited'
  | 'curious'
  | 'surprised'
  | 'angry'
  | 'reassuring'
  | 'fearful'
  | 'worried'
  | 'whispering'
  | 'calm'
  | 'serious'
  | 'sleepy'
  | 'confused'
  | 'shouting';

/**
 * Restrained bracket direction tags supported by Fish Audio S2.1 models.
 * Uses gentle, controlled descriptors suitable for children's storytelling.
 */
export const FISH_DIRECTION_TAG_MAP: Record<RestrainedEmotion, string | null> = {
  neutral: null,
  happy: '[warm]',
  cheerful: '[cheerful]',
  warm: '[warm]',
  sad: '[soft]',
  excited: '[cheerful]',
  curious: '[inquisitive]',
  surprised: '[surprised]',
  angry: '[firm]',
  reassuring: '[reassuring]',
  fearful: '[tense]',
  worried: '[tense]',
  whispering: '[near-whisper]',
  calm: '[calm]',
  serious: '[firm]',
  sleepy: '[soft]',
  confused: '[inquisitive]',
  shouting: '[emphasis]',
};

/**
 * Default intensity for Fish Audio delivery is strictly 0.15 (15%).
 */
export const DEFAULT_FISH_INTENSITY = 0.15;

/**
 * Normalizes raw intensity input to a 0.0 - 1.0 floating point scale.
 * Supports both 0-100 percentage inputs and 0.0-1.0 decimal inputs.
 */
export function normalizeFishIntensity(raw?: number | string | null, emotion: string = 'neutral'): number {
  if (raw === undefined || raw === null || raw === '') {
    return emotion.toLowerCase() === 'neutral' ? 0.0 : DEFAULT_FISH_INTENSITY;
  }

  const parsed = typeof raw === 'number' ? raw : parseFloat(String(raw));
  if (!Number.isFinite(parsed) || Number.isNaN(parsed)) {
    return emotion.toLowerCase() === 'neutral' ? 0.0 : DEFAULT_FISH_INTENSITY;
  }

  // If input is on a 0-100 scale (e.g. 50, 15, 80)
  if (parsed > 1.0) {
    return Math.max(0.0, Math.min(1.0, Math.round(parsed) / 100));
  }

  return Math.max(0.0, Math.min(1.0, Math.round(parsed * 100) / 100));
}

/**
 * Strips bracket direction tags (e.g., `[warm]`, `[cheerful]`) and extraneous formatting
 * so that clean spoken text is used for visemes, subtitles, and UI dialogue display.
 */
export function stripDirectionTags(text: string): string {
  if (!text || typeof text !== 'string') return '';
  return text
    .replace(/\[\s*[\w\s-]+\s*\]/g, '') // remove bracket tags
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Composes the final text payload for Fish Audio synthesis with restrained bracket tag.
 *
 * Rules:
 * - If emotion is 'neutral', no tag is added.
 * - If intensity is < 0.15, no tag is added.
 * - Strips any pre-existing bracket tags from the text before prepending the new tag.
 * - Prepend at most ONE direction tag at the beginning of the text.
 * - Preserve exact Devanagari Hindi or English characters.
 */
export interface FishAudioComposeResult {
  synthesizedText: string;
  composedText: string;
  spokenText: string;
  appliedTag: string | null;
  intensity: number;
}

export function composeFishAudioText(
  textOrOptions: string | { text: string; emotion?: string | null; intensity?: number | string | null },
  maybeOptions?: { emotion?: string | null; intensity?: number | string | null }
): FishAudioComposeResult {
  let rawText = '';
  let rawEmotion: string | null | undefined = 'neutral';
  let rawIntensity: number | string | null | undefined = null;

  if (typeof textOrOptions === 'string') {
    rawText = textOrOptions;
    rawEmotion = maybeOptions?.emotion;
    rawIntensity = maybeOptions?.intensity;
  } else if (textOrOptions && typeof textOrOptions === 'object') {
    rawText = textOrOptions.text || '';
    rawEmotion = textOrOptions.emotion;
    rawIntensity = textOrOptions.intensity;
  }

  const spokenText = stripDirectionTags(rawText);

  if (!spokenText) {
    return {
      synthesizedText: '',
      composedText: '',
      spokenText: '',
      appliedTag: null,
      intensity: 0.0,
    };
  }

  const normalizedEmotion = (rawEmotion || 'neutral').toLowerCase().trim() as RestrainedEmotion;
  const intensity = normalizeFishIntensity(rawIntensity, normalizedEmotion);

  // Neutral or very low intensity (< 0.15) receives NO emotion tag
  if (normalizedEmotion === 'neutral' || intensity < DEFAULT_FISH_INTENSITY) {
    return {
      synthesizedText: spokenText,
      composedText: spokenText,
      spokenText,
      appliedTag: null,
      intensity,
    };
  }

  const candidateTag = FISH_DIRECTION_TAG_MAP[normalizedEmotion] || null;

  if (!candidateTag) {
    return {
      synthesizedText: spokenText,
      composedText: spokenText,
      spokenText,
      appliedTag: null,
      intensity,
    };
  }

  // Prepend exactly one restrained tag at the start of the line
  const synthesizedText = `${candidateTag} ${spokenText}`;

  return {
    synthesizedText,
    composedText: synthesizedText,
    spokenText,
    appliedTag: candidateTag,
    intensity,
  };
}

