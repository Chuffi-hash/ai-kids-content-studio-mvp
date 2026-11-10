import {
  CharacterGenerationPrompt,
  CharacterDirection,
  BodyPoseAction,
  FacialExpression,
  CameraFraming,
  GenerationCategory,
} from './character-studio.types.js';

export const DIRECTION_DESCRIPTIONS: Record<CharacterDirection, string> = {
  front: 'front-facing view, facing directly toward the camera',
  left: 'facing left in full profile',
  right: 'facing right in full profile',
  back: 'back-facing view, seen from behind',
  three_quarter_left: 'three-quarter angle view facing slightly to the left (3/4 front view)',
  three_quarter_right: 'three-quarter angle view facing slightly to the right (3/4 front view)',
  looking_over_left_shoulder: 'turned slightly away, looking back over left shoulder at the viewer',
  looking_over_right_shoulder: 'turned slightly away, looking back over right shoulder at the viewer',
  looking_upward: 'looking upward with tilted chin and raised gaze',
  looking_downward: 'looking downward with tilted head and lowered gaze',
};

export const ACTION_DESCRIPTIONS: Record<Exclude<BodyPoseAction, 'custom'>, string> = {
  standing: 'standing naturally in a relaxed balanced posture',
  walking: 'mid-stride walking dynamically with natural arm swing',
  running: 'energetically running forward with active stride and motion',
  jumping: 'jumping enthusiastically in mid-air with feet off the ground',
  sitting: 'sitting comfortably with knees bent',
  kneeling: 'kneeling down on the ground',
  dancing: 'playfully dancing with celebratory movement',
  waving: 'warmly waving one hand in a friendly hello greeting gesture',
  pointing: 'pointing clearly with an outstretched index finger',
  hands_on_hips: 'standing with both hands placed confidently on hips',
  arms_crossed: 'standing with arms casually crossed over chest',
  thinking: 'contemplative thinking posture with hand touching chin or cheek',
  sleeping: 'peacefully sleeping curled up in rest',
  falling: 'falling with arms spread in comical surprise',
  flying: 'gliding forward through the air in flying pose',
};

export const EXPRESSION_DESCRIPTIONS: Record<Exclude<FacialExpression, 'custom'>, string> = {
  neutral: 'calm, neutral resting face',
  happy: 'cheerful friendly smile with sparkling bright eyes',
  very_happy: 'beaming wide joyful grin with squinting happy eyes',
  laughing: 'laughing openly with mouth parted in delight',
  sad: 'gently sad downcast expression with drooping corners of mouth',
  crying: 'tearful crying face with small shiny tears',
  angry: 'pouting furrowed brows and firm determined frown',
  surprised: 'wide round surprised eyes and open O-shaped mouth in astonishment',
  scared: 'timid nervous expression with wide anxious eyes',
  confused: 'puzzled quizzical tilted head with one eyebrow raised in confusion',
  curious: 'intrigued curious wide-eyed gaze leaning forward with interest',
  excited: 'ecstatic thrilled expression with shining energetic eyes and eager smile',
  sleepy: 'drowsy drooping sleepy eyes with a gentle yawn',
  thinking: 'thoughtful inquiring expression with furrowed brow looking upward',
};

export const FRAMING_DESCRIPTIONS: Record<CameraFraming, string> = {
  full_body: 'full-body character shot, showing head to feet',
  half_body: 'medium waist-up half-body shot',
  portrait: 'bust portrait from chest up focusing on facial features',
  close_up: 'dramatic close-up headshot emphasizing facial expression',
  wide_shot: 'wide scenic shot with full character clearly framed',
  side_profile: 'direct side profile silhouette and features',
  character_turnaround: 'character turnaround sheet with front view, three-quarter view, side view, and back view',
  front_view: 'direct front view centered',
  back_view: 'direct rear view centered',
};

