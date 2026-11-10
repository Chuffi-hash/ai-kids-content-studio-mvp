/**
 * Reusable AI Image-Generation Prompt Templates for Character & Background Studios.
 * Matches Google Flow, Gemini, and Storybook Animation Studio specifications.
 */

export interface CharacterPromptOptions {
  name: string;
  species?: string;
  age?: string;
  gender?: string;
  visualDescription: string;
  clothing?: string;
  artStyle?: '2d_cartoon' | '3d_pixar' | 'storybook_illustrated' | 'anime_kids';
  transparentBackground?: boolean;
}

export interface BackgroundPromptOptions {
  environmentType: string; // e.g. 'lush green forest', 'cheerful village', 'cozy cottage room'
  details?: string;
  mood?: string;
  artStyle?: '2d_cartoon' | '3d_pixar' | 'storybook_illustrated';
}

export const PROMPT_STYLE_MODIFIERS: Record<string, string> = {
  '2d_cartoon': 'clean colorful 2D modern cartoon style, bold outlines, friendly appealing shapes, suitable for animation and rigging',
  '3d_pixar': '3D Pixar/Disney style animated children\'s character, soft cinematic lighting, smooth textures, vibrant appealing design',
  'storybook_illustrated': 'hand-illustrated classic storybook art style, soft gouache textures, warm inviting colors',
  'anime_kids': 'cute chibi-influenced anime kids style, expressive large eyes, clean cell shading',
};

/**
 * 1. Main Character Reference Prompt (Full-Body, Front View)
 */
export function buildCharacterReferencePrompt(opts: CharacterPromptOptions): string {
  const style = PROMPT_STYLE_MODIFIERS[opts.artStyle || '2d_cartoon'];
  const ageStr = opts.age ? `${opts.age} year old ` : '';
  const speciesStr = opts.species && opts.species.toLowerCase() !== 'human' ? `${opts.species} ` : '';
  const bgType = opts.transparentBackground
    ? 'clean white background (or transparent background)'
    : 'clean white background';

  return `Create a cute consistent children's story animation character named '${opts.name}'. A ${ageStr}${speciesStr}character with ${opts.visualDescription}. ${opts.clothing ? `Wearing ${opts.clothing}. ` : ''}Show the complete character from head to toe, full body, standing front view, neutral friendly pose, clearly visible facial features, ${style}, high quality, no text, no watermark, ${bgType}. Do not crop the character.`;
}

/**
 * 2. Character Turnaround Sheet Prompt (Multiple Angles: Front, 3/4, Side, Back)
 */
export function buildCharacterTurnaroundPrompt(opts: CharacterPromptOptions): string {
  const style = PROMPT_STYLE_MODIFIERS[opts.artStyle || '2d_cartoon'];
  return `Using the exact same character '${opts.name}' with identical face, hair, clothing and proportions, create a character turnaround sheet with front, 3/4 front, side, 3/4 back, and back views. Maintain consistent character height, clothing colors and style across all angles. ${style}, clean white background, no text, no watermark.`;
}

/**
 * 3. Character Expression Sheet Prompt (8 Distinct Expressions)
 */
export function buildCharacterExpressionPrompt(opts: CharacterPromptOptions): string {
  const style = PROMPT_STYLE_MODIFIERS[opts.artStyle || '2d_cartoon'];
  return `Create an expression sheet for the exact same character '${opts.name}' with 8 distinct facial expressions: happy, excited, surprised, sad, angry, thinking, confused, and laughing. Preserve the same face shape, eye color, hair, and clothing. Close-up headshots, ${style}, clearly distinguishable expressions, clean white background, no text, no watermark.`;
}

/**
 * 4. Character Action / Pose Sheet Prompt (8 Common Actions)
 */
export function buildCharacterPosePrompt(opts: CharacterPromptOptions): string {
  const style = PROMPT_STYLE_MODIFIERS[opts.artStyle || '2d_cartoon'];
  return `Create an action and pose sheet for the exact same character '${opts.name}' showing common animation actions: standing idle, walking, running, jumping, waving, pointing, sitting, and talking (hand gesture). Full body shots, maintain exact consistent proportions, clothing, and facial identity. ${style}, clean white background, no text, no watermark.`;
}

/**
 * 5. Scene Environment / Background Prompt (Strictly NO Characters, NO Text)
 */
export function buildSceneBackgroundPrompt(opts: BackgroundPromptOptions): string {
  const style = PROMPT_STYLE_MODIFIERS[opts.artStyle || 'storybook_illustrated'];
  const mood = opts.mood ? `, with a ${opts.mood} atmosphere` : '';
  const details = opts.details ? `. Details: ${opts.details}` : '';

  return `Create a high-quality illustrated children's story environment: a colorful, detailed ${opts.environmentType}${details}${mood}. Show a complete, visually rich environment with clear depth (foreground, middle ground, background). Leave enough clear space for animated characters to stand and move. ${style}, bright warm lighting. Strictly NO characters, NO people, NO animals, NO text, NO captions, NO logos, NO watermarks.`;
}
