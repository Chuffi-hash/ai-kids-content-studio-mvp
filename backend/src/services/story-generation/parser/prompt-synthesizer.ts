/**
 * Project Look DNA and Background Prompt Synthesizer.
 *
 * Attribution:
 * - Project Look DNA and Style Guide layering patterns adapted under Apache 2.0 License
 *   from ScriptBreak (Copyright (c) 2024 Sam Wasserman / Wasserman Productions).
 * - Tailored for AI Kids Content Studio to guarantee clean separation between static background
 *   imagery and separately animated 2D vector characters / particles.
 */

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
   * Synthesizes or normalizes a scene background image prompt.
   * If an explicit prompt exists in the script, it respects and preserves the user's prompt
   * while ensuring proper negative constraints (open foreground, no baked-in characters/text).
   */
  public static synthesizeBackgroundPrompt(options: {
    explicitPrompt?: string;
    sceneTitle: string;
    locationName?: string;
    timeOfDay?: string;
    look?: Partial<ProjectLookDNA>;
    bibles?: ProjectBibles;
  }): string {
    const { explicitPrompt, sceneTitle, locationName, timeOfDay = 'DAY', look, bibles } = options;
    const activeLook: ProjectLookDNA = { ...DEFAULT_PROJECT_LOOK, ...(look || {}) };

    // 1. If explicit prompt is present, preserve it!
    if (explicitPrompt && explicitPrompt.trim().length > 15) {
      let prompt = explicitPrompt.trim();
      // Ensure negative constraint is appended if missing
      if (!prompt.toLowerCase().includes('no characters')) {
        prompt += ' Environment only. Keep central foreground open for a separately animated character. No characters, text, captions, logos or watermarks.';
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
      `${todDesc}, ${activeLook.palette}.`,
      `Wide scenic backdrop with trees and scenic landmarks near the borders.`,
      `Keep the central foreground open and clean for a separately animated character.`,
      `Environment only. ${activeLook.avoid}`,
    ];

    return promptParts.join(' ');
  }

  /**
   * Creates initial project bibles from script title page and character declarations.
   */
  public static buildInitialBibles(options: {
    characters: Array<{ name: string; description?: string; role?: string; voice?: string }>;
    locations?: Array<{ name: string; desc?: string }>;
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
        desc: c.description || `Friendly animated character named ${c.name}`,
        voice: c.voice,
      };
    }

    if (Array.isArray(options.locations)) {
      for (const loc of options.locations) {
        bibles.locations[loc.name] = {
          name: loc.name,
          desc: loc.desc || `Scenic storybook environment: ${loc.name}`,
        };
      }
    }

    return bibles;
  }
}

