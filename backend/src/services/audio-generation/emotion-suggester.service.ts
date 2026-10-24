import { FacialExpression, SpeakingDirection } from '../animation/vector-animation.engine.js';

export type SpeakingEmotion =
  | 'neutral'
  | 'happy'
  | 'excited'
  | 'sad'
  | 'sleepy'
  | 'confused'
  | 'worried'
  | 'curious'
  | 'calm'
  | 'serious'
  | 'angry'
  | 'surprised'
  | 'whispering'
  | 'shouting';

export interface EmotionSuggestion {
  emotion: SpeakingEmotion;
  facialExpression: FacialExpression;
  confidence: number;
  rationale: string;
}

export interface EmotionDeliveryConfig {
  speedMultiplier: number;
  sentencePause: number;
  clausePause: number;
  pitchShiftSemitones?: number;
  presenceGainDb?: number;
  audioEffect?: 'normal' | 'robot' | 'cartoon' | 'whisper' | 'shout';
}

/**
 * Calibrated Kokoro speech delivery parameters per speaking emotion.
 */
export const EMOTION_DELIVERY_MAP: Record<SpeakingEmotion, EmotionDeliveryConfig> = {
  neutral: {
    speedMultiplier: 1.0,
    sentencePause: 0.25,
    clausePause: 0.10,
    pitchShiftSemitones: 0.0,
    presenceGainDb: 0.0,
    audioEffect: 'normal',
  },
  happy: {
    speedMultiplier: 1.10,
    sentencePause: 0.20,
    clausePause: 0.08,
    pitchShiftSemitones: 0.8,
    presenceGainDb: 1.8,
    audioEffect: 'normal',
  },
  excited: {
    speedMultiplier: 1.20,
    sentencePause: 0.15,
    clausePause: 0.06,
    pitchShiftSemitones: 1.2,
    presenceGainDb: 2.2,
    audioEffect: 'normal',
  },
  sad: {
    speedMultiplier: 0.85,
    sentencePause: 0.45,
    clausePause: 0.20,
    pitchShiftSemitones: -0.6,
    presenceGainDb: -1.2,
    audioEffect: 'normal',
  },
  sleepy: {
    speedMultiplier: 0.80,
    sentencePause: 0.55,
    clausePause: 0.25,
    pitchShiftSemitones: -0.8,
    presenceGainDb: -1.5,
    audioEffect: 'normal',
  },
  confused: {
    speedMultiplier: 0.92,
    sentencePause: 0.35,
    clausePause: 0.16,
    pitchShiftSemitones: 0.2,
    presenceGainDb: 0.0,
    audioEffect: 'normal',
  },
  worried: {
    speedMultiplier: 1.08,
    sentencePause: 0.22,
    clausePause: 0.12,
    pitchShiftSemitones: 0.3,
    presenceGainDb: 0.5,
    audioEffect: 'normal',
  },
  curious: {
    speedMultiplier: 1.05,
    sentencePause: 0.22,
    clausePause: 0.10,
    pitchShiftSemitones: 0.4,
    presenceGainDb: 1.0,
    audioEffect: 'normal',
  },
  calm: {
    speedMultiplier: 0.92,
    sentencePause: 0.32,
    clausePause: 0.14,
    pitchShiftSemitones: -0.2,
    presenceGainDb: -0.5,
    audioEffect: 'normal',
  },
  serious: {
    speedMultiplier: 0.90,
    sentencePause: 0.35,
    clausePause: 0.15,
    pitchShiftSemitones: -0.4,
    presenceGainDb: 0.0,
    audioEffect: 'normal',
  },
  angry: {
    speedMultiplier: 1.15,
    sentencePause: 0.18,
    clausePause: 0.08,
    pitchShiftSemitones: 0.5,
    presenceGainDb: 2.0,
    audioEffect: 'normal',
  },
  surprised: {
    speedMultiplier: 1.16,
    sentencePause: 0.16,
    clausePause: 0.07,
    pitchShiftSemitones: 1.0,
    presenceGainDb: 1.5,
    audioEffect: 'normal',
  },
  whispering: {
    speedMultiplier: 0.92,
    sentencePause: 0.30,
    clausePause: 0.14,
    pitchShiftSemitones: 0.0,
    presenceGainDb: 0.0,
    audioEffect: 'whisper',
  },
  shouting: {
    speedMultiplier: 1.18,
    sentencePause: 0.18,
    clausePause: 0.08,
    pitchShiftSemitones: 0.6,
    presenceGainDb: 2.5,
    audioEffect: 'shout',
  },
};

