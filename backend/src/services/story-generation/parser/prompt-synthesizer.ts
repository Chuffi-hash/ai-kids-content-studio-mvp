/**
 * Project Look DNA and Background Prompt Synthesizer.
 *
 * Attribution:
 * - Project Look DNA and Style Guide layering patterns adapted under Apache 2.0 License
 *   from ScriptBreak (Copyright (c) 2024 Sam Wasserman / Wasserman Productions).
 * - Tailored for AI Kids Content Studio to guarantee clean separation between static background
 *   imagery and separately animated 2D vector characters / particles.
 */

import { createHash } from 'crypto';
import { ProjectLookDNA, ProjectBibles, LocationBibleEntry } from './types.js';

export const DEFAULT_PROJECT_LOOK: ProjectLookDNA = {
  aspect: '9:16',
  format: 'Cinematic 3D storybook animation, Pixar / Disney render style',
  lensing: '35mm storybook prime lens, soft depth of field',
  framing: 'Vertical 9:16 composition, open central foreground for character animation',
  camera: 'Cinematic eye-level backdrop',
  lighting: 'Warm storybook ambient lighting, soft golden highlights',
  palette: 'Rich natural colors, vibrant cheerful hues',
  design: 'Curated children illustration with tactile textures and gentle curves',
  tone: 'Joyful, uplifting, inspiring, educational',
  avoid: 'No characters, people, figures, text, captions, subtitles, logos or watermarks. Backdrop only.',
};

