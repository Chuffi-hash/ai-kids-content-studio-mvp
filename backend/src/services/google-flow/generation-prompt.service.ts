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
    const artStyle =
      story.visualStyle ||
      'whimsical children book 2D cartoon illustration, soft cell shading, clean crisp outlines';
    const dimensions = { width: 1024, height: 1024 };
    const identityDescription = [
      `Species: ${character.species || 'character'}`,
      `Appearance: ${character.visualDescription || 'Use the supplied canonical character reference'}`,
      `Clothing and distinctive features: ${character.clothing || character.distinctiveFeatures || 'Preserve the established outfit and accessories'}`,
    ].join('\n');

    const flowReferenceName =
      character.flowMapping?.syncStatus === 'synced' &&
      character.flowMapping.flowCharacterId
        ? character.flowMapping.flowCharacterName
        : null;
    const identitySource = flowReferenceName
      ? `Use the saved Google Flow character identity @${flowReferenceName} as the only subject. Match that saved character exactly. Do not create a new design.`
      : `Use the following visual identity details as generation guidance only. Do not render these words in the artwork:\n${identityDescription}`;

    const commonRestrictions = [
      'Create exactly ONE image of ONE character.',
      'The character name is application metadata only. Never write the name inside the image.',
      'No text, letters, numbers, typography, title, heading, labels, captions, callouts, annotations, speech bubbles, logos, signatures, watermarks, borders, panels, grids, contact sheets, collages, model sheets, or multiple views.',
      'Keep the complete character visible from head to toe, with comfortable space around the silhouette. Do not crop the head, hands, feet, hair, clothing, or accessories.',
      'Use a simple, uniform, neutral studio background with no environment, props, scenery, furniture, or decorative objects.',
      `Art direction: ${artStyle}.`,
    ];

    if (options?.promptOverride && options.promptOverride.trim().length > 0) {
      const prompt = [
        'CHARACTER IMAGE TASK',
        options.promptOverride.trim(),
        'OUTPUT RULES',
        ...commonRestrictions,
      ].join('\n\n');
      return {
        prompt,
        negativePrompt: [
          'text, letters, words, names, typography, titles, labels, annotations, watermark, logo, signature',
          'character sheet, turnaround sheet, contact sheet, collage, panels, grid, multiple views, extra characters',
          'complex background, background scenery, cropped body, blurry image, low quality, extra limbs, distorted anatomy',
        ].join(', '),
        aspectRatio: '1:1',
        width: dimensions.width,
        height: dimensions.height,
        referenceImageUrl: character.referenceImageUrl,
      };
    }

    const variation = String(options?.variation || '').trim();
    const directionalViews: Record<string, string> = {
      front: 'front-facing view, chest and hips facing the camera, face looking directly forward',
      'front-left': 'front three-quarter view, torso and face turned approximately 45 degrees toward the character’s left',
      'front-right': 'front three-quarter view, torso and face turned approximately 45 degrees toward the character’s right',
      left: 'true left side profile, body facing left at 90 degrees, show the side silhouette clearly',
      right: 'true right side profile, body facing right at 90 degrees, show the side silhouette clearly',
      'back-left': 'rear three-quarter view, body turned approximately 135 degrees away from the front toward the character’s left',
      'back-right': 'rear three-quarter view, body turned approximately 135 degrees away from the front toward the character’s right',
      back: 'full rear view, back facing the camera, show the back of the outfit and hairstyle',
    };

    const parts: string[] = [
      'CHARACTER IMAGE TASK',
      identitySource,
      `Visual style: ${artStyle}.`,
    ];

    switch (assetType) {
      case 'master_reference':
        parts.push(
          'Create one canonical full-body character reference illustration. This is a single portrait image, not a sheet or page layout.',
          'View: straight-on front view. Pose: relaxed neutral standing pose, arms slightly separated from the torso, both feet visible and balanced.',
          'Expression: friendly, calm, and readable. Use the exact design described above.',
          'Make the face, hair, body proportions, outfit, colors, shoes, and distinctive accessories clear enough to reuse as the visual identity anchor.'
        );
        break;

      case 'turnaround': {
        const direction = directionalViews[variation] || directionalViews.front;
        parts.push(
          'Create one standalone directional reference image of the existing character. Generate only the requested camera angle in this image; never place several angles together.',
          `Requested view: ${direction}.`,
          'Keep the same face identity, head and body proportions, hairstyle, skin/fur/feather colors, clothing, patterns, shoes, accessories, and illustration style as the canonical master reference.',
          'Use the same neutral standing pose and full-body framing for every direction so the images can be switched between one another in the character preview and used as individual animation references.'
        );
        break;
      }

      case 'expression': {
        const expression = variation || 'happy and smiling';
        parts.push(
          'Create one standalone head-and-shoulders character expression portrait, not an expression sheet.',
          `Expression to show: ${expression}.`,
          'Keep the same face shape, eye design, hairstyle, colors, and character identity. Only the facial expression may change.'
        );
        break;
      }

      case 'pose': {
        const action = variation || 'standing naturally';
        parts.push(
          'Create one standalone full-body character pose illustration, not a pose sheet.',
          `Action or pose to show: ${action}.`,
          'Keep the same character identity, anatomy, outfit, colors, and distinctive features. Change only the body pose/action.'
        );
        break;
      }
    }

    parts.push('OUTPUT RULES', ...commonRestrictions);

    const negativePrompt = [
      'text, letters, words, character name, title, heading, label, caption, typography, watermark, logo, signature, annotation',
      'character sheet, turnaround sheet, model sheet, contact sheet, expression sheet, pose sheet, collage, grid, panels, multiple views',
      'multiple characters, extra people, scenery, detailed background, furniture, props, border',
      'cropped head, cropped hands, cropped feet, cropped body, extra limbs, distorted face, deformed anatomy, blurry, low resolution',
    ].join(', ');

    return {
      prompt: parts.join('\n\n'),
      negativePrompt,
      aspectRatio: '1:1',
      width: dimensions.width,
      height: dimensions.height,
      referenceImageUrl: character.referenceImageUrl,
    };
  }
  /**
   * Builds short, natural-language prompts specifically for the Google Flow
   * Character workspace. The saved-character editor already has the selected
   * character image as visual context, so do not emit a plain-text @mention:
   * it is not a verified Flow entity token and can confuse image editing.
   *
   * Gemini keeps using buildCharacterPrompt() and its separate negative prompt.
   */
  public static buildGoogleFlowCharacterPrompt(
    story: { visualStyle?: string },
    character: CharacterContextItem,
    assetType: 'master_reference' | 'turnaround' | 'expression' | 'pose',
    options?: {
      variation?: string;
      isExistingFlowCharacter?: boolean;
      promptOverride?: string;
    }
  ): CharacterPromptResult {
    const artStyle = (story.visualStyle || 'storybook illustration').trim();
    const variation = String(options?.variation || '').trim().toLowerCase();
    const dimensions = { width: 1024, height: 1024 };

    const directions: Record<string, string> = {
      front: 'front view, facing the camera',
      'front-left': 'front three-quarter view, turned slightly toward the character’s left',
      'front-right': 'front three-quarter view, turned slightly toward the character’s right',
      left: 'left side profile, facing left',
      right: 'right side profile, facing right',
      'back-left': 'rear three-quarter view, turned toward the character’s left',
      'back-right': 'rear three-quarter view, turned toward the character’s right',
      back: 'full back view, showing the back of the outfit and hairstyle',
    };

    const direction = directions[variation] || 'front view, facing the camera';
    const appearance = [
      character.species ? `Character: ${character.species}.` : '',
      character.visualDescription ? `Appearance: ${character.visualDescription}.` : '',
      character.clothing ? `Clothing: ${character.clothing}.` : '',
      character.distinctiveFeatures ? `Distinctive features: ${character.distinctiveFeatures}.` : '',
    ].filter(Boolean).join(' ');

    let prompt: string;
    if (options?.promptOverride?.trim()) {
      // Keep user-provided overrides, but still apply the one-image requirement.
      prompt = `${options.promptOverride.trim()} Show one character only, with no text or labels.`;
    } else if (options?.isExistingFlowCharacter) {
      const subjectInstruction =
        assetType === 'master_reference'
          ? 'Create a clean full-body front reference of this same character.'
          : assetType === 'turnaround'
            ? `Show this same character from a ${direction}.`
            : assetType === 'expression'
              ? `Keep this same character and change only the facial expression to ${variation || 'happy and smiling'}.`
              : `Keep this same character and change only the body pose to ${variation || 'a natural standing pose'}.`;

      prompt = [
        'Use the character in the image currently open in this editor as the visual reference.',
        subjectInstruction,
        'Keep the character’s face, hairstyle, colors, body proportions, outfit, patterns, shoes and accessories unchanged. Do not redesign the character.',
        'Keep a simple neutral standing pose and show the complete character from head to toe, centered in the frame.',
        `Keep the existing ${artStyle} illustration style and use a plain light neutral background.`,
        'Show one character only. Do not add words, labels, symbols, borders or extra characters.',
      ].join(' ');
    } else {
      const subjectInstruction =
        assetType === 'master_reference'
          ? 'Create one full-body front-view character reference.'
          : assetType === 'turnaround'
            ? `Create one full-body character image in a ${direction}.`
            : assetType === 'expression'
              ? `Create one head-and-shoulders character portrait with a ${variation || 'happy and smiling'} expression.`
              : `Create one full-body character image with this pose: ${variation || 'standing naturally'}.`;

      prompt = [
        subjectInstruction,
        appearance,
        `Illustration style: ${artStyle}.`,
        'Use a clear, simple, light neutral background. Keep the entire character visible when showing a full-body view.',
        'Show one character only. Do not include the character’s name, text, labels, symbols, borders or extra characters.',
      ].filter(Boolean).join(' ');
    }

    return {
      prompt: prompt.replace(/\s+/g, ' ').trim(),
      negativePrompt: 'text, letters, labels, watermark, logo, extra characters, collage, multiple views, cropped body, distorted anatomy',
      aspectRatio: '1:1',
      width: dimensions.width,
      height: dimensions.height,
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
