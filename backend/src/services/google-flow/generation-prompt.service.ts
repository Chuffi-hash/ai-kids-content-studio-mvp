import { SceneContextItem, CharacterContextItem } from './story-context.service.js';
import { VisualStylesService } from '../visual-styles/visual-styles.service.js';

export interface BackgroundPromptResult {
  prompt: string;
  negativePrompt: string;
  aspectRatio: string;
  width: number;
  height: number;
}

export interface CharacterPromptResult {
  prompt: string;
  negativePrompt: string;
  aspectRatio: string;
  width: number;
  height: number;
  referenceImageUrl?: string | null;
}

export type ImageStylePreset =
  | 'cinematic_storybook_balanced'
  | 'illustrated_2d'
  | 'stylized_3d'
  | 'photorealistic';

export function buildBackgroundStyleDirective(stylePreset: ImageStylePreset): string {
  if (stylePreset === 'illustrated_2d') {
    return 'Warm storybook 2D hand-painted illustration with charming storybook textures and clean outlines.';
  } else if (stylePreset === 'stylized_3d') {
    return 'Tastefully stylized animated storybook 3D environment with gentle tactile textures.';
  } else if (stylePreset === 'photorealistic') {
    return 'Cinematic natural realism with believable lighting and environmental depth.';
  }
  return 'Moderately stylized illustrated realism with subtle 3D depth, natural proportions, softly painterly surfaces and believable environmental detail.';
}

export function normalizeBackgroundDescription(rawPrompt: string): string {
  return cleanVisualPrompt(rawPrompt);
}