/**
 * Documented backward-compatible default intensity per emotion.
 * - Neutral: 0% (resting neutral baseline)
 * - Happy: 60% (acceptance-test default)
 * - All other expressive emotions: 50% (moderate expression)
 */
export const DEFAULT_EMOTION_INTENSITY: Record<SpeakingEmotion, number> = {
  neutral: 0,
  happy: 60,
  excited: 50,
  sad: 50,
  sleepy: 50,
  confused: 50,
  worried: 50,
  curious: 50,
  calm: 50,
  serious: 50,
  angry: 50,
  surprised: 50,
  whispering: 50,
  shouting: 50,
};

/**
 * Validates, normalizes, and clamps emotion intensity between 0 and 100%.
 * Missing, NaN, or non-finite values fall back to the documented emotion default.
 */
export function normalizeEmotionIntensity(
  rawIntensity: any,
  emotion: string = 'neutral'
): number {
  const normEmotion = (emotion || 'neutral').toLowerCase() as SpeakingEmotion;
  const defaultVal = DEFAULT_EMOTION_INTENSITY[normEmotion] ?? 50;

  if (rawIntensity === undefined || rawIntensity === null || rawIntensity === '') {
    return defaultVal;
  }

  const parsed = typeof rawIntensity === 'number' ? rawIntensity : parseFloat(String(rawIntensity));
  if (!Number.isFinite(parsed) || Number.isNaN(parsed)) {
    return defaultVal;
  }

  return Math.max(0, Math.min(100, Math.round(parsed)));
}

export interface CalculatedDelivery {
  intensity: number; // 0 - 100
  calibratedSpeed: number; // bounded [0.5, 2.0]
  sentencePause: number; // seconds
  clausePause: number; // seconds
  pitchShiftSemitones: number;
  presenceGainDb: number;
  effectiveEffect: 'normal' | 'robot' | 'cartoon' | 'whisper' | 'shout';
}

/**
 * Speech delivery adapter mapping speaking emotion and 0-100% intensity
 * to verified Kokoro TTS timing, pauses, prosody, and acoustic effects.
 */
export function calculateEmotionDelivery(options: {
  emotion?: string;
  intensity?: any;
  baseSpeed?: number;
  baseEffect?: 'normal' | 'robot' | 'cartoon' | 'whisper' | 'shout';
}): CalculatedDelivery {
  const emotion = ((options.emotion || 'neutral').toLowerCase() as SpeakingEmotion);
  const targetConfig = EMOTION_DELIVERY_MAP[emotion] || EMOTION_DELIVERY_MAP.neutral;
  const intensity = normalizeEmotionIntensity(options.intensity, emotion);
  const baseSpeed = typeof options.baseSpeed === 'number' && Number.isFinite(options.baseSpeed)
    ? options.baseSpeed
    : 1.0;
  const baseEffect = options.baseEffect || 'normal';

  // Normalized intensity factor t in [0.0, 1.0]
  const t = intensity / 100;

  // 1. Intensity 0: minimizes emotional influence (neutral baseline)
  if (intensity === 0 || emotion === 'neutral') {
    return {
      intensity,
      calibratedSpeed: Math.max(0.5, Math.min(2.0, baseSpeed)),
      sentencePause: 0.25,
      clausePause: 0.10,
      pitchShiftSemitones: 0,
      presenceGainDb: 0,
      effectiveEffect: baseEffect,
    };
  }

  // 2. Continuous linear interpolation between Neutral (t=0) and Full Emotion (t=1)
  const neutralConfig = EMOTION_DELIVERY_MAP.neutral;
  const speedMult = neutralConfig.speedMultiplier + t * (targetConfig.speedMultiplier - neutralConfig.speedMultiplier);
  const calibratedSpeed = Math.max(0.5, Math.min(2.0, Number((baseSpeed * speedMult).toFixed(3))));

  const sentencePause = Number(
    (neutralConfig.sentencePause + t * (targetConfig.sentencePause - neutralConfig.sentencePause)).toFixed(3)
  );
  const clausePause = Number(
    (neutralConfig.clausePause + t * (targetConfig.clausePause - neutralConfig.clausePause)).toFixed(3)
  );

  const pitchShiftSemitones = Number(((targetConfig.pitchShiftSemitones || 0) * t).toFixed(2));
  const presenceGainDb = Number(((targetConfig.presenceGainDb || 0) * t).toFixed(2));

  // If user selected a custom effect (e.g. robot or cartoon), that takes precedence.
  // Otherwise, if emotion specifies an effect (e.g. whisper, shout), apply it if intensity >= 25%.
  let effectiveEffect: 'normal' | 'robot' | 'cartoon' | 'whisper' | 'shout' = baseEffect;
  if (baseEffect === 'normal' && targetConfig.audioEffect && targetConfig.audioEffect !== 'normal') {
    if (intensity >= 25) {
      effectiveEffect = targetConfig.audioEffect;
    }
  }

  return {
    intensity,
    calibratedSpeed,
    sentencePause,
    clausePause,
    pitchShiftSemitones,
    presenceGainDb,
    effectiveEffect,
  };
}

