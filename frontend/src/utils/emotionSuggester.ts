import { FacialExpression, SpeakingEmotion } from '../types/animation';

export interface EmotionSuggestion {
  emotion: SpeakingEmotion;
  facialExpression: FacialExpression;
  confidence: number;
  rationale: string;
}

export const EMOTION_OPTIONS: Array<{
  id: SpeakingEmotion;
  label: string;
  emoji: string;
  desc: string;
}> = [
  { id: 'neutral', label: 'Neutral', emoji: '😐', desc: 'Standard resting delivery' },
  { id: 'happy', label: 'Happy', emoji: '😊', desc: 'Warm, cheerful cadence' },
  { id: 'excited', label: 'Excited', emoji: '🤩', desc: 'Upbeat, high energy' },
  { id: 'sad', label: 'Sad', emoji: '😢', desc: 'Slower, soft downcast tone' },
  { id: 'sleepy', label: 'Sleepy', emoji: '😴', desc: 'Drowsy, prolonged pauses' },
  { id: 'confused', label: 'Confused', emoji: '🤨', desc: 'Hesitant questioning' },
  { id: 'worried', label: 'Worried', emoji: '😟', desc: 'Apprehensive, nervous' },
  { id: 'curious', label: 'Curious', emoji: '🤔', desc: 'Inquiring, interested' },
  { id: 'calm', label: 'Calm', emoji: '😌', desc: 'Peaceful, measured pace' },
  { id: 'serious', label: 'Serious', emoji: '🧐', desc: 'Firm and deliberate' },
  { id: 'angry', label: 'Angry', emoji: '😠', desc: 'Crisp, elevated intensity' },
  { id: 'surprised', label: 'Surprised', emoji: '😲', desc: 'Breathless wonder' },
  { id: 'whispering', label: 'Whispering', emoji: '🤫', desc: 'Soft breathy whisper' },
  { id: 'shouting', label: 'Shouting', emoji: '📢', desc: 'Loud presence and punch' },
];

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

  // Fallback: Check exclamation mark -> Happy
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

