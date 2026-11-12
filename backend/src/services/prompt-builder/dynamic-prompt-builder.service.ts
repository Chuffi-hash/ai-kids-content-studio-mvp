import { VisualStylesService } from '../visual-styles/visual-styles.service.js';
import { VisualStyleId, VisualStylePreset } from '../visual-styles/visual-styles.types.js';
import { CopyrightSafetyService, CopyrightCheckResult } from './copyright-safety.service.js';

export type BackgroundGenerationMode = 'environment_only' | 'complete_scene';

export interface DynamicBackgroundPromptOptions {
  mode?: BackgroundGenerationMode;
  environmentType: string;
  details?: string;
  mood?: string;
  styleId?: VisualStyleId | string;
  customStyleInstructions?: string;
  aspectRatio?: '16:9' | '9:16' | '1:1' | '4:5';
  cameraAngle?: string;
  lighting?: string;
  colorPalette?: string;
  visualBible?: any;
  characters?: Array<{
    name: string;
    species?: string;
    description?: string;
    action?: string;
  }>;
  sceneDescription?: string;
  narration?: string;
  referenceImageUrl?: string;
  provider?: string;
}

export interface DynamicCharacterPromptOptions {
  name: string;
  species?: string;
  age?: string;
  gender?: string;
  visualDescription: string;
  clothing?: string;
  styleId?: VisualStyleId | string;
  customStyleInstructions?: string;
  direction?: 'front' | 'front-left' | 'front-right' | 'left' | 'right' | 'back-left' | 'back-right' | 'back';
  action?: string;
  expression?: string;
  framing?: 'full_body' | 'medium_shot' | 'close_up' | 'turnaround';
  transparentBackground?: boolean;
  canonicalAppearanceReference?: string;
  referenceImageUrl?: string;
  provider?: string;
}

export interface GeneratedPromptResult {
  originalPrompt: string;
  generatedPrompt: string;
  negativePrompt: string;
  stylePreset: VisualStylePreset;
  aspectRatio: '16:9' | '9:16' | '1:1' | '4:5';
  copyrightCheck: CopyrightCheckResult;
  metadata: {
    mode: BackgroundGenerationMode | 'character';
    isCompleteSceneWithEmbeddedCharacters?: boolean;
    areCharactersIndependentlyAnimated?: boolean;
    disclaimer?: string;
    targetResolution: { width: number; height: number };
    providerTarget?: string;
  };
}

