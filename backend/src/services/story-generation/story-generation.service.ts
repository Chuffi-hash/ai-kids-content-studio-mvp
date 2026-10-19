import {
  StoryGenerationInput,
  StructuredStory,
  PersistedStoryResult,
  StructuredScene,
} from './story-generation.types.js';
import { StoryProviderFactory } from './providers/story-provider.factory.js';
import { validateAndNormalizeStory } from './story-schema.validator.js';
import { CharacterResolutionService } from './character-resolution.service.js';
import { ScenePreparationService } from './scene-preparation.service.js';
import { StoryPersistenceService } from './story-persistence.service.js';
import { prisma } from '../database/database.service.js';
import { estimateSpeechDurationMs } from '../timing/timing.service.js';
import { VectorSceneData } from '../animation/vector-animation.engine.js';
import { AudioGenerationService } from '../audio-generation/audio-generation.service.js';

export class StoryGenerationService {
  /**
   * Main entry point: Generates a complete, validated structured story,
   * resolves character consistency, prepares animation scenes, and persists to DB.
   */
  public static async generateAndPersistStory(
    input: StoryGenerationInput
  ): Promise<PersistedStoryResult> {
    // 1. Generate Structured Story
    const structuredStory = await this.generateStructuredStory(input);

    // 2. Resolve Characters & Consistency
    const { resolvedCharacters, characterMapByName } =
      await CharacterResolutionService.resolveStoryCharacters(
        structuredStory.characters,
        input.characterIds
      );

    // Reconcile scene dialogue and action names against resolved characters
    CharacterResolutionService.reconcileSceneCharacters(
      structuredStory.scenes,
      characterMapByName,
      resolvedCharacters[0]
    );

    // 3. Prepare Animation-ready Scenes
    const preparedScenes = ScenePreparationService.prepareScenes(
      structuredStory.scenes,
      characterMapByName,
      resolvedCharacters,
      structuredStory.estimatedDurationSeconds
    );

    // 4. Persist Story, Characters, and Scenes inside an atomic transaction
    const persistedResult = await StoryPersistenceService.persistNewStory(
      structuredStory,
      preparedScenes,
      resolvedCharacters,
      input
    );

    // 5. Best-effort initial generation of dialogue audio for all prepared scenes
    try {
      const audioGen = new AudioGenerationService();
      await audioGen.generateAllStoryDialogues(persistedResult.storyId);
    } catch (err) {
      console.warn(`[StoryGeneration] Initial dialogue audio generation notice:`, err);
    }

    return persistedResult;
  }

  /**
   * Regenerates an existing story in place, updating scenes and metadata.
   */
  public static async regenerateStory(
    storyId: string,
    input: StoryGenerationInput
  ): Promise<PersistedStoryResult> {
    const structuredStory = await this.generateStructuredStory(input);

    const { resolvedCharacters, characterMapByName } =
      await CharacterResolutionService.resolveStoryCharacters(
        structuredStory.characters,
        input.characterIds
      );

    CharacterResolutionService.reconcileSceneCharacters(
      structuredStory.scenes,
      characterMapByName,
      resolvedCharacters[0]
    );

    const preparedScenes = ScenePreparationService.prepareScenes(
      structuredStory.scenes,
      characterMapByName,
      resolvedCharacters,
      structuredStory.estimatedDurationSeconds
    );

    return await StoryPersistenceService.regenerateExistingStory(
      storyId,
      structuredStory,
      preparedScenes,
      resolvedCharacters,
      input
    );
  }

  /**
   * Regenerates a single scene within an existing story.
   */
  public static async regenerateSingleScene(
    sceneId: string,
    customPrompt?: string
  ): Promise<any> {
    const existingScene = await (prisma as any).scene.findUnique({
      where: { sceneId },
      include: {
        story: {
          include: {
            storyCharacters: { include: { character: true } },
          },
        },
      },
    });

    if (!existingScene) {
      throw new Error(`Scene not found: ${sceneId}`);
    }

    const characters = existingScene.story.storyCharacters.map((sc: any) => sc.character);
    const mainChar = characters[0] || { id: 'char-hero', name: 'Hero', species: 'human' };

    // Generate new scene content
    const narration = customPrompt
      ? `${mainChar.name} discovers something new: "${customPrompt}".`
      : `With a bright smile, ${mainChar.name} discovered an even more exciting path forward!`;

    const speechMs = estimateSpeechDurationMs(narration);
    const durationMs = Math.max(5000, speechMs + 1500);

    const charInstances = (existingScene.animationData as any)?.characterInstances || [];
    const mainInstId = charInstances[0]?.instanceId || `char-${mainChar.id}-1-0`;

    const updatedAnimationData: VectorSceneData = {
      version: 1,
      viewport: { width: 1280, height: 720 },
      characterInstances: charInstances,
      animationClips: [
        {
          clipId: `clip-${sceneId}-${Date.now()}`,
          instanceId: mainInstId,
          action: 'wave',
          startMs: 0,
          durationMs,
          loop: true,
        },
      ],
    };

    (updatedAnimationData as any).dialogue = [
      {
        speaker: mainChar.name,
        line: `Look what I found! Let's explore together!`,
        emotion: 'happy',
      },
    ];
    (updatedAnimationData as any).characterActions = [
      {
        characterName: mainChar.name,
        action: 'wave',
        pose: 'happy',
        description: `${mainChar.name} waves cheerfully.`,
      },
    ];

    return await (prisma as any).scene.update({
      where: { sceneId },
      data: {
        narration,
        visualPrompt: customPrompt || existingScene.visualPrompt,
        estimatedDurationMs: durationMs,
        endMs: existingScene.startMs + durationMs,
        animationData: updatedAnimationData as any,
      },
    });
  }

