import { z } from 'zod';
import {
  StructuredStory,
  StructuredScene,
  StructuredCharacter,
  StructuredDialogue,
  StructuredCharacterAction,
  StoryGenerationInput,
} from './story-generation.types.js';

export const StructuredDialogueSchema = z.object({
  characterName: z.string().min(1, 'Character name in dialogue is required'),
  text: z.string().min(1, 'Dialogue line text is required'),
  emotion: z.string().optional().default('happy'),
});

export const StructuredCharacterActionSchema = z.object({
  characterName: z.string().min(1, 'Character name in action is required'),
  action: z.string().min(1, 'Action type is required').default('idle'),
  pose: z.string().optional().default('neutral'),
  description: z.string().optional().default(''),
});

export const StructuredCharacterSchema = z.object({
  name: z.string().min(1, 'Character name is required'),
  role: z.string().default('supporting'),
  species: z.string().min(1, 'Character species is required').default('human'),
  description: z.string().default('A friendly character in the story.'),
  personality: z.union([z.array(z.string()), z.string()]).default(['friendly', 'curious']),
});

export const StructuredSceneSchema = z.object({
  sceneNumber: z.coerce.number().int().positive('Scene number must be a positive integer'),
  title: z.string().min(1, 'Scene title is required'),
  summary: z.string().default(''),
  visualDescription: z.string().min(1, 'Visual description is required'),
  location: z.string().default('Outdoors'),
  timeOfDay: z.string().default('Daytime'),
  narration: z.string().min(1, 'Scene narration is required'),
  dialogue: z.array(StructuredDialogueSchema).default([]),
  characterActions: z.array(StructuredCharacterActionSchema).default([]),
  durationSeconds: z.coerce.number().positive('Duration must be positive').default(15),
});

export const StructuredStorySchema = z.object({
  title: z.string().min(1, 'Story title is required'),
  logline: z.string().min(1, 'Logline is required'),
  lesson: z.string().default('Working together and being kind makes everything better.'),
  targetAudience: z.string().default('4-7 years'),
  genre: z.string().default('Adventure'),
  estimatedDurationSeconds: z.coerce.number().positive().default(60),
  characters: z.array(StructuredCharacterSchema).min(1, 'At least one character is required'),
  scenes: z.array(StructuredSceneSchema).min(2, 'At least two scenes are required'),
});

export interface ValidationResult {
  success: boolean;
  data?: StructuredStory;
  errors?: string[];
  rawText?: string;
}

/**
 * Strips code fences, chat commentary, and repairs common JSON quirks from AI output.
 */
export function extractAndParseJson(raw: string): any {
  let cleaned = raw.trim();

  // 1. Strip markdown code fences (```json ... ``` or ``` ...)
  cleaned = cleaned.replace(/^```(?:json)?\s*/i, '');
  cleaned = cleaned.replace(/\s*```$/, '');

  // 2. Extract innermost JSON object if surrounded by chat prose
  const firstBrace = cleaned.indexOf('{');
  const lastBrace = cleaned.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
    cleaned = cleaned.substring(firstBrace, lastBrace + 1);
  }

  // 3. Strip trailing commas before closing braces/brackets
  cleaned = cleaned.replace(/,\s*([\]}])/g, '$1');

  return JSON.parse(cleaned);
}

/**
 * Validates, normalizes, and repairs a structured story object against the schema.
 */