export const ART_STYLE_DESCRIPTIONS: Record<string, string> = {
  '2d_cartoon':
    'clean colorful 2D modern cartoon style, bold outlines, friendly appealing shapes, suitable for animation and rigging',
  '3d_pixar':
    "3D Pixar/Disney style animated children's character, soft cinematic lighting, smooth textures, vibrant appealing design",
  'storybook_illustrated':
    'hand-illustrated classic storybook art style, soft gouache textures, warm inviting colors',
};

export const DEFAULT_NEGATIVE_PROMPT =
  'photo, realistic, 3D render, text, watermark, signature, logo, copyright, blurry, cropped head, deformed fingers, extra limbs, bad anatomy, distorted faces, low quality';

export class CharacterPromptBuilderService {
  /**
   * Resolves human-readable descriptions for direction, action, expression, and framing.
   */
  public resolveDirection(direction?: string): string {
    if (!direction) return '';
    return DIRECTION_DESCRIPTIONS[direction as CharacterDirection] || direction;
  }

  public resolveAction(action?: string, customAction?: string): string {
    if (action === 'custom' && customAction) {
      return customAction.trim();
    }
    if (!action) return '';
    return ACTION_DESCRIPTIONS[action as Exclude<BodyPoseAction, 'custom'>] || action;
  }

  public resolveExpression(expression?: string, customExpression?: string): string {
    if (expression === 'custom' && customExpression) {
      return customExpression.trim();
    }
    if (!expression) return '';
    return (
      EXPRESSION_DESCRIPTIONS[expression as Exclude<FacialExpression, 'custom'>] ||
      expression
    );
  }

  public resolveFraming(framing?: string): string {
    if (!framing) return '';
    return FRAMING_DESCRIPTIONS[framing as CameraFraming] || framing;
  }

  public resolveArtStyle(artStyle?: string): string {
    if (!artStyle) return ART_STYLE_DESCRIPTIONS['2d_cartoon'];
    return ART_STYLE_DESCRIPTIONS[artStyle] || artStyle;
  }

