/**
 * Centralized Language and Voice Resolution Service
 *
 * Enforces the core studio rule:
 * "Hindi by default; English only when explicitly requested."
 *
 * Standardizes:
 * - Language resolution across scripts, scenes, characters, TTS, preview, and export.
 * - Canonical character voice mapping for Kokoro-82M and Google TTS.
 * - Language-voice compatibility validation (prevents English voice on Hindi text and vice versa).
 * - Safe failover handling (never silently falling back to English when Hindi synthesis fails).
 */

export type SupportedLanguage = 'hi' | 'en';

export interface LanguageResolutionInput {
  lang?: string | null;
  text?: string | null;
  projectLang?: string | null;
  characterLang?: string | null;
}

export interface CharacterVoiceProfile {
  characterIdOrName: string;
  hindiVoice: string;
  englishVoice: string;
  gender: 'female' | 'male' | 'neutral';
}

/**
 * Checks if a language identifier explicitly specifies English.
 */
export function isExplicitEnglish(lang?: string | null): boolean {
  if (!lang || typeof lang !== 'string') return false;
  const normalized = lang.trim().toLowerCase();
  return /^(en|en-us|en-gb|english|eng)$/i.test(normalized);
}

/**
 * Checks if a language identifier explicitly specifies Hindi.
 */
export function isExplicitHindi(lang?: string | null): boolean {
  if (!lang || typeof lang !== 'string') return false;
  const normalized = lang.trim().toLowerCase();
  return /^(hi|hi-in|hindi|hin)$/i.test(normalized);
}

/**
 * Checks if a text string contains Devanagari script characters.
 */
export function containsDevanagari(text?: string | null): boolean {
  if (!text || typeof text !== 'string') return false;
  return /[\u0900-\u097F]/.test(text);
}

/**
 * Centralized Language Resolution Function.
 *
 * Rules:
 * 1. If explicitly requested as English ('en', 'en-US', 'en-GB', 'english'), returns 'en'.
 * 2. If explicitly requested as Hindi ('hi', 'hi-IN', 'hindi'), returns 'hi'.
 * 3. If text contains Devanagari script, returns 'hi'.
 * 4. If projectLang is explicitly English and no local override specifies otherwise, returns 'en'.
 * 5. Default is ALWAYS 'hi'. Never infer English simply because language metadata is missing, null, or empty.
 */
export function resolveEffectiveLanguage(input?: LanguageResolutionInput | string | null): SupportedLanguage {
  if (!input) {
    return 'hi';
  }

  // Handle shorthand call where string is passed directly as lang
  if (typeof input === 'string') {
    if (isExplicitEnglish(input)) return 'en';
    if (isExplicitHindi(input)) return 'hi';
    return 'hi';
  }

  const { lang, text, projectLang, characterLang } = input;

  // 1. Direct dialogue / line language takes highest precedence if explicit
  if (isExplicitEnglish(lang)) return 'en';
  if (isExplicitHindi(lang)) return 'hi';

  // 2. Devanagari script in text is definitive proof of Hindi
  if (containsDevanagari(text)) return 'hi';

  // 3. Character-level language preference
  if (isExplicitEnglish(characterLang)) return 'en';
  if (isExplicitHindi(characterLang)) return 'hi';

  // 4. Project-level language
  if (isExplicitEnglish(projectLang)) return 'en';
  if (isExplicitHindi(projectLang)) return 'hi';

  // 5. Default everywhere: Hindi
  return 'hi';
}

/**
 * Normalizes language into standardized locale code for TTS providers.
 */
export function toTTSLanguageCode(
  lang: SupportedLanguage,
  provider: 'kokoro' | 'google' | 'fish_audio' | 'fish' | string = 'kokoro'
): string {
  if (provider === 'google') {
    // google-tts-api connects to Google Translate web endpoint which requires ISO 639-1 ('hi', 'en')
    return lang === 'hi' ? 'hi' : 'en';
  }
  if (provider === 'fish_audio' || provider === 'fish' || provider === 'fishaudio') {
    return lang;
  }
  return lang === 'hi' ? 'hi' : 'en-us';
}

