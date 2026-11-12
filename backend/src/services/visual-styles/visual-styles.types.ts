/**
 * Visual Style Preset System and Compatibility Matrix.
 * Supports independent background and character art styles,
 * style guidelines (rendering, lighting, textures, color palette, negative prompts, composition),
 * and visual consistency recommendations.
 */

export type VisualStyleId =
  | '2d_cartoon'
  | 'storybook_illustrated'
  | '3d_animated'
  | '3d_pixar'
  | 'photorealistic'
  | 'cinematic'
  | 'anime'
  | 'watercolor'
  | 'claymation'
  | 'fantasy_illustration'
  | 'custom';

export interface VisualStylePreset {
  id: VisualStyleId;
  name: string;
  description: string;
  rendering: string;
  lighting: string;
  texture: string;
  colorPalette: string;
  negativePrompt: string;
  composition: string;
  tags: string[];
}

export type StyleCompatibilityLevel =
  | 'perfect'      // Seamless match (same style family)
  | 'harmonious'   // Stylistically compatible and pleasing blend
  | 'contrast'     // Deliberate artistic contrast (e.g. 2D vector on realistic photo)
  | 'clashing';    // Visually jarring or dissonant; warning advised

export interface StyleCompatibilityResult {
  backgroundStyle: string;
  characterStyle: string;
  matchLevel: StyleCompatibilityLevel;
  compatible: boolean;
  title: string;
  advice: string;
  warning?: string;
  suggestedAdjustments?: string[];
}