export function cleanVisualPrompt(raw: string): string {
  if (!raw || typeof raw !== 'string') return '';
  let cleaned = raw
    // Strip aspect ratio directives and dimensions
    .replace(/--ar\s+[0-9:]+/gi, '')
    .replace(/(?:Vertical\s+)?(?:9:16|16:9|4:3|1:1)\s*(?:composition|aspect\s*ratio)?/gi, '')
    .replace(/aspect\s*ratio\s*[0-9:]+/gi, '')
    // Strip Pixar/Disney render style and CGI buzzwords
    .replace(/Pixar\s*(?:\/|and)?\s*Disney\s*(?:animated\s*)?render\s*style\.?/gi, '')
    .replace(/High-end\s*3D\s*CGI\s*rendering\s*with\s*soft\s*subsurface\s*scattering[^.]*\./gi, '')
    .replace(/Cinematic\s*3D\s*storybook\s*animation,?\s*/gi, '')
    .replace(/35mm\s*storybook\s*prime\s*lens,?\s*soft\s*depth\s*of\s*field,?\s*/gi, '')
    // Strip redundant "Environment only", "No characters", etc.
    .replace(/STRICT\s*INSTRUCTION:?[^.]*\./gi, '')
    .replace(/Environment\s*only\.?[^.]*\./gi, '')
    .replace(/Backdrop\s*only\.?/gi, '')
    .replace(/Pristine\s*empty\s*world[^.]*\./gi, '')
    .replace(/Keep\s*the\s*central\s*foreground\s*open[^.]*\./gi, '')
    .replace(/Open\s*foreground\s*and\s*middleground\s*space[^.]*\./gi, '')
    .replace(/No\s*(?:characters|people|humans|figures|animals|creatures|watermarks|logos)[^.]*\./gi, '')
    .replace(/[*_#"`]/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim();

  return cleaned;
}

export class GenerationPromptService {
  /**
   * Builds a canonical, environment-only background plate prompt.
   * Strict Rule: Backgrounds NEVER render characters or living beings!
   */
  public static buildSceneBackgroundPrompt(
    story: { visualStyle?: string; aspectRatio?: string },
    scene: SceneContextItem,
    promptOverride?: string,
    stylePreset: ImageStylePreset = 'cinematic_storybook_balanced'
  ): BackgroundPromptResult {
    const aspectRatio = scene.aspectRatio || story.aspectRatio || '16:9';
    const dims = getDimensionsForRatio(aspectRatio);

    const sceneDescription = normalizeBackgroundDescription(
      promptOverride || scene.visualPrompt || scene.narration || scene.title || 'the scene'
    );

    const preset = VisualStylesService.getPreset(story.visualStyle || stylePreset);
    const style = preset
      ? `${preset.name} visual style. ${preset.rendering}. ${preset.texture}.`
      : buildBackgroundStyleDirective(stylePreset);

    const sceneCues = [
      scene.location ? `Setting: ${scene.location}` : '',
      scene.timeOfDay ? `Time: ${scene.timeOfDay}` : '',
      scene.lighting ? `Lighting: ${scene.lighting}` : '',
      scene.weather ? `Weather: ${scene.weather}` : '',
      scene.cameraDirection ? `Camera: ${scene.cameraDirection}` : 'Camera: Eye-level wide establishing shot',
    ].filter(Boolean).join('. ');

    const prompt = [
      `Create one premium cinematic storybook environment illustration of ${scene.title || scene.location || 'the scene'}.`,
      `Style: ${style}`,
      sceneDescription ? `Scene: ${sceneDescription}.` : '',
      sceneCues ? `Atmospheric conditions: ${sceneCues}.` : '',
      `Format: Exactly one environment-only landscape image in ${aspectRatio} aspect ratio.`,
      `Composition: Wide scenic backdrop with open central foreground reserved for character staging.`,
      `STRICT INSTRUCTION: Environment only! Empty scenic background plate. Absolutely NO characters, NO humans, NO animals, NO figures, NO faces, NO text, NO captions, NO logos, NO watermarks.`,
      `Keep foreground and central areas suitable for independently animated characters.`
    ].filter(Boolean).join(' ');

    const negativePrompt =
      'characters, people, humans, animals, pets, creatures, person, boy, girl, man, woman, bird, owl, bear, rabbit, figures, silhouettes, faces, hands, text, letters, watermark, signature, artist name, borders, cropped, blurry, low quality, oversaturated noise';

    return {
      prompt,
      negativePrompt,
      aspectRatio,
      width: dims.width,
      height: dims.height,
    };
  }

  /**
   * Builds a canonical character prompt (Master Reference, Turnaround, Expression, or Pose).
   */
  public static buildCharacterPrompt(
    story: { visualStyle?: string },
    character: CharacterContextItem,
    assetType: 'master_reference' | 'turnaround' | 'expression' | 'pose',
    options?: {
      variation?: string;
      promptOverride?: string;
    }
  ): CharacterPromptResult {
    const artStyle = story.visualStyle || 'whimsical children book 2D cartoon illustration, soft cell shading, clean crisp outlines';
    const dims = { width: 1024, height: 1024 }; // 1:1 square for character assets

    if (options?.promptOverride && options.promptOverride.trim().length > 0) {
      return {
        prompt: options.promptOverride.trim(),
        negativePrompt: 'complex background, background scenery, multiple characters, text, watermark, blurry',
        aspectRatio: '1:1',
        width: dims.width,
        height: dims.height,
        referenceImageUrl: character.referenceImageUrl,
      };
    }

    const hasFlowMapping = Boolean(
      character.flowMapping &&
      character.flowMapping.syncStatus === 'synced' &&
      character.flowMapping.flowCharacterName
    );
    const flowTag = hasFlowMapping ? `@${character.flowMapping!.flowCharacterName}` : character.name;

    const baseIdentity = hasFlowMapping
      ? `Using character model reference ${flowTag}.`
      : [
          `Character: ${character.name}`,
          `Species: ${character.species}`,
          `Personality: ${character.personality}`,
          `Appearance: ${character.visualDescription}`,
          `Clothing & Features: ${character.clothing || character.distinctiveFeatures || 'Standard storybook attire'}`,
        ].join('. ');

    let prompt = '';
    const variation = options?.variation || '';

    switch (assetType) {
      case 'master_reference':
        prompt = [
          `Master canonical character reference sheet for ${character.name}.`,
          `Art Style: ${artStyle}.`,
          [
            `Character: ${character.name}`,
            `Species: ${character.species}`,
            `Personality: ${character.personality}`,
            `Appearance: ${character.visualDescription}`,
            `Clothing & Features: ${character.clothing || character.distinctiveFeatures || 'Standard storybook attire'}`,
          ].join('. '),
          `Full-body portrait, standing pose facing forward with a welcoming friendly expression.`,
          `Complete character design visible from head to toe. Centered in frame.`,
          `Background: Isolated on pure solid neutral off-white background with soft ground shadow. No scenery, no background clutter.`,
          `High consistency model sheet asset.`,
        ].join(' ');
        break;

      case 'turnaround': {
        const direction = variation || 'front view';
        prompt = [
          `Character turnaround reference of ${flowTag} in ${direction}.`,
          `Art Style: ${artStyle}.`,
          baseIdentity,
          `Directional view: ${direction}. Consistent character proportions, clothing, and colors exactly matching the master reference.`,
          `Full body standing pose, centered in frame.`,
          `Background: Pure solid clean neutral studio background, no environment.`,
        ].join(' ');
        break;
      }

      case 'expression': {
        const expr = variation || 'happy and smiling';
        prompt = [
          `Expressive character facial sheet for ${flowTag}.`,
          `Art Style: ${artStyle}.`,
          baseIdentity,
          `Facial emotion: ${expr}. Expressive, animated children storybook expression while strictly maintaining identical face shape, eyes, and character features.`,
          `Close-up bust portrait, centered.`,
          `Background: Solid clean neutral studio background.`,
        ].join(' ');
        break;
      }

      case 'pose': {
        const actionPose = variation || 'waving hand and greeting';
        prompt = [
          `Dynamic action character pose of ${flowTag}.`,
          `Art Style: ${artStyle}.`,
          baseIdentity,
          `Full-body action pose: ${actionPose}. Dynamic gesture suitable for 2D animation, maintaining exact character design, attire, and colors.`,
          `Full body, centered in frame.`,
          `Background: Solid clean neutral studio background with soft drop shadow.`,
        ].join(' ');
        break;
      }
    }

    const negativePrompt =
      'detailed background, scenery, forest, room, trees, furniture, multiple characters, extra limbs, distorted anatomy, disfigured face, mutated hands, text, watermark, signature, blurry, grain, dark moody lighting';

    return {
      prompt,
      negativePrompt,
      aspectRatio: '1:1',
      width: dims.width,
      height: dims.height,
      referenceImageUrl: character.referenceImageUrl,
    };
  }
}

function getDimensionsForRatio(ratio: string): { width: number; height: number } {
  const clean = ratio.trim().toLowerCase();
  if (clean === '9:16' || clean.includes('portrait') || clean.includes('vertical')) {
    return { width: 576, height: 1024 };
  }
  if (clean === '1:1' || clean.includes('square')) {
    return { width: 1024, height: 1024 };
  }
  if (clean === '4:5') {
    return { width: 819, height: 1024 };
  }
  return { width: 1024, height: 576 }; // 16:9 default
}
