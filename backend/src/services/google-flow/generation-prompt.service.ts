import { SceneContextItem, CharacterContextItem } from './story-context.service.js';
import { VisualStylesService } from '../visual-styles/visual-styles.service.js';
import { CharacterFacingDirection } from '../character-studio/character-studio.types.js';

export interface CanonicalCharacterIdentity {
  characterId?: string;
  name: string;
  speciesCategory: string;
  age?: string;
  genderPresentation?: string;
  skinOrFurColour?: string;
  faceShape?: string;
  eyeDetails?: string;
  hairColour?: string;
  hairstyle?: string;
  bodyProportions?: string;
  heightOrBuild?: string;
  clothing: string;
  footwear?: string;
  accessories?: string;
  distinctiveFeatures: string;
  visualDescription: string;
  illustrationStyle: string;
  colourPalette?: string;
  canonicalReferenceUrl?: string | null;
}

export const DIRECTIONAL_CAMERA_ORIENTATIONS: Record<
  CharacterFacingDirection,
  { label: string; orientation: string; suppressFace: boolean }
> = {
  front: {
    label: 'Front',
    orientation:
      'Straight-on front-facing view (0 degrees). Chest, hips, and face looking directly forward toward the camera.',
    suppressFace: false,
  },
  'front-left': {
    label: 'Front three-quarter left',
    orientation:
      'A front three-quarter view turned approximately 45 degrees toward the character’s left. Both eyes remain visible, with the left side slightly angled away.',
    suppressFace: false,
  },
  'front-right': {
    label: 'Front three-quarter right',
    orientation:
      'A front three-quarter view turned approximately 45 degrees toward the character’s right. Both eyes remain visible, with the right side slightly angled away.',
    suppressFace: false,
  },
  left: {
    label: 'Left profile',
    orientation:
      'True left side profile (90 degrees). Character facing strictly to the left of the frame, showing only the left side of the face and full side silhouette.',
    suppressFace: false,
  },
  right: {
    label: 'Right profile',
    orientation:
      'True right side profile (90 degrees). Character facing strictly to the right of the frame, showing only the right side of the face and full side silhouette.',
    suppressFace: false,
  },
  'back-left': {
    label: 'Back three-quarter left',
    orientation:
      'Rear three-quarter view turned approximately 135 degrees away from the camera toward the character’s left. Show primarily the back of the head, hair, and outfit with at most a slight cheek/ear edge.',
    suppressFace: true,
  },
  'back-right': {
    label: 'Back three-quarter right',
    orientation:
      'Rear three-quarter view turned approximately 135 degrees away from the camera toward the character’s right. Show primarily the back of the head, hair, and outfit with at most a slight cheek/ear edge.',
    suppressFace: true,
  },
  back: {
    label: 'Back',
    orientation:
      'A full rear view (180 degrees). Back of the head, hair, shoulders, outfit, and heels facing directly toward the camera. Face, eyes, nose, and mouth must NOT be visible.',
    suppressFace: true,
  },
};

const DIRECTION_ALIASES: Record<string, CharacterFacingDirection> = {
  front: 'front',
  front_view: 'front',
  'front-left': 'front-left',
  three_quarter_left: 'front-left',
  front_three_quarter_left: 'front-left',
  'front-right': 'front-right',
  three_quarter_right: 'front-right',
  front_three_quarter_right: 'front-right',
  left: 'left',
  left_profile: 'left',
  right: 'right',
  right_profile: 'right',
  'back-left': 'back-left',
  back_three_quarter_left: 'back-left',
  'back-right': 'back-right',
  back_three_quarter_right: 'back-right',
  back: 'back',
  back_view: 'back',
};

export function normalizeCharacterFacingDirection(
  raw?: string | null,
): CharacterFacingDirection {
  const key = String(raw || 'front')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_');
  return DIRECTION_ALIASES[key] || 'front';
}