  /**
   * Generates and validates structured story data from the active provider.
   */
  public static async generateStructuredStory(
    input: StoryGenerationInput
  ): Promise<StructuredStory> {
    const prompt = this.buildPrompt(input);

    // Attempt 1: Call provider
    const { rawJson } = await StoryProviderFactory.generateStoryJson(prompt, input);

    // Validate and normalize
    const valResult = validateAndNormalizeStory(rawJson, input);
    if (valResult.success && valResult.data) {
      return valResult.data;
    }

    console.warn(
      `[StoryGenerationService] Validation failed on primary output (${valResult.errors?.join(', ')}). Attempting bounded repair...`
    );

    // Attempt 2: Bounded repair prompt
    const repairPrompt = `
The previous JSON story output failed validation with the following errors:
${valResult.errors?.map((e) => `- ${e}`).join('\n')}

Original user request:
${input.topic}

Please output a strictly valid JSON object matching this schema exactly:
{
  "title": "string",
  "logline": "string",
  "lesson": "string",
  "targetAudience": "${input.ageGroup || '4-7 years'}",
  "genre": "${input.genre || 'Adventure'}",
  "estimatedDurationSeconds": ${input.desiredDurationSeconds || 60},
  "characters": [
    { "name": "string", "role": "protagonist", "species": "string", "description": "string", "personality": ["string"] }
  ],
  "scenes": [
    {
      "sceneNumber": 1,
      "title": "string",
      "summary": "string",
      "visualDescription": "string",
      "location": "string",
      "timeOfDay": "string",
      "narration": "string",
      "dialogue": [{ "characterName": "string", "text": "string", "emotion": "happy" }],
      "characterActions": [{ "characterName": "string", "action": "walk", "pose": "curious", "description": "string" }],
      "durationSeconds": 15
    }
  ]
}
Return ONLY valid JSON.
`;

    try {
      const repaired = await StoryProviderFactory.generateStoryJson(repairPrompt, input);
      const repairVal = validateAndNormalizeStory(repaired.rawJson, input);
      if (repairVal.success && repairVal.data) {
        return repairVal.data;
      }
    } catch (repairErr) {
      console.warn('[StoryGenerationService] Bounded repair call failed:', repairErr);
    }

    // Graceful fallback to deterministic engine to ensure user gets a valid, complete story
    console.warn('[StoryGenerationService] Falling back to deterministic engine for guaranteed story delivery.');
    const { DeterministicStoryProvider } = await import(
      './providers/deterministic-story.provider.js'
    );
    const deterministic = new DeterministicStoryProvider();
    return deterministic.buildStructuredStory(input);
  }

  /**
   * Constructs the structured generation prompt for AI providers.
   */
  private static buildPrompt(input: StoryGenerationInput): string {
    const ageGroup = input.ageGroup || '4-7 years';
    const duration = input.desiredDurationSeconds || 60;
    const sceneCount = input.sceneCount || (duration <= 30 ? 3 : duration <= 60 ? 4 : 5);
    const genre = input.genre || 'Adventure';
    const language = input.language || 'English';
    const tone = input.tone || 'cheerful and encouraging';

    return `
You are an expert children's animation storyteller and screenwriter.
Create a complete, engaging, age-appropriate story for animated video production.

Story Idea:
${input.topic}

Target Age: ${ageGroup}
Total Duration: ~${duration} seconds
Language: ${language}
Genre: ${genre}
Tone: ${tone}
Desired Scene Count: ${sceneCount} scenes
${input.lesson ? `Lesson / Moral: ${input.lesson}` : 'Lesson: Positive, educational, or heartwarming message'}
${input.contentRestrictions ? `Content Restrictions to Avoid: ${input.contentRestrictions}` : 'No violence, no scary content, no inappropriate themes.'}

Story Quality Requirements:
1. Structure: Clear beginning, middle, and satisfying resolution.
2. Central Character: A recognizable main hero with a clear goal.
3. Visual Richness: Each scene must describe vibrant colors, lighting, location, and character positioning for animation.
4. Actions: Use standard animation actions for characters: 'walk', 'wave', 'jump', or 'idle'.
5. Narration: Clear, expressive lines appropriate for children's voiceover.
6. Dialogue: Short, meaningful character exchanges with emotions ('happy', 'curious', 'excited', 'calm').

You MUST output ONLY a valid JSON object conforming to this exact schema (NO Markdown fences, NO commentary):
{
  "title": "Title of the Story",
  "logline": "One sentence summary of the story.",
  "lesson": "The takeaway lesson of the story.",
  "targetAudience": "${ageGroup}",
  "genre": "${genre}",
  "estimatedDurationSeconds": ${duration},
  "characters": [
    {
      "name": "Hero Name",
      "role": "protagonist",
      "species": "e.g. rabbit, bear, human, robot",
      "description": "Visual appearance and character traits.",
      "personality": ["curious", "brave", "kind"]
    }
  ],
  "scenes": [
    {
      "sceneNumber": 1,
      "title": "Scene 1 Title",
      "summary": "Brief summary of what happens.",
      "visualDescription": "Detailed visual background, lighting, and stage setting.",
      "location": "e.g. Sunny Meadow",
      "timeOfDay": "e.g. Morning",
      "narration": "Voiceover narration spoken for this scene.",
      "dialogue": [
        {
          "characterName": "Hero Name",
          "text": "Spoken dialogue line.",
          "emotion": "excited"
        }
      ],
      "characterActions": [
        {
          "characterName": "Hero Name",
          "action": "walk",
          "pose": "curious",
          "description": "Character walks forward looking around."
        }
      ],
      "durationSeconds": ${Math.round(duration / sceneCount)}
    }
  ]
}
`;
  }
}