  /**
   * Builds a structured prompt and negative prompt from the generation inputs.
   */
  public buildPrompt(input: CharacterGenerationPrompt): {
    prompt: string;
    negativePrompt: string;
    summary: string;
  } {
    // If the user already provided a manual customCombinedPrompt, honor it directly
    if (input.customCombinedPrompt && input.customCombinedPrompt.trim().length > 0) {
      return {
        prompt: input.customCombinedPrompt.trim(),
        negativePrompt: input.negativePrompt || DEFAULT_NEGATIVE_PROMPT,
        summary: `Custom prompt for ${input.characterName} (${input.generationType})`,
      };
    }

    const {
      characterName,
      characterDescription,
      species,
      age,
      direction,
      action,
      customAction,
      expression,
      customExpression,
      framing,
      clothingInstructions,
      backgroundInstructions,
      artStyle,
      customInstructions,
      generationType,
      referenceImageUrl,
    } = input;

    const resolvedDirection = this.resolveDirection(direction);
    const resolvedAction = this.resolveAction(action, customAction);
    const resolvedExpression = this.resolveExpression(expression, customExpression);
    const resolvedFraming = this.resolveFraming(framing);
    const resolvedStyle = this.resolveArtStyle(artStyle);

    const ageStr = age ? `${age} year old ` : '';
    const speciesStr =
      species && species.toLowerCase() !== 'human' ? `${species} ` : 'human ';
    const bgStr =
      backgroundInstructions && backgroundInstructions.trim().length > 0
        ? backgroundInstructions.trim()
        : 'clean isolated white background (transparent background), no background clutter';

    const parts: string[] = [];

    // Distinct identity consistency strategy based on generation type
    if (generationType === 'main') {
      parts.push(
        `Create a canonical 2D cartoon character design for a children's story animation: a ${ageStr}${speciesStr}named '${characterName}'.`
      );
      if (characterDescription) {
        parts.push(`Appearance and traits: ${characterDescription}.`);
      }
      if (clothingInstructions) {
        parts.push(`Clothing and attire: ${clothingInstructions}.`);
      }
      const primaryFraming = resolvedFraming || 'full-body character shot';
      const primaryDirection = resolvedDirection || 'front-facing view, facing directly toward the camera';
      parts.push(`${primaryFraming}, ${primaryDirection}.`);
      if (resolvedExpression) {
        parts.push(`Facial expression: ${resolvedExpression}.`);
      }
      if (resolvedAction) {
        parts.push(`Pose: ${resolvedAction}.`);
      }
    } else if (generationType === 'turnaround') {
      parts.push(
        `Character turnaround model sheet for the exact same character '${characterName}' (${characterDescription || speciesStr}):`
      );
      if (clothingInstructions) {
        parts.push(`Wearing exact same outfit: ${clothingInstructions}.`);
      }
      parts.push(
        `Show consistent full-body multiple angle views on one clean sheet: front view, 3/4 front view, side profile view, 3/4 back view, and back view.`
      );
      parts.push(
        `Maintain identical proportions, face structure, hair, colors, and design consistency across all angles.`
      );
    } else if (generationType === 'expression') {
      parts.push(
        `Facial expression sheet for the exact same character '${characterName}' (${characterDescription || speciesStr}):`
      );
      if (resolvedExpression) {
        parts.push(`Highlighting expression: ${resolvedExpression}.`);
      } else {
        parts.push(
          `Showing 8 distinct expressive facial reactions: happy, excited, surprised, sad, angry, thinking, confused, and laughing.`
        );
      }
      parts.push(
        `Close-up headshots, keeping identical facial structure, eyes, hairstyle, and character identity.`
      );
    } else if (generationType === 'pose') {
      parts.push(
        `Pose and action sheet for the exact same character '${characterName}' (${characterDescription || speciesStr}):`
      );
      if (clothingInstructions) {
        parts.push(`Wearing exact same outfit: ${clothingInstructions}.`);
      }
      if (resolvedAction) {
        parts.push(`Action and pose: ${resolvedAction}.`);
      }
      if (resolvedDirection) {
        parts.push(`Facing direction: ${resolvedDirection}.`);
      }
      if (resolvedExpression) {
        parts.push(`Facial expression: ${resolvedExpression}.`);
      }
      parts.push(
        `Full-body character illustration with dynamic movement while preserving exact proportions, silhouette, and character identity.`
      );
    } else {
      // Custom generation
      parts.push(
        `Illustration of the exact same character '${characterName}' (${characterDescription || speciesStr}):`
      );
      if (clothingInstructions) {
        parts.push(`Outfit: ${clothingInstructions}.`);
      }
      if (resolvedDirection) parts.push(`Direction: ${resolvedDirection}.`);
      if (resolvedAction) parts.push(`Action: ${resolvedAction}.`);
      if (resolvedExpression) parts.push(`Expression: ${resolvedExpression}.`);
      if (resolvedFraming) parts.push(`Framing: ${resolvedFraming}.`);
    }

    // Reference consistency reinforcement if an existing reference is present
    if (referenceImageUrl) {
      parts.push(
        `Visual consistency rule: Strictly match the master visual reference character in anatomy, clothing palette, facial geometry, and line art style.`
      );
    }

    // Custom user instructions
    if (customInstructions && customInstructions.trim().length > 0) {
      parts.push(`Specific direction: ${customInstructions.trim()}.`);
    }

    // Background and style
    parts.push(`Background: ${bgStr}.`);
    parts.push(`Art style: ${resolvedStyle}.`);
    parts.push('High quality, high resolution vector-like clarity, clean silhouette, no text, no watermark.');

    const prompt = parts.join(' ');
    const negativePrompt = input.negativePrompt || DEFAULT_NEGATIVE_PROMPT;
    const summary = `${characterName} - ${generationType} (${resolvedDirection || 'default'}, ${resolvedAction || 'idle'})`;

    return {
      prompt,
      negativePrompt,
      summary,
    };
  }
}