export function extractCanonicalCharacterIdentity(
  character: Partial<CharacterContextItem> & Record<string, any>,
  fallbackVisualStyle?: string,
): CanonicalCharacterIdentity {
  const canonical =
    character?.canonicalAppearance && typeof character.canonicalAppearance === 'object'
      ? (character.canonicalAppearance as Record<string, any>)
      : {};

  const clothingField =
    typeof canonical.clothing === 'string'
      ? canonical.clothing
      : canonical.clothing && typeof canonical.clothing === 'object'
        ? [
            canonical.clothing.top,
            canonical.clothing.bottom,
            canonical.clothing.outfit,
            canonical.clothing.colors,
            canonical.clothing.details,
          ]
            .filter(Boolean)
            .join(', ')
        : '';

  const eyeDetails = [canonical.eyeShape, canonical.eyeColor]
    .filter(Boolean)
    .join(', ');

  return {
    characterId: character.id,
    name: String(character.name || 'Character').trim(),
    speciesCategory: String(character.species || canonical.species || 'character').trim(),
    age: canonical.age ? String(canonical.age).trim() : undefined,
    genderPresentation: canonical.gender ? String(canonical.gender).trim() : undefined,
    skinOrFurColour: canonical.skinColor || canonical.furColor || canonical.skinTone
      ? String(canonical.skinColor || canonical.furColor || canonical.skinTone).trim()
      : undefined,
    faceShape: canonical.faceShape ? String(canonical.faceShape).trim() : undefined,
    eyeDetails: eyeDetails || undefined,
    hairColour: canonical.hairColor ? String(canonical.hairColor).trim() : undefined,
    hairstyle: canonical.hairstyle ? String(canonical.hairstyle).trim() : undefined,
    bodyProportions: canonical.bodyProportions
      ? String(canonical.bodyProportions).trim()
      : undefined,
    heightOrBuild: canonical.height || canonical.build
      ? String(canonical.height || canonical.build).trim()
      : undefined,
    clothing:
      String(
        character.clothing ||
          clothingField ||
          'Preserve the established outfit and colours from the canonical reference',
      ).trim(),
    footwear: canonical.footwear ? String(canonical.footwear).trim() : undefined,
    accessories: canonical.accessories ? String(canonical.accessories).trim() : undefined,
    distinctiveFeatures: String(
      character.distinctiveFeatures ||
        canonical.distinctiveFeatures ||
        'Preserve all established distinctive physical features',
    ).trim(),
    visualDescription: String(
      character.visualDescription ||
        canonical.visualDescription ||
        'Preserve the exact character appearance from the canonical reference',
    ).trim(),
    illustrationStyle: String(
      canonical.artStyle ||
        fallbackVisualStyle ||
        'whimsical children book 2D cartoon illustration, soft cell shading, clean crisp outlines',
    ).trim(),
    colourPalette: canonical.colourPalette || canonical.colorPalette
      ? String(canonical.colourPalette || canonical.colorPalette).trim()
      : undefined,
    canonicalReferenceUrl:
      character.referenceImageUrl || canonical.references?.mainUrl || null,
  };
}

