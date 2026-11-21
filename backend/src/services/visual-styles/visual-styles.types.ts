/**
 * Visual Style Preset System and Compatibility Matrix.
 * Supports project-level visual styles, scene-level overrides,
 * structured style guidelines (rendering, lighting, textures, color palette,
 * environment detail, shapes, depth, atmosphere, visual treatment, background aesthetics),
 * and intelligent prompt synthesis.
 */

export type CanonicalVisualStyleId =
  | 'cinematic'
  | 'cartoon'
  | 'anime'
  | '3d_animation'
  | 'storybook_illustration'
  | 'stylized_realism'
  | 'fantasy_illustration'
  | 'watercolor'
  | 'pixel_art'
  | 'custom';

export type LegacyVisualStyleId =
  | '2d_cartoon'
  | 'storybook_illustrated'
  | '3d_animated'
  | '3d_pixar'
  | 'photorealistic'
  | 'claymation';

export type VisualStyleId = CanonicalVisualStyleId | LegacyVisualStyleId;

export type StyleIntensity = 'subtle' | 'balanced' | 'strong';

export type ColorPalettePreset =
  | 'warm'
  | 'cool'
  | 'vibrant'
  | 'pastel'
  | 'natural'
  | 'muted'
  | 'dark_dramatic'
  | 'custom';

export type SceneMoodPreset =
  | 'happy'
  | 'peaceful'
  | 'magical'
  | 'mysterious'
  | 'suspenseful'
  | 'dramatic'
  | 'emotional'
  | 'adventurous'
  | 'custom';

export type LightingPreset =
  | 'soft_daylight'
  | 'bright_daytime'
  | 'golden_hour'
  | 'sunset'
  | 'night'
  | 'moonlight'
  | 'dramatic_cinematic'
  | 'diffused'
  | 'custom';

export type BackgroundComplexity = 'simple' | 'balanced' | 'detailed';

export type CharacterSafeArea =
  | 'open_center'
  | 'open_left'
  | 'open_right'
  | 'open_foreground'
  | 'open_background'
  | 'custom';

export interface VisualStylePreset {
  id: VisualStyleId;
  name: string;
  description: string;
  rendering: string;
  lighting: string;
  texture: string;
  colorPalette: string;
  environmentDetail: string;
  shapes: string;
  depth: string;
  atmosphere: string;
  visualTreatment: string;
  backgroundAesthetics: string;
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

export interface ProjectVisualSettings {
  visualStyle: VisualStyleId;
  styleIntensity: StyleIntensity;
  colorPalette: ColorPalettePreset;
  customColorPalette?: string;
  defaultLighting: LightingPreset;
  customLighting?: string;
  backgroundComplexity: BackgroundComplexity;
  aspectRatio: '16:9' | '9:16' | '1:1' | '4:5';
  customStyleInstructions?: string;
}

export interface SceneVisualOverrides {
  visualStyle?: VisualStyleId;
  styleIntensity?: StyleIntensity;
  colorPalette?: ColorPalettePreset;
  customColorPalette?: string;
  mood?: SceneMoodPreset;
  customMood?: string;
  lighting?: LightingPreset;
  customLighting?: string;
  backgroundComplexity?: BackgroundComplexity;
  characterSafeArea?: CharacterSafeArea;
  customStagingArea?: string;
  customInstructions?: string;
  aspectRatio?: string;
}

export interface ResolvedVisualSettings {
  visualStyle: VisualStylePreset;
  isStyleOverridden: boolean;
  styleIntensity: StyleIntensity;
  isIntensityOverridden: boolean;
  colorPalette: ColorPalettePreset;
  customColorPalette?: string;
  isPaletteOverridden: boolean;
  mood: SceneMoodPreset;
  customMood?: string;
  isMoodAutoDetected: boolean;
  lighting: LightingPreset;
  customLighting?: string;
  isLightingOverridden: boolean;
  backgroundComplexity: BackgroundComplexity;
  isComplexityOverridden: boolean;
  characterSafeArea: CharacterSafeArea;
  customStagingArea?: string;
  isStagingOverridden: boolean;
  aspectRatio: string;
  customInstructions?: string;
}
