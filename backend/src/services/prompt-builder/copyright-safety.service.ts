/**
 * Copyright Safety Guardrails & Trademark Protection Service.
 * Detects known copyrighted character names, unlicensed brand trademarks,
 * and requests to reproduce living artists' exact styles.
 * Encourages original character concepts and ensures compliance with commercial rights.
 */

export interface CopyrightCheckResult {
  safe: boolean;
  warnings: string[];
  flaggedTerms: string[];
  sanitizedPrompt: string;
  originalPrompt: string;
  advice: string;
}

export const PROTECTED_FRANCHISE_TERMS = [
  'mickey mouse', 'donald duck', 'disney', 'pixar', 'marvel', 'spider-man',
  'iron man', 'avengers', 'batman', 'superman', 'dc comics', 'pokemon',
  'pikachu', 'charizard', 'nintendo', 'mario', 'luigi', 'zelda', 'sonic',
  'peppa pig', 'paw patrol', 'cocomelon', 'spongebob', 'minions', 'frozen',
  'elsa', 'star wars', 'baby yoda', 'harry potter', 'shrek', 'barbie',
  'lego', 'looney tunes', 'bugs bunny', 'winnie the pooh'
];

export const LIVING_ARTIST_STYLE_PATTERNS = [
  /\bin the style of ([a-z\s]+)/i,
  /\bby ([a-z\s]+) style\b/i,
  /\bartstation trending ([a-z\s]+)/i,
];

export class CopyrightSafetyService {
  /**
   * Scans a prompt for potential copyright / trademark infringements and style copycat requests.
   */
  public static inspectPrompt(prompt: string): CopyrightCheckResult {
    const originalPrompt = prompt || '';
    let sanitized = originalPrompt;
    const warnings: string[] = [];
    const flaggedTerms: string[] = [];
    const lower = originalPrompt.toLowerCase();

    // 1. Check known protected trademark character/franchise terms
    for (const term of PROTECTED_FRANCHISE_TERMS) {
      const regex = new RegExp(`\\b${term}\\b`, 'gi');
      if (regex.test(lower)) {
        flaggedTerms.push(term);
        warnings.push(`Protected trademark or franchise character detected: "${term}". Using third-party characters risks commercial rights violations and copyright strikes.`);
        // Replace with generic original character descriptor
        sanitized = sanitized.replace(regex, 'original storybook character');
      }
    }

    // 2. Check living artist emulation
    for (const pattern of LIVING_ARTIST_STYLE_PATTERNS) {
      const match = lower.match(pattern);
      if (match && match[1]) {
        const artist = match[1].trim();
        // Skip generic words
        if (!['masterpiece', 'oil', 'watercolor', 'classic', 'childrens', 'storybook'].includes(artist)) {
          warnings.push(`Living artist or creator emulation pattern detected: "${match[0]}". To protect originality and commercial rights, use descriptive style terms (e.g. "tactile gouache textures, soft volumetric light") instead of naming specific artists.`);
        }
      }
    }

    const safe = flaggedTerms.length === 0 && warnings.length === 0;

    return {
      safe,
      warnings,
      flaggedTerms,
      sanitizedPrompt: sanitized,
      originalPrompt,
      advice: safe
        ? 'Prompt is clean of known trademarked characters and living artist emulation.'
        : 'Adjust your prompt to use original character designs and descriptive artistic techniques for safe commercial publishing.',
    };
  }
}