export function validateAndNormalizeStory(
  rawInput: unknown,
  inputOptions?: StoryGenerationInput
): ValidationResult {
  let candidateObj: any = rawInput;

  // If passed as raw string, try to parse JSON
  if (typeof rawInput === 'string') {
    try {
      candidateObj = extractAndParseJson(rawInput);
    } catch (parseError: any) {
      return {
        success: false,
        errors: [`JSON parse failure: ${parseError?.message || 'Invalid JSON syntax'}`],
        rawText: rawInput,
      };
    }
  }

  if (!candidateObj || typeof candidateObj !== 'object') {
    return {
      success: false,
      errors: ['Generated output is not a valid JSON object'],
    };
  }

  // Schema parsing & validation
  const parseResult = StructuredStorySchema.safeParse(candidateObj);
  if (!parseResult.success) {
    const errorDetails = parseResult.error.issues.map(
      (issue) => `${issue.path.join('.')}: ${issue.message}`
    );
    return {
      success: false,
      errors: errorDetails,
    };
  }

  const story = parseResult.data;

  // Post-schema Normalization & Character Consistency Checks
  // 1. Normalize characters personality to array of strings
  const declaredCharacterNames = new Set<string>();
  const normalizedCharacters: StructuredCharacter[] = story.characters.map((c) => {
    declaredCharacterNames.add(c.name.trim().toLowerCase());
    const pers = Array.isArray(c.personality)
      ? c.personality
      : typeof c.personality === 'string'
      ? c.personality.split(',').map((p) => p.trim()).filter(Boolean)
      : ['friendly'];

    return {
      name: c.name.trim(),
      role: c.role || 'supporting',
      species: c.species || 'human',
      description: c.description || `${c.name} is a character in the story.`,
      personality: pers.length > 0 ? pers : ['friendly'],
    };
  });

  // 2. Validate and repair scene ordering and character references
  const mainCharacterName = normalizedCharacters[0]?.name || 'Hero';
  const normalizedScenes: StructuredScene[] = story.scenes.map((sc, idx) => {
    // Scene number sequential ordering
    const sceneNumber = idx + 1;

    // Check dialogue character names
    const repairedDialogue: StructuredDialogue[] = sc.dialogue.map((d) => {
      const dName = d.characterName.trim();
      if (!declaredCharacterNames.has(dName.toLowerCase())) {
        // Character was not declared; add them or map to main character
        normalizedCharacters.push({
          name: dName,
          role: 'supporting',
          species: 'human',
          description: `${dName} appears in scene ${sceneNumber}.`,
          personality: ['expressive'],
        });
        declaredCharacterNames.add(dName.toLowerCase());
      }
      return {
        characterName: dName,
        text: d.text.trim(),
        emotion: d.emotion || 'happy',
      };
    });

    // Check character actions
    const repairedActions: StructuredCharacterAction[] = sc.characterActions.map((a) => {
      const aName = a.characterName.trim();
      if (!declaredCharacterNames.has(aName.toLowerCase())) {
        normalizedCharacters.push({
          name: aName,
          role: 'supporting',
          species: 'human',
          description: `${aName} appears in scene ${sceneNumber}.`,
          personality: ['active'],
        });
        declaredCharacterNames.add(aName.toLowerCase());
      }

      // Normalize action to supported keywords or fallback
      let act = a.action.trim().toLowerCase();
      if (!['walk', 'wave', 'jump', 'idle'].includes(act)) {
        if (act.includes('walk') || act.includes('run') || act.includes('step') || act.includes('move')) {
          act = 'walk';
        } else if (act.includes('wave') || act.includes('greet') || act.includes('hello')) {
          act = 'wave';
        } else if (act.includes('jump') || act.includes('hop') || act.includes('bounce')) {
          act = 'jump';
        } else {
          act = 'idle';
        }
      }

      return {
        characterName: aName,
        action: act,
        pose: a.pose || 'neutral',
        description: a.description || `${aName} performs ${act}.`,
      };
    });

    // Ensure duration is reasonable (at least 5s, at most 60s per scene)
    const durationSeconds = Math.max(5, Math.min(60, Number(sc.durationSeconds) || 15));

    return {
      sceneNumber,
      title: sc.title || `Scene ${sceneNumber}`,
      summary: sc.summary || sc.visualDescription.slice(0, 80),
      visualDescription: sc.visualDescription,
      location: sc.location || 'Story Setting',
      timeOfDay: sc.timeOfDay || 'Daytime',
      narration: sc.narration,
      dialogue: repairedDialogue,
      characterActions: repairedActions,
      durationSeconds,
    };
  });

  // Calculate total duration from scenes
  const totalDuration = normalizedScenes.reduce((acc, sc) => acc + sc.durationSeconds, 0);

  const normalizedStory: StructuredStory = {
    title: story.title.trim(),
    logline: story.logline.trim(),
    lesson: story.lesson.trim(),
    targetAudience: inputOptions?.ageGroup || story.targetAudience,
    genre: inputOptions?.genre || story.genre,
    estimatedDurationSeconds: totalDuration || story.estimatedDurationSeconds || 60,
    characters: normalizedCharacters,
    scenes: normalizedScenes,
  };

  return {
    success: true,
    data: normalizedStory,
  };
}