/**
 * Maps speaking emotions to default natural facial expressions.
 */
export const EMOTION_TO_FACIAL_EXPRESSION: Record<SpeakingEmotion, FacialExpression> = {
  neutral: 'neutral',
  happy: 'happy',
  excited: 'happy',
  sad: 'sad',
  sleepy: 'neutral',
  confused: 'confused',
  worried: 'scared',
  curious: 'curious',
  calm: 'neutral',
  serious: 'angry',
  angry: 'angry',
  surprised: 'surprised',
  whispering: 'curious',
  shouting: 'angry',
};

/**
 * Suggests speaking emotion and matching facial expression from dialogue text.
 */
export function suggestEmotionForText(text: string): EmotionSuggestion {
  if (!text || text.trim().length === 0) {
    return {
      emotion: 'neutral',
      facialExpression: 'neutral',
      confidence: 0.5,
      rationale: 'Default resting tone for empty text',
    };
  }

  const raw = text.trim();
  const lower = raw.toLowerCase();

  // 1. Shouting: All Caps with multiple exclamation marks or loud exclamation
  if ((raw === raw.toUpperCase() && raw.length > 5 && /[A-Z]/.test(raw)) || /!!+/.test(raw) || /बचो|भागो|रुको/.test(raw)) {
    return {
      emotion: 'shouting',
      facialExpression: 'angry',
      confidence: 0.9,
      rationale: 'High intensity exclamation or capitalization',
    };
  }

  // 2. Whispering: shh, psst, quiet, secret, फुसफुसा, चुप
  if (/\b(shh|psst|quiet|whisper|secret|listen closely)\b/i.test(lower) || /चुप|फुसफुस|राज़|रहस्य|धीरे/.test(lower)) {
    return {
      emotion: 'whispering',
      facialExpression: 'curious',
      confidence: 0.9,
      rationale: 'Keywords indicate a quiet or secretive whisper',
    };
  }

  // 3. Sleepy: yawn, sleepy, tired, goodnight, bedtime, नींद, थका, सो जाओ, शुभरात्रि
  if (/\b(sleep|sleepy|yawn|tired|bedtime|goodnight|nap)\b/i.test(lower) || /नींद|थका|सोना|सो जाओ|शुभरात्रि|आराम/.test(lower)) {
    return {
      emotion: 'sleepy',
      facialExpression: 'neutral',
      confidence: 0.85,
      rationale: 'Sleep and fatigue cues detected',
    };
  }

  // 4. Surprised: wow, whoa, omg, incredible, unbelievable, अरे, वाह, क्या बात, ओहो
  if (/\b(wow|whoa|omg|unbelievable|astonishing|incredible|look at that)\b/i.test(lower) || /अरे|वाह|ओहो|चमत्कार|हैरान/.test(lower)) {
    return {
      emotion: 'surprised',
      facialExpression: 'surprised',
      confidence: 0.88,
      rationale: 'Exclamation of wonder or surprise',
    };
  }

  // 5. Excited: hurray, yay, awesome, can't wait, amazing, yayy, मज़ा, बधाई, शानदार
  if (/\b(yay|hurray|hooray|awesome|amazing|fantastic|can't wait|super)\b/i.test(lower) || /मज़ा|शानदार|बधाई|उत्सुक|खुशी/.test(lower)) {
    return {
      emotion: 'excited',
      facialExpression: 'happy',
      confidence: 0.88,
      rationale: 'Celebratory and enthusiastic vocabulary',
    };
  }

  // 6. Sad: sad, cry, tears, sorry, hurt, alone, miss, उदास, दुख, रोना, अकेला, दर्द
  if (/\b(sad|crying|tears|sorry|lonely|alone|heartbroken|hurt|miss you)\b/i.test(lower) || /उदास|दुख|रोना|अकेला|दर्द|माफ़|तकलीफ/.test(lower)) {
    return {
      emotion: 'sad',
      facialExpression: 'sad',
      confidence: 0.85,
      rationale: 'Sorrowful or regretful keywords',
    };
  }

  // 7. Angry: mad, furious, hate, stop it, how dare, गुस्सा, नाराज़, बंद करो, नफरत
  if (/\b(angry|mad|furious|hate|stop it|annoying|grr)\b/i.test(lower) || /गुस्सा|नाराज़|बंद करो|चुप रहो|धोखा/.test(lower)) {
    return {
      emotion: 'angry',
      facialExpression: 'angry',
      confidence: 0.85,
      rationale: 'Aggressive or agitated language',
    };
  }

  // 8. Worried: scared, afraid, worried, fear, danger, help, oh no, डर, चिंता, खतरा, बचाओ, हे भगवान
  if (/\b(scared|afraid|worry|worried|fear|danger|help|oh no|careful)\b/i.test(lower) || /डर|चिंता|खतरा|बचाओ|हे भगवान|सावधान/.test(lower)) {
    return {
      emotion: 'worried',
      facialExpression: 'scared',
      confidence: 0.85,
      rationale: 'Concern or apprehension keywords',
    };
  }

  // 9. Curious / Questioning: why, what, how, wonder, really, क्यों, क्या, कैसे, कहाँ, सोच
  if (lower.includes('?') || /\b(why|what|how|where|wonder|could it be|is it)\b/i.test(lower) || /क्यों|क्या|कैसे|कहाँ|सोचता|जानना/.test(lower)) {
    return {
      emotion: 'curious',
      facialExpression: 'curious',
      confidence: 0.82,
      rationale: 'Inquisitive syntax or question mark',
    };
  }

  // 10. Happy: smile, happy, glad, joy, love, friend, खुश, प्यार, दोस्त, मुस्कान, अच्छा
  if (/\b(happy|glad|joy|love|friend|smile|laugh|welcome|nice to meet)\b/i.test(lower) || /खुश|प्यार|दोस्त|मुस्कान|अच्छा|मित्र|स्वागत/.test(lower)) {
    return {
      emotion: 'happy',
      facialExpression: 'happy',
      confidence: 0.82,
      rationale: 'Affectionate or cheerful phrasing',
    };
  }

  // 11. Calm / Gentle: peace, breathe, calm, soft, quiet, शांति, आराम, धीरे, सौम्य
  if (/\b(calm|peace|breathe|relax|gentle|soothing)\b/i.test(lower) || /शांति|आराम|सुकून|सौम्य/.test(lower)) {
    return {
      emotion: 'calm',
      facialExpression: 'neutral',
      confidence: 0.80,
      rationale: 'Gentle or calming wording',
    };
  }

  // 12. Serious: important, remember, listen, duty, focus, ज़रूरी, ध्यान से, सुनो, कर्तव्य
  if (/\b(important|remember|listen|duty|must|serious|focus)\b/i.test(lower) || /ज़रूरी|महत्वपूर्ण|ध्यान|सुनो|कर्तव्य|याद रखना/.test(lower)) {
    return {
      emotion: 'serious',
      facialExpression: 'angry',
      confidence: 0.78,
      rationale: 'Emphasis on instruction or gravity',
    };
  }

  // Fallback: Check exclamation mark -> Happy / Excited
  if (lower.includes('!')) {
    return {
      emotion: 'happy',
      facialExpression: 'happy',
      confidence: 0.70,
      rationale: 'Exclamatory ending indicates upbeat energy',
    };
  }

  return {
    emotion: 'neutral',
    facialExpression: 'neutral',
    confidence: 0.65,
    rationale: 'Balanced natural conversational cadence',
  };
}

