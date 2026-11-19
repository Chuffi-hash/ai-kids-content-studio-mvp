import { SceneContextItem, CharacterContextItem } from './story-context.service.js';

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

export class GenerationPromptService {
  /**
   * Builds a canonical, environment-only background plate prompt.
   * Strict Rule: Backgrounds NEVER render characters or living beings!
   */
  public static buildSceneBackgroundPrompt(
    story: { visualStyle?: string; aspectRatio?: string },
    scene: SceneContextItem,
    promptOverride?: string
  ): BackgroundPromptResult {
    const aspectRatio = scene.aspectRatio || story.aspectRatio || '16:9';
    const dims = getDimensionsForRatio(aspectRatio);

    if (promptOverride && promptOverride.trim().length > 0) {
      return {
        prompt: promptOverride.trim(),
        negativePrompt:
          'characters, people, humans, animals, living creatures, figures, faces, crowds, text, watermark, signature, blurry, low resolution',
        aspectRatio,
        width: dims.width,
        height: dims.height,
      };
    }

    const artStyle = story.visualStyle || 'vibrant children storybook illustration style, digital painting with clean linework, whimsical color palette';
    const camera = scene.cameraDirection || 'Eye-level wide shot';

    // Compose layered scenic environment description
    const sceneCues = [
      `Setting: ${scene.location}`,
      `Time: ${scene.timeOfDay}`,
      `Lighting: ${scene.lighting}`,
      `Atmosphere: ${scene.weather}`,
    ].join(', ');

    const coreEnvironment = scene.visualPrompt || scene.narration || scene.title;

    const prompt = [
      `Masterpiece children storybook environment plate of ${scene.title}.`,
      `Art Style: ${artStyle}.`,
      `Camera Perspective: ${camera}, wide scenic landscape with clear open foreground.`,
      `Environmental Details: ${coreEnvironment}.`,
      `Atmospheric conditions: ${sceneCues}.`,
      `STRICT INSTRUCTION: Environment only! Empty scenic background plate. Absolutely NO characters, NO humans, NO animals, NO figures, NO people, NO creatures of any kind in the scene. Pristine empty world ready for 2D character animation overlay.`,
    ].join(' ');

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

    const baseIdentity = [
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
          baseIdentity,
          `Full-body portrait, standing pose facing forward with a welcoming friendly expression.`,
          `Complete character design visible from head to toe. Centered in frame.`,
          `Background: Isolated on pure solid neutral off-white background with soft ground shadow. No scenery, no background clutter.`,
          `High consistency model sheet asset.`,
        ].join(' ');
        break;

      case 'turnaround': {
        const direction = variation || 'front view';
        prompt = [
          `Character turnaround reference of ${character.name} in ${direction}.`,
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
          `Expressive character facial sheet for ${character.name}.`,
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
          `Dynamic action character pose of ${character.name}.`,
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