/**
 * Known Kokoro Hindi voice IDs:
 * - hf_alpha: Female Hindi (warm, cheerful, motherly / Earth)
 * - hf_beta: Female Hindi (gentle, youthful / Maya / girl)
 * - hm_psi: Male Hindi (clear, energetic / Sparky / robot)
 * - hm_omega: Male Hindi (playful, friendly cub / Pip / Sammy)
 */
export const KOKORO_HINDI_VOICES = ['hf_alpha', 'hf_beta', 'hm_psi', 'hm_omega'] as const;

/**
 * Checks if a voice ID is a Kokoro-82M neural voice identifier.
 */
export function isKokoroVoice(voiceId?: string | null): boolean {
  if (!voiceId || typeof voiceId !== 'string') return false;
  const v = voiceId.toLowerCase().trim();
  return (
    v.startsWith('hf_') ||
    v.startsWith('hm_') ||
    v.startsWith('af_') ||
    v.startsWith('am_') ||
    v.startsWith('bf_') ||
    v.startsWith('bm_') ||
    v.startsWith('kokoro')
  );
}

/**
 * Checks whether a voice ID is valid for the specified language.
 */
export function isVoiceCompatibleWithLanguage(voiceId?: string | null, lang: SupportedLanguage = 'hi'): boolean {
  if (!voiceId || typeof voiceId !== 'string' || voiceId === 'default' || voiceId === 'fish_default') {
    return true; // Unspecified or Fish Audio default multilingual voice is compatible with both hi & en
  }

  const v = voiceId.toLowerCase().trim();

  // Fish Audio voice conventions
  if (v === 'fish_default') {
    return true;
  }
  // Generic custom reference ID (e.g. 24-36 hex characters) from Fish Audio model library
  if (/^[a-f0-9]{24,36}$/.test(v)) {
    return true;
  }

  if (lang === 'hi') {
    // Valid Hindi voices: starts with 'h' (Kokoro hf_*/hm_*) or 'hi' (Google hi-IN-*)
    return v.startsWith('h') || v.startsWith('hi');
  } else {
    // Valid English voices: starts with 'a' (Kokoro af_*/am_*), 'b' (Kokoro bf_*/bm_*), or 'en' (Google en-*)
    return v.startsWith('a') || v.startsWith('b') || v.startsWith('en');
  }
}

/**
 * Canonical Character Voice Profiles
 */
export const CANONICAL_CHARACTER_VOICES: CharacterVoiceProfile[] = [
  {
    characterIdOrName: 'earth',
    hindiVoice: 'hf_alpha',
    englishVoice: 'af_heart',
    gender: 'female',
  },
  {
    characterIdOrName: 'pip',
    hindiVoice: 'hm_omega',
    englishVoice: 'bm_george',
    gender: 'male',
  },
  {
    characterIdOrName: 'sammy',
    hindiVoice: 'hm_omega',
    englishVoice: 'am_adam',
    gender: 'male',
  },
  {
    characterIdOrName: 'maya',
    hindiVoice: 'hf_beta',
    englishVoice: 'af_bella',
    gender: 'female',
  },
  {
    characterIdOrName: 'sparky',
    hindiVoice: 'hm_psi',
    englishVoice: 'bm_lewis',
    gender: 'neutral',
  },
];

/**
 * Resolves the canonical default voice for a character name/species and target language.
 */