export function formatCanonicalIdentitySection(
  identity: CanonicalCharacterIdentity,
): string {
  const lines = [
    `Species/Category: ${identity.speciesCategory}`,
    identity.age ? `Age: ${identity.age}` : '',
    identity.genderPresentation ? `Presentation: ${identity.genderPresentation}` : '',
    `Appearance: ${identity.visualDescription}`,
    identity.skinOrFurColour ? `Skin/Fur Colour: ${identity.skinOrFurColour}` : '',
    identity.faceShape ? `Face Shape: ${identity.faceShape}` : '',
    identity.eyeDetails ? `Eyes: ${identity.eyeDetails}` : '',
    identity.hairColour || identity.hairstyle
      ? `Hair: ${[identity.hairColour, identity.hairstyle].filter(Boolean).join(', ')}`
      : '',
    identity.bodyProportions ? `Body Proportions: ${identity.bodyProportions}` : '',
    identity.heightOrBuild ? `Height/Build: ${identity.heightOrBuild}` : '',
    `Clothing: ${identity.clothing}`,
    identity.footwear ? `Footwear: ${identity.footwear}` : '',
    identity.accessories ? `Accessories: ${identity.accessories}` : '',
    `Distinctive Features: ${identity.distinctiveFeatures}`,
    identity.colourPalette ? `Colour Palette: ${identity.colourPalette}` : '',
  ].filter(Boolean);

  return lines.join('\n');
}

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
  canonicalIdentity?: CanonicalCharacterIdentity;
  requestedDirection?: CharacterFacingDirection;
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
    const identity = extractCanonicalCharacterIdentity(character, story.visualStyle);
    const artStyle = identity.illustrationStyle;
    const dimensions = { width: 1024, height: 1024 };
    const identityDescription = formatCanonicalIdentitySection(identity);

    const flowReferenceName =
      character.flowMapping?.syncStatus === 'synced' &&
      character.flowMapping.flowCharacterId
        ? character.flowMapping.flowCharacterName
        : null;

    const identityLines: string[] = [
      'IMMUTABLE CHARACTER IDENTITY:',
      flowReferenceName
        ? `Use the saved Google Flow character identity @${flowReferenceName} as the exact subject. Match that saved character 100%.`
        : identity.canonicalReferenceUrl && assetType !== 'master_reference'
          ? 'Preserve the exact same character from the supplied canonical character reference image. Use the following visual identity details as generation guidance only:'
          : 'Use the following visual identity details as generation guidance only:',
      'Maintain the exact same facial structure, skin/fur tone, eye shape and colour, hairstyle, hair colour, body proportions, clothing, fabric details, footwear, accessories, distinctive features, illustration style, and colour palette.',
      'Canonical Specification (metadata only — never render words inside the image):\n' +
        identityDescription,
    ];

    const commonRestrictions = [
      'POSE AND COMPOSITION:\nFull body visible from head to feet in the same neutral standing pose.\nAnatomically correct body proportions with arms and legs clearly visible.\nCharacter centred in the frame with comfortable margin around head, hands, and feet.\nConsistent character scale across all references.',
      `VISUAL STYLE:\nPreserve the original illustration style: ${artStyle}.\nClean, polished, professional children's animation character design with consistent shading, line quality, and material details.`,
      'BACKGROUND:\nSimple plain white or uniform neutral studio background. No scenery, no furniture, no additional characters, no unnecessary props.',
      'STRICT RESTRICTIONS:\nCreate exactly ONE image of ONE character.\nThe character name is application metadata only. Never write the name inside the image.\nNo text, letters, numbers, typography, titles, labels, captions, logos, signatures, or watermarks.\nDo not redesign the character, change clothing, add accessories, change hairstyle, or change age or proportions.\nDo not introduce another character or generate multi-angle grids or split panels.',
    ];

    if (options?.promptOverride && options.promptOverride.trim().length > 0) {
      const prompt = [
        'CHARACTER IMAGE TASK',
        options.promptOverride.trim(),
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
        referenceImageUrl: identity.canonicalReferenceUrl,
        canonicalIdentity: identity,
      };
    }

    const variation = String(options?.variation || '').trim();
    const requestedDirection =
      assetType === 'turnaround'
        ? normalizeCharacterFacingDirection(variation || 'front')
        : assetType === 'master_reference'
          ? 'front'
          : undefined;

    const parts: string[] = [
      assetType === 'turnaround' && identity.canonicalReferenceUrl
        ? 'Generate a high-quality full-body character reference image using the supplied canonical character reference image.'
        : 'CHARACTER IMAGE TASK',
      identityLines.join('\n'),
    ];

    switch (assetType) {
      case 'master_reference':
        parts.push(
          'Create one canonical full-body character reference illustration. This is a single portrait image, not a multi-view layout.',
          'CAMERA ORIENTATION:\nView: straight-on front view (0 degrees). Chest, hips, and face looking directly forward toward the camera.',
          'PURPOSE:\nThis is the canonical master identity anchor. Make the face, hair, body proportions, outfit, colours, shoes, and distinctive accessories completely clear for reuse across all directional views and scenes.'
        );
        break;

      case 'turnaround': {
        const dirSpec = DIRECTIONAL_CAMERA_ORIENTATIONS[requestedDirection!];
        parts.push(
          `CAMERA ORIENTATION:\nGenerate ONLY the requested [${dirSpec.label}] view. Generate only the requested camera angle in this image. Never place several angles together.\n${dirSpec.orientation}\nDo NOT combine or mix this perspective with any other angle or panel.`
        );
        break;
      }

      case 'expression': {
        const expression = variation || 'happy and smiling';
        parts.push(
          'FACIAL EXPRESSION PORTRAIT:\nCreate one standalone head-and-shoulders character expression portrait, not an expression sheet.',
          `Expression to show: ${expression}. Keep the exact same face shape, eye design, hairstyle, colours, and identity; only the facial expression changes.`
        );
        break;
      }

      case 'pose': {
        const action = variation || 'standing naturally';
        parts.push(
          'CHARACTER POSE:\nCreate one standalone full-body character pose illustration, not a pose sheet.',
          `Action or pose to show: ${action}. Keep the exact same character identity, anatomy, outfit, colours, and distinctive features.`
        );
        break;
      }
    }

    parts.push(...commonRestrictions);

    const negativeParts = [
      'text, letters, words, character name, title, heading, label, caption, typography, watermark, logo, signature, annotation',
      'character sheet, turnaround sheet, model sheet, contact sheet, expression sheet, pose sheet, collage, grid, panels, multiple views',
      'multiple characters, extra people, scenery, detailed background, furniture, props, border',
      'cropped head, cropped hands, cropped feet, cropped body, extra limbs, distorted face, deformed anatomy, blurry, low resolution',
    ];

    if (requestedDirection && DIRECTIONAL_CAMERA_ORIENTATIONS[requestedDirection].suppressFace) {
      negativeParts.push('front face, both eyes visible, forward-facing face, staring at camera');
    }

    return {
      prompt: parts.join('\n\n'),
      negativePrompt: negativeParts.join(', '),
      aspectRatio: '1:1',
      width: dimensions.width,
      height: dimensions.height,
      referenceImageUrl: identity.canonicalReferenceUrl,
      canonicalIdentity: identity,
      requestedDirection,
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
    const artStyle = (story.visualStyle || 'storybook illustration')
      .replace(/[_-]+/g, ' ')
      .trim();
    const variation = String(options?.variation || '').trim().toLowerCase();
    const dimensions = { width: 1024, height: 1024 };

    // Describe the direction in screen-space terms. "Viewer left/right" is
    // less ambiguous for an image model than "the character's left/right".
    const directions: Record<string, string> = {
      front: 'Front view: the character faces straight toward the viewer; face, chest, hips and feet point forward.',
      'front-left': 'Front three-quarter LEFT view: rotate the whole character about 45 degrees so the nose and chest point toward the LEFT side of the image. Keep both eyes partly visible.',
      'front-right': 'Front three-quarter RIGHT view: rotate the whole character about 45 degrees so the nose and chest point toward the RIGHT side of the image. Keep both eyes partly visible.',
      left: 'LEFT side profile: rotate the whole character 90 degrees so the nose points directly to the LEFT side of the image. Show a true side silhouette, not a three-quarter view.',
      right: 'RIGHT side profile: rotate the whole character 90 degrees so the nose points directly to the RIGHT side of the image. Show a true side silhouette, not a three-quarter view.',
      'back-left': 'BACK three-quarter LEFT view: turn the whole character away from the viewer about 135 degrees, toward the LEFT side of the image. Show mostly the back with a small side edge of the face.',
      'back-right': 'BACK three-quarter RIGHT view: turn the whole character away from the viewer about 135 degrees, toward the RIGHT side of the image. Show mostly the back with a small side edge of the face.',
      back: 'Direct BACK view: the back of the head, hair and clothing face the viewer. The face must not be visible.',
    };

    const direction = directions[variation] || directions.front;
    const appearance = [
      character.species ? `Character type: ${character.species}.` : '',
      character.visualDescription ? `Appearance: ${character.visualDescription}.` : '',
      character.clothing ? `Clothing: ${character.clothing}.` : '',
      character.distinctiveFeatures ? `Distinctive details: ${character.distinctiveFeatures}.` : '',
    ].filter(Boolean).join(' ');

    const isTurnaround = assetType === 'turnaround';
    const fullBody = assetType !== 'expression';
    const angleInstruction = isTurnaround
      ? direction
      : assetType === 'expression'
        ? `Head-and-shoulders portrait with a ${variation || 'friendly neutral'} expression.`
        : assetType === 'pose'
          ? `Full-body view showing this pose: ${variation || 'a relaxed neutral standing pose'}.`
          : directions.front;

    const identityInstruction = options?.isExistingFlowCharacter
      ? 'Use the character in the image currently selected in this Google Flow editor as the ONLY identity reference. Edit that same character; do not invent, replace or redesign the character.'
      : `Create the character described here: ${appearance}`;

    const customDetail = options?.promptOverride?.trim()
      ? `Additional creative detail: ${options.promptOverride.trim()}.`
      : '';

    const promptParts = [
      identityInstruction,
      assetType === 'master_reference'
        ? 'Create one clean canonical full-body character reference.'
        : isTurnaround
          ? 'Create ONE separate turnaround image for this single camera angle. This is one image only, not a turnaround sheet.'
          : assetType === 'expression'
            ? 'Create one expression variation of the same character.'
            : 'Create one pose variation of the same character.',
      angleInstruction,
      'Preserve the exact same identity: face shape, age, skin or fur tone, eyes, hairstyle, body proportions, outfit, clothing patterns, footwear, accessories and colors. Do not add, remove or redesign any identifying feature.',
      fullBody
        ? 'Keep the same simple neutral standing pose for every turnaround view: arms relaxed slightly away from the body, hands visible, legs natural and both feet fully visible. Show the complete character from head to toe.'
        : 'Keep the same face identity, hairstyle, colors and clothing; change only the facial expression.',
      'Keep the camera at eye level, the character centered, and the full figure at a consistent scale and distance.',
      `Match the original ${artStyle} illustration style, line quality, shading and color palette.`,
      'Use the same plain warm off-white background as the reference. No scenery or props.',
      customDetail,
      'Final image: one character, one view, no text, no name, no labels, no captions, no watermark, no logo, no panels, no grid and no collage.',
    ].filter(Boolean);

    const prompt = promptParts.join(' ').replace(/\s+/g, ' ').trim();
    return {
      prompt,
      negativePrompt: 'text, writing, letters, labels, captions, watermark, logo, extra characters, contact sheet, collage, multiple views, props, scenery, cropped body, altered outfit, different face, distorted anatomy',
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