export class DynamicPromptBuilderService {
  /**
   * Builds an optimized background prompt incorporating visual style, composition,
   * aspect-ratio guidelines, and background mode (environment-only vs complete scene).
   */
  public static buildBackgroundPrompt(
    opts: DynamicBackgroundPromptOptions
  ): GeneratedPromptResult {
    const mode = opts.mode || 'environment_only';
    const stylePreset = VisualStylesService.getPreset(opts.styleId);
    const aspectRatio = opts.aspectRatio || '16:9';

    // Target dimensions
    let width = 1920;
    let height = 1080;
    if (aspectRatio === '9:16') {
      width = 1080;
      height = 1920;
    } else if (aspectRatio === '1:1') {
      width = 1080;
      height = 1080;
    } else if (aspectRatio === '4:5') {
      width = 1080;
      height = 1350;
    }

    // Format-specific composition framing instruction
    let formatInstruction = 'Wide landscape composition (16:9 aspect ratio, 1920x1080), expansive cinematic horizontal framing, wide ground plane for multiple characters.';
    if (aspectRatio === '9:16') {
      formatInstruction = 'Vertical portrait composition (9:16 aspect ratio, 1080x1920), tall vertical scenery suitable for reels and shorts, focal elements placed in the vertical safe action area (middle 60%), open space for character placement.';
    } else if (aspectRatio === '1:1') {
      formatInstruction = 'Balanced square composition (1:1 aspect ratio, 1080x1080), centered focal scenery with even margins and ground plane.';
    } else if (aspectRatio === '4:5') {
      formatInstruction = 'Vertical portrait composition (4:5 aspect ratio, 1080x1350), rich vertical scenery with balanced top and bottom margins.';
    }

    const moodStr = opts.mood ? `, atmosphere: ${opts.mood}` : '';
    const detailsStr = opts.details ? `. Environmental details: ${opts.details}` : '';
    const lightingStr = opts.lighting ? `. Lighting: ${opts.lighting}` : `. Lighting style: ${stylePreset.lighting}`;
    const paletteStr = opts.colorPalette ? `. Color palette: ${opts.colorPalette}` : `. Color palette: ${stylePreset.colorPalette}`;
    const customStyle = opts.customStyleInstructions ? ` ${opts.customStyleInstructions}` : '';

    let promptBody = '';
    let negativePrompt = stylePreset.negativePrompt;
    let isCompleteScene = false;
    let areCharactersIndependentlyAnimated = false;
    let disclaimer: string | undefined = undefined;

    if (mode === 'environment_only') {
      // Mode 1: Strict Environment-Only Plate
      promptBody = [
        `High-quality ${stylePreset.name} children's story environment: a rich, vibrant ${opts.environmentType}${detailsStr}${moodStr}.`,
        formatInstruction,
        `Art style characteristics: ${stylePreset.rendering}. Textures: ${stylePreset.texture}.${lightingStr}.${paletteStr}.${customStyle}`,
        'Show a complete, visually engaging environment with clear depth (foreground framing, open middleground staging, distant horizon).',
        'Leave clear open ground space for independent animated characters to stand and move without background visual obstructions.',
        'Strictly NO characters, NO people, NO animals, NO figures, NO silhouettes, NO text, NO watermarks.',
      ].filter(Boolean).join(' ');

      negativePrompt = [
        negativePrompt,
        'people, humans, characters, children, animals, figures, silhouettes, faces, text, words, watermark, logos, signature',
      ].filter(Boolean).join(', ');

      isCompleteScene = false;
      areCharactersIndependentlyAnimated = true;
    } else {
      // Mode 2: Complete AI Scene Generation (Characters embedded into the plate)
      const characterDesc = (opts.characters || []).map((c) => `${c.name} (${c.species || 'character'}, ${c.description || ''}${c.action ? `, ${c.action}` : ''})`).join('; ');
      promptBody = [
        `Complete illustrated children's story scene in ${stylePreset.name} style: ${opts.environmentType}${detailsStr}${moodStr}.`,
        formatInstruction,
        characterDesc ? `Characters featured directly in scene: ${characterDesc}.` : '',
        opts.sceneDescription ? `Scene action: ${opts.sceneDescription}.` : '',
        `Art style characteristics: ${stylePreset.rendering}. Textures: ${stylePreset.texture}.${lightingStr}.${paletteStr}.${customStyle}`,
        'High quality, balanced composition, no text, no captions, no watermark.',
      ].filter(Boolean).join(' ');

      negativePrompt = [
        negativePrompt,
        'text, watermark, logo, captions, low quality, blurry, deformed anatomy',
      ].filter(Boolean).join(', ');

      isCompleteScene = true;
      areCharactersIndependentlyAnimated = false;
      disclaimer = 'Characters embedded in this background image are non-independent visual elements and cannot be independently animated.';
    }

    const copyrightCheck = CopyrightSafetyService.inspectPrompt(promptBody);

    return {
      originalPrompt: promptBody,
      generatedPrompt: copyrightCheck.sanitizedPrompt,
      negativePrompt,
      stylePreset,
      aspectRatio,
      copyrightCheck,
      metadata: {
        mode,
        isCompleteSceneWithEmbeddedCharacters: isCompleteScene,
        areCharactersIndependentlyAnimated,
        disclaimer,
        targetResolution: { width, height },
        providerTarget: opts.provider,
      },
    };
  }