export class PromptSynthesizer {
  /**
   * Generates a stable, collision-proof location ID for any language (Hindi, English, mixed).
   * Normalizes Unicode to NFC and produces a deterministic hash so repeated references
   * to the same location produce identical IDs, and different non-Latin locations never collide.
   */
  public static generateLocationId(name: string): string {
    const canonical = PromptSynthesizer.normalizeLocationName(name) || (name || '').normalize('NFC').trim() || 'default';
    const hash = createHash('sha256').update(canonical.toLowerCase()).digest('hex').slice(0, 10);
    const latinSlug = canonical.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 20);
    const prefix = latinSlug ? `loc_${latinSlug}` : 'loc_env';
    return `${prefix}_${hash}`;
  }

  /**
   * Formats camera perspective into a natural viewing direction clause.
   */
  public static formatCameraPerspective(cameraDirection?: string): string {
    if (!cameraDirection) return '';
    const cd = cameraDirection.trim();
    const lower = cd.toLowerCase();

    if (
      lower.includes("bird's eye") ||
      lower.includes("bird's-eye") ||
      (lower.includes('high') && lower.includes('angle'))
    ) {
      return "viewed from a high-angle bird's-eye perspective";
    }
    if (lower.includes('low') && lower.includes('angle')) {
      return 'viewed from a dramatic low-angle perspective looking upward';
    }
    if (lower.includes('eye') && lower.includes('level')) {
      return 'viewed from an eye-level wide perspective';
    }
    if (lower.includes('wide') || lower.includes('establishing')) {
      return 'viewed as a wide scenic establishing backdrop';
    }
    if (lower.includes('medium')) {
      return 'viewed from a balanced medium perspective';
    }
    if (lower.includes('close-up') || lower.includes('closeup') || lower.includes('close up')) {
      return 'viewed from an intimate close-up perspective';
    }
    if (lower.includes('shoulder')) {
      return 'viewed from an over-the-shoulder depth perspective';
    }
    return `viewed from a ${cd} perspective`;
  }

  /**
   * Formats aspect ratio into framing composition.
   */
  public static formatAspectRatio(aspectRatio?: string): string {
    if (!aspectRatio) return 'Vertical 9:16 composition';
    const lower = aspectRatio.toLowerCase();
    if (lower.includes('9:16') || lower.includes('portrait') || lower.includes('vertical')) {
      return 'Vertical 9:16 composition';
    }
    if (lower.includes('16:9') || lower.includes('landscape') || lower.includes('horizontal') || lower.includes('widescreen')) {
      return 'Cinematic 16:9 widescreen composition';
    }
    if (lower.includes('1:1') || lower.includes('square')) {
      return 'Square 1:1 composition';
    }
    if (lower.includes('4:5')) {
      return 'Vertical 4:5 social composition';
    }
    return 'Vertical 9:16 composition';
  }

  /**
   * Synthesizes or normalizes a scene background image prompt.
   * If an explicit prompt exists in the script, it respects and preserves the user's prompt
   * while ensuring proper negative constraints (open foreground, no baked-in characters/text)
   * and harmoniously composing camera perspective and project Look DNA.
   */
  public static synthesizeBackgroundPrompt(options: {
    explicitPrompt?: string;
    sceneTitle: string;
    locationName?: string;
    timeOfDay?: string;
    cameraDirection?: string;
    aspectRatio?: string;
    visualStyle?: string;
    look?: Partial<ProjectLookDNA>;
    bibles?: ProjectBibles;
  }): string {
    const {
      explicitPrompt,
      sceneTitle,
      locationName,
      timeOfDay = 'DAY',
      cameraDirection,
      aspectRatio,
      visualStyle,
      look,
      bibles,
    } = options;
    const activeLook: ProjectLookDNA = { ...DEFAULT_PROJECT_LOOK, ...(look || {}) };

    // 1. If explicit prompt is present, combine user prompt with Camera Perspective, Aspect Ratio, and Project Look DNA
    if (explicitPrompt && explicitPrompt.trim().length > 10) {
      let prompt = explicitPrompt.trim();

      // Clean previously synthesized tails to avoid stacking on regeneration
      prompt = prompt
        .replace(/\s*viewed (?:from|as) [^.,;]+ (?:perspective|backdrop)\.?/gi, '')
        .replace(/\s*(?:Cinematic 16:9 widescreen composition|Vertical 9:16 composition|Square 1:1 composition|Vertical 4:5 social composition)\.?/gi, '')
        .replace(/\s*Warm natural lighting and consistent project colour palette\.?/gi, '')
        .replace(/\s*Keep the central foreground open for separately animated characters\.?/gi, '')
        .replace(/\s*Environment only\.?/gi, '')
        .replace(/\s*No humans, characters, animals, text, captions, logos or watermarks\.?/gi, '')
        .replace(/\s*Backdrop only\.?/gi, '')
        .replace(/\s*No characters, people, figures[^.]*\.?/gi, '')
        .trim();

      const lower = prompt.toLowerCase();
      const additions: string[] = [];

      // Art style / format
      const effectiveFormat = visualStyle || activeLook.format || "Cinematic children's storybook animation";
      const hasStyle =
        lower.includes('pixar') ||
        lower.includes('disney') ||
        lower.includes('storybook animation') ||
        lower.includes('3d animation') ||
        lower.includes('illustration') ||
        lower.includes('render style');

      // Camera Direction / Perspective
      if (cameraDirection) {
        const perspectiveClause = PromptSynthesizer.formatCameraPerspective(cameraDirection);
        if (perspectiveClause) {
          if (!hasStyle && effectiveFormat) {
            additions.push(`${effectiveFormat}, ${perspectiveClause}`);
          } else {
            additions.push(perspectiveClause);
          }
        } else if (!hasStyle && effectiveFormat) {
          additions.push(effectiveFormat);
        }
      } else {
        if (!hasStyle && effectiveFormat) {
          additions.push(effectiveFormat);
        }
        if (
          activeLook.camera &&
          !lower.includes('camera') &&
          !lower.includes('eye-level') &&
          !lower.includes('eye level') &&
          !lower.includes('angle') &&
          !lower.includes('shot') &&
          !lower.includes('view') &&
          !lower.includes('backdrop')
        ) {
          additions.push(activeLook.camera);
        }
      }

      // Lens characteristics
      if (
        activeLook.lensing &&
        !lower.includes('lens') &&
        !lower.includes('prime') &&
        !lower.includes('depth of field') &&
        !lower.includes('focus')
      ) {
        additions.push(activeLook.lensing);
      }

      // Aspect Ratio & Framing & Composition
      const effectiveAspect = aspectRatio || activeLook.aspect;
      const aspectClause = PromptSynthesizer.formatAspectRatio(effectiveAspect);
      const hasAspectOrFraming =
        lower.includes('9:16') ||
        lower.includes('16:9') ||
        lower.includes('1:1') ||
        lower.includes('4:5') ||
        lower.includes('vertical') ||
        lower.includes('horizontal') ||
        lower.includes('widescreen');

      if (!hasAspectOrFraming && aspectClause) {
        additions.push(aspectClause);
      } else if (!hasAspectOrFraming && activeLook.framing) {
        additions.push(activeLook.framing);
      }

      // Lighting & Palette
      const hasLighting =
        lower.includes('lighting') ||
        lower.includes('sunlight') ||
        lower.includes('moonlight') ||
        lower.includes('illumination') ||
        lower.includes('ambient') ||
        lower.includes('धूप') ||
        lower.includes('रोशनी');

      const hasPalette =
        lower.includes('palette') ||
        lower.includes('colors') ||
        lower.includes('hues') ||
        lower.includes('tones') ||
        lower.includes('रंग');

      if (activeLook.lighting && !hasLighting) {
        additions.push(activeLook.lighting);
      }
      if (activeLook.palette && !hasPalette) {
        additions.push(activeLook.palette);
      }
      if (!look?.lighting && !look?.palette && (!hasLighting || !hasPalette)) {
        additions.push('Warm natural lighting and consistent project colour palette');
      }

      // Append Look DNA additions to user's explicit prompt
      if (additions.length > 0) {
        if (!/[.!?।]$/.test(prompt)) {
          prompt += '.';
        }
        prompt += ' ' + additions.map((s) => (s.endsWith('.') || s.endsWith('।') ? s : s + '.')).join(' ');
      }

      // Enforce environment-only negative constraints and open foreground
      if (!/[.!?।]$/.test(prompt)) {
        prompt += '.';
      }

      const hasForegroundNotice = prompt.toLowerCase().includes('open central foreground') || prompt.toLowerCase().includes('keep the central foreground open');
      if (!hasForegroundNotice) {
        prompt += ' Keep the central foreground open for separately animated characters.';
      }

      const hasEnvOnly = prompt.toLowerCase().includes('environment only');
      const negativeAvoid = activeLook.avoid || 'No humans, characters, animals, text, captions, logos or watermarks.';
      const hasNegativeAvoid =
        prompt.toLowerCase().includes('no characters') ||
        prompt.toLowerCase().includes('no humans') ||
        prompt.toLowerCase().includes('no people') ||
        prompt.toLowerCase().includes(negativeAvoid.toLowerCase());

      if (!hasEnvOnly && !hasNegativeAvoid) {
        prompt += ` Environment only. ${negativeAvoid}`;
      } else if (!hasEnvOnly) {
        prompt += ' Environment only.';
      } else if (!hasNegativeAvoid) {
        prompt += ` ${negativeAvoid}`;
      }

      return prompt;
    }

    // 2. Synthesize from location bible or scene title
    const location = locationName || sceneTitle;
    const locationDesc = bibles?.locations[location]?.desc || location;

    const todDesc = timeOfDay === 'NIGHT'
      ? 'peaceful night sky with soft moonlight'
      : (timeOfDay === 'GOLDEN_HOUR'
        ? 'warm golden hour sunlight with glowing highlights'
        : 'bright cheerful daylight');

    const promptParts = [
      `Create a cinematic 3D storybook illustration of ${locationDesc}.`,
      `${activeLook.format}.`,
      `${activeLook.camera}.`,
      `${activeLook.lensing}.`,
      `${todDesc}, ${activeLook.palette}.`,
      `${activeLook.framing}.`,
      `Wide scenic backdrop with trees and scenic landmarks near the borders.`,
      `Keep the central foreground open and clean for a separately animated character.`,
      `Environment only. ${activeLook.avoid}`,
    ];

    return promptParts.join(' ');
  }

  /**
   * Normalizes a raw location string or scene title to a canonical location name.
   */
  public static normalizeLocationName(name: string): string {
    return (name || '')
      .normalize('NFC')
      .replace(/^(?:Scene|दृश्य)\s*(?:\d+|[०-९]+)[:\s—–-]*/i, '')
      .replace(/\(.*?s.*?\)/i, '')
      .replace(/[-–]\s*(?:DAY|NIGHT|MORNING|EVENING|GOLDEN_HOUR|SUNSET|SUNRISE|दिन|रात|सुबह|शाम).*$/i, '')
      .trim();
  }

  /**
   * Creates initial project bibles from script title page and character declarations.
   */
  public static buildInitialBibles(options: {
    characters: Array<{ name: string; description?: string; role?: string; voice?: string; species?: string }>;
    locations?: Array<{ name: string; desc?: string; id?: string }>;
  }): ProjectBibles {
    const bibles: ProjectBibles = {
      characters: {},
      locations: {},
      props: {},
    };

    for (const c of options.characters) {
      bibles.characters[c.name] = {
        name: c.name,
        role: c.role || 'protagonist',
        species: c.species,
        desc: c.description || `Friendly animated character named ${c.name}`,
        voice: c.voice,
      };
    }

    if (Array.isArray(options.locations)) {
      for (const loc of options.locations) {
        const canonicalName = PromptSynthesizer.normalizeLocationName(loc.name) || loc.name;
        if (!bibles.locations[canonicalName]) {
          const locId = loc.id || PromptSynthesizer.generateLocationId(canonicalName);
          bibles.locations[canonicalName] = {
            id: locId,
            name: canonicalName,
            desc: loc.desc || `Scenic storybook environment: ${canonicalName}`,
          };
        }
      }
    }

    return bibles;
  }
}