export function resolveCanonicalVoiceForCharacter(
  characterNameOrSpecies?: string | null,
  lang: SupportedLanguage = 'hi'
): string {
  const norm = (characterNameOrSpecies || '').toLowerCase().trim();

  // Match Earth / Terra / Planet / पृथ्वी / धरती
  if (
    norm.includes('earth') ||
    norm.includes('terra') ||
    norm.includes('planet') ||
    norm.includes('पृथ्वी') ||
    norm.includes('धरती')
  ) {
    return lang === 'hi' ? 'hf_alpha' : 'af_heart';
  }

  // Match Bear / Pip / भालू
  if (norm.includes('pip') || norm.includes('bear') || norm.includes('भालू')) {
    return lang === 'hi' ? 'hm_omega' : 'bm_george';
  }

  // Match Sammy / Kid Boy / बालक / लड़का
  if (norm.includes('sammy') || norm.includes('boy') || norm.includes('बालक') || norm.includes('लड़का')) {
    return lang === 'hi' ? 'hm_omega' : 'am_adam';
  }

  // Match Maya / Kid Girl / बालिका / लड़की
  if (
    norm.includes('maya') ||
    norm.includes('girl') ||
    norm.includes('बालिका') ||
    norm.includes('लड़की') ||
    norm.includes('aurat')
  ) {
    return lang === 'hi' ? 'hf_beta' : 'af_bella';
  }

  // Match Sparky / Robot / रोबोट
  if (norm.includes('sparky') || norm.includes('robot') || norm.includes('रोबोट')) {
    return lang === 'hi' ? 'hm_psi' : 'bm_lewis';
  }

  // Default fallbacks
  return lang === 'hi' ? 'hf_alpha' : 'af_heart';
}

/**
 * Resolves effective voice with strict language compatibility.
 * Never allows an English voice when effective language is Hindi.
 */
export function resolveEffectiveVoice(options: {
  requestedVoice?: string | null;
  characterName?: string | null;
  species?: string | null;
  lang: SupportedLanguage;
  provider?: string;
}): string {
  const { requestedVoice, characterName, species, lang, provider } = options;

  if (provider === 'google') {
    if (requestedVoice && isVoiceCompatibleWithLanguage(requestedVoice, lang)) {
      return requestedVoice;
    }
    return lang === 'hi' ? 'hi-IN-Standard' : 'en-US-Standard';
  }

  if (provider === 'fish_audio' || provider === 'fish' || provider === 'fishaudio') {
    if (requestedVoice && requestedVoice !== 'default') {
      // NEVER allow Kokoro voice IDs into Fish Audio
      if (isKokoroVoice(requestedVoice)) {
        console.warn(
          `[LanguageResolver] Kokoro voice "${requestedVoice}" is incompatible with Fish Audio. Resolving to "fish_default".`
        );
        return 'fish_default';
      }
      if (requestedVoice === 'fish_default') {
        return 'fish_default';
      }
      // Custom Fish Audio reference ID (hex format or verified custom ID)
      if (isVoiceCompatibleWithLanguage(requestedVoice, lang)) {
        return requestedVoice;
      }
      console.warn(
        `[LanguageResolver] Fish Audio voice "${requestedVoice}" is incompatible with target language "${lang}". Resolving to "fish_default".`
      );
    }
    return 'fish_default';
  }

  // Kokoro / default provider: NEVER allow Fish Audio voice IDs into Kokoro
  if (requestedVoice && (requestedVoice === 'fish_default' || requestedVoice.startsWith('fish_') || /^[a-f0-9]{24,36}$/i.test(requestedVoice))) {
    console.warn(
      `[LanguageResolver] Fish Audio voice "${requestedVoice}" is incompatible with Kokoro. Substituting canonical Kokoro voice.`
    );
    return resolveCanonicalVoiceForCharacter(characterName || species, lang);
  }

  // If a voice was requested, check compatibility
  if (requestedVoice && requestedVoice !== 'default') {
    if (isVoiceCompatibleWithLanguage(requestedVoice, lang)) {
      return requestedVoice;
    }
    console.warn(
      `[LanguageResolver] Voice "${requestedVoice}" is incompatible with target language "${lang}". Substituting canonical voice for language.`
    );
  }

  // Fallback to canonical voice for character/species in target language
  return resolveCanonicalVoiceForCharacter(characterName || species, lang);
}