  /**
   * Builds an optimized character reference and view prompt.
   */
  public static buildCharacterPrompt(
    opts: DynamicCharacterPromptOptions
  ): GeneratedPromptResult {
    const stylePreset = VisualStylesService.getPreset(opts.styleId);
    const ageStr = opts.age ? `${opts.age} year old ` : '';
    const speciesStr = opts.species && opts.species.toLowerCase() !== 'human' ? `${opts.species} ` : '';
    const bgType = opts.transparentBackground
      ? 'clean transparent background (or pure solid white cutout background)'
      : 'clean white background';

    let viewInstruction = 'standing front view, neutral friendly pose, clearly visible facial features';
    if (opts.direction === 'back') {
      viewInstruction = 'facing directly away from camera, full rear view, back of head, hair seen from behind, strictly NO eyes, NO nose, NO mouth visible';
    } else if (opts.direction === 'back-left' || opts.direction === 'back-right') {
      viewInstruction = `facing rear three-quarter angle (${opts.direction}), back of head and shoulder prominent, strictly NO front facial features visible`;
    } else if (opts.direction === 'left' || opts.direction === 'right') {
      viewInstruction = `true side profile view facing ${opts.direction}, single profile eye, profile nose and mouth, clear silhouette, far eye hidden`;
    } else if (opts.direction === 'front-left' || opts.direction === 'front-right') {
      viewInstruction = `three-quarter view facing ${opts.direction}, both eyes visible with natural perspective angle`;
    }

    const framingStr = opts.framing === 'close_up'
      ? 'Close-up headshot portrait'
      : (opts.framing === 'medium_shot'
          ? 'Medium shot from waist up'
          : (opts.framing === 'turnaround'
              ? 'Complete character turnaround sheet showing front, 3/4, side and back views'
              : 'Show the complete character from head to toe, full body'));

    const actionStr = opts.action ? `, action: ${opts.action}` : '';
    const exprStr = opts.expression ? `, facial expression: ${opts.expression}` : '';
    const refStr = opts.canonicalAppearanceReference
      ? ` Strictly match canonical character reference: ${opts.canonicalAppearanceReference}.`
      : '';
    const customStyle = opts.customStyleInstructions ? ` ${opts.customStyleInstructions}` : '';

    const promptBody = [
      `Create an original consistent children's story animation character named '${opts.name}'.`,
      `A ${ageStr}${speciesStr}character with ${opts.visualDescription}.`,
      opts.clothing ? `Wearing ${opts.clothing}.` : '',
      `${framingStr}, ${viewInstruction}${actionStr}${exprStr}.`,
      `Art style: ${stylePreset.name} (${stylePreset.rendering}).`,
      `Textures: ${stylePreset.texture}. Color palette: ${stylePreset.colorPalette}.${customStyle}`,
      `High quality, crisp silhouette, ${bgType}.${refStr} Do not crop the character.`,
    ].filter(Boolean).join(' ');

    let negativePrompt = [
      stylePreset.negativePrompt,
      'cropped character, missing limbs, bad anatomy, duplicate character, text, watermark, logo, messy background',
    ].filter(Boolean).join(', ');

    if (opts.direction === 'back' || opts.direction === 'back-left' || opts.direction === 'back-right') {
      negativePrompt += ', eyes, mouth, nose, front face, smile, teeth, eyebrows';
    }

    const copyrightCheck = CopyrightSafetyService.inspectPrompt(promptBody);

    return {
      originalPrompt: promptBody,
      generatedPrompt: copyrightCheck.sanitizedPrompt,
      negativePrompt,
      stylePreset,
      aspectRatio: '1:1',
      copyrightCheck,
      metadata: {
        mode: 'character',
        isCompleteSceneWithEmbeddedCharacters: false,
        areCharactersIndependentlyAnimated: true,
        targetResolution: { width: 1024, height: 1024 },
        providerTarget: opts.provider,
      },
    };
  }
}
