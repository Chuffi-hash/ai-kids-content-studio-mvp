import { MouthShape, VisemeCue } from '../types/animation';

/**
 * Maps a single character or digraph into one of the 5 standard mouth shapes.
 */
function charToViseme(ch: string, nextCh?: string): MouthShape {
  const c = ch.toLowerCase();
  const next = nextCh?.toLowerCase() || '';

  // Devanagari Hindi phonemes mapping
  // Bilabials & Labiodentals (lips closed): म, ब, भ, प, फ, व (ma, ba, bha, pa, pha, va)
  if (/[\u092A-\u092E\u0935]/.test(c)) {
    return 'closed';
  }
  // Rounded vowels & matras: उ, ऊ, ओ, औ, ु, ू, ो, ौ
  if (/[\u0909\u090A\u0913\u0914\u0941\u0942\u094B\u094C]/.test(c)) {
    return 'round';
  }
  // Wide front vowels & matras, and sibilants / dentals / affricates:
  // इ, ई, ए, ऐ, ि, ी, े, ै, स, श, ष, ज, झ, च, छ, त, थ, द, ध, न
  if (/[\u0907\u0908\u090F\u0910\u093F\u0940\u0947\u0948\u0938\u0936\u0937\u091C\u091D\u091A\u091B\u0924\u0925\u0926\u0927\u0928]/.test(c)) {
    return 'wide';
  }
  // Open vowels & matras: अ, आ, ा
  if (/[\u0905\u0906\u093E]/.test(c)) {
    return 'open';
  }
  // Other Devanagari consonants: open
  if (/[\u0900-\u097F]/.test(c)) {
    return 'open';
  }

  // English letters
  // Bilabial consonants (lips firmly shut)
  if (c === 'm' || c === 'b' || c === 'p') {
    return 'closed';
  }

  // Rounded vowels and labio-velar consonants
  if (c === 'o' || c === 'u' || c === 'w') {
    return 'round';
  }

  // Open open-jaw vowels
  if (c === 'a') {
    return 'open';
  }

  // Wide front vowels and dental/alveolar sibilants
  if (
    c === 'e' ||
    c === 'i' ||
    c === 'y' ||
    c === 's' ||
    c === 't' ||
    c === 'd' ||
    c === 'c' ||
    c === 'z' ||
    c === 'j'
  ) {
    return 'wide';
  }

  // Labiodental fricatives
  if (c === 'f' || c === 'v') {
    return 'closed';
  }

  // Default consonants (k, g, n, l, r, h)
  return 'open';
}

/**
 * Deterministically generates speech-driven lip-sync viseme cues from text and audio duration.
 */
export function generateVisemeCues(text: string, durationMs: number): VisemeCue[] {
  if (!text || text.trim().length === 0 || durationMs <= 50) {
    return [{ timeMs: 0, shape: 'rest', durationMs: Math.max(100, durationMs) }];
  }

  const cleanText = text
    .replace(/\[.*?\]/g, '')
    .replace(/\(.*?\)/g, '')
    .replace(/[*_#`~]/g, '')
    .trim();

  const words = cleanText.split(/\s+/).filter(Boolean);
  if (words.length === 0) {
    return [{ timeMs: 0, shape: 'rest', durationMs }];
  }

  // Build raw list of viseme states from syllables
  const rawShapes: MouthShape[] = [];

  for (let w = 0; w < words.length; w++) {
    const word = words[w];
    let lastShape: MouthShape | null = null;

    for (let i = 0; i < word.length; i++) {
      const char = word[i];
      if (!/[a-zA-Z\u0900-\u097F]/.test(char)) continue;

      const shape = charToViseme(char, word[i + 1]);
      // Avoid repetitive identical adjacent frames within a single syllable
      if (shape !== lastShape) {
        rawShapes.push(shape);
        lastShape = shape;
      }
    }

    // Inter-word short resting boundary or closed lip if followed by another word
    if (w < words.length - 1 && rawShapes[rawShapes.length - 1] !== 'closed') {
      if (word.endsWith(',') || word.endsWith('.') || word.endsWith('!') || word.endsWith('?')) {
        rawShapes.push('rest');
      } else {
        rawShapes.push('closed');
      }
    }
  }

  if (rawShapes.length === 0) {
    rawShapes.push('open', 'wide', 'round', 'closed');
  }

  // Allocate speech time across total audio duration with subtle attack/decay padding
  const leadPaddingMs = Math.min(60, Math.floor(durationMs * 0.04));
  const tailPaddingMs = Math.min(100, Math.floor(durationMs * 0.06));
  const activeDurationMs = Math.max(50, durationMs - leadPaddingMs - tailPaddingMs);

  const cues: VisemeCue[] = [];

  // Optional leading rest
  if (leadPaddingMs > 0) {
    cues.push({
      timeMs: 0,
      shape: 'rest',
      durationMs: leadPaddingMs,
    });
  }

  const rawWeights = rawShapes.map((shape) => {
    if (shape === 'open' || shape === 'round') return 1.25;
    if (shape === 'wide') return 1.1;
    if (shape === 'closed') return 0.8;
    return 0.7;
  });
  const totalWeight = rawWeights.reduce((sum, w) => sum + w, 0);

  let currentMs = leadPaddingMs;

  for (let i = 0; i < rawShapes.length; i++) {
    const shape = rawShapes[i];
    const weight = rawWeights[i];
    let slotMs: number;

    if (i === rawShapes.length - 1) {
      slotMs = Math.max(20, (leadPaddingMs + activeDurationMs) - currentMs);
    } else {
      slotMs = Math.max(20, Math.round((weight / totalWeight) * activeDurationMs));
      // Guard against overshooting before last element
      if (currentMs + slotMs > leadPaddingMs + activeDurationMs) {
        slotMs = Math.max(20, (leadPaddingMs + activeDurationMs) - currentMs);
      }
    }

    cues.push({
      timeMs: currentMs,
      shape,
      durationMs: slotMs,
    });

    currentMs += slotMs;
    if (currentMs >= leadPaddingMs + activeDurationMs) {
      break;
    }
  }

  // Trailing rest
  if (currentMs < durationMs) {
    cues.push({
      timeMs: currentMs,
      shape: 'rest',
      durationMs: durationMs - currentMs,
    });
  } else if (cues.length > 0 && cues[cues.length - 1].shape !== 'rest') {
    cues.push({
      timeMs: durationMs,
      shape: 'rest',
      durationMs: 50,
    });
  }

  return cues;
}

