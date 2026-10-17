import { randomUUID } from 'crypto';
import { prisma } from '../database/database.service.js';
import { StructuredStory, StoryGenerationInput, PersistedStoryResult } from './story-generation.types.js';
import { ResolvedCharacterInfo } from './character-resolution.service.js';
import { PreparedSceneRecord } from './scene-preparation.service.js';

// Cache for idempotency keys to prevent duplicate creation on network retries
const idempotencyCache = new Map<string, { storyId: string; timestamp: number }>();

export class StoryPersistenceService {
  /**
   * Persists a newly generated story, linked characters, and animation-ready scenes
   * inside an atomic database transaction.
   */
  public static async persistNewStory(
    structuredStory: StructuredStory,
    preparedScenes: PreparedSceneRecord[],
    resolvedCharacters: ResolvedCharacterInfo[],
    input: StoryGenerationInput
  ): Promise<PersistedStoryResult> {
    // 1. Idempotency check
    if (input.idempotencyKey && idempotencyCache.has(input.idempotencyKey)) {
      const cached = idempotencyCache.get(input.idempotencyKey)!;
      // If within 10 minutes, return existing story
      if (Date.now() - cached.timestamp < 10 * 60 * 1000) {
        const existingStory = await (prisma as any).story.findUnique({
          where: { storyId: cached.storyId },
          include: {
            scenes: { orderBy: { order: 'asc' } },
            storyCharacters: { include: { character: true } },
          },
        });
        if (existingStory) {
          return {
            story: existingStory,
            scenes: existingStory.scenes,
            characters: existingStory.storyCharacters.map((sc: any) => sc.character),
            storyId: existingStory.storyId,
          };
        }
      }
    }

    const storyId = `story-${Date.now()}-${randomUUID().slice(0, 8)}`;
    const storyDbId = randomUUID();

    const result = await (prisma as any).$transaction(async (tx: any) => {
      // 2. Create Story Record
      const createdStory = await tx.story.create({
        data: {
          id: storyDbId,
          storyId,
          title: structuredStory.title,
          logline: structuredStory.logline,
          lesson: structuredStory.lesson,
          topic: input.topic || null,
          ageGroup: input.ageGroup || structuredStory.targetAudience || null,
          audience: input.audience || structuredStory.targetAudience || null,
          genre: input.genre || structuredStory.genre || null,
          visualStyle: input.visualStyle || 'Storybook illustration',
          targetDuration: structuredStory.estimatedDurationSeconds || input.desiredDurationSeconds || 60,
        },
      });

      // 3. Link StoryCharacters
      for (const char of resolvedCharacters) {
        await tx.storyCharacter.create({
          data: {
            id: randomUUID(),
            storyId,
            characterId: char.id,
          },
        });
      }

      // 4. Create Scenes in order
      const createdScenes = [];
      for (const prepScene of preparedScenes) {
        const sceneId = `${storyId}-scene-${prepScene.sceneNumber}`;
        const sc = await tx.scene.create({
          data: {
            id: randomUUID(),
            sceneId,
            storyId,
            title: prepScene.title,
            number: prepScene.sceneNumber,
            order: prepScene.order,
            startMs: prepScene.startMs,
            endMs: prepScene.endMs,
            narration: prepScene.narration,
            visualPrompt: prepScene.visualPrompt,
            cameraDirection: prepScene.cameraDirection,
            characterIds: prepScene.characterIds,
            estimatedDurationMs: prepScene.estimatedDurationMs,
            generationStatus: 'draft',
            animationData: prepScene.animationData as any,
          },
        });
        createdScenes.push(sc);
      }

      return {
        story: createdStory,
        scenes: createdScenes,
        characters: resolvedCharacters,
        storyId,
      };
    });

    if (input.idempotencyKey) {
      idempotencyCache.set(input.idempotencyKey, { storyId, timestamp: Date.now() });
    }

    return result;
  }

  /**
   * Intentionally regenerates an existing story in place with user confirmation,
   * replacing its scenes and updating metadata inside an atomic transaction.
   */
  public static async regenerateExistingStory(
    existingStoryId: string,
    structuredStory: StructuredStory,
    preparedScenes: PreparedSceneRecord[],
    resolvedCharacters: ResolvedCharacterInfo[],
    input: StoryGenerationInput
  ): Promise<PersistedStoryResult> {
    const existing = await (prisma as any).story.findUnique({
      where: { storyId: existingStoryId },
    });

    if (!existing) {
      throw new Error(`Story not found: ${existingStoryId}`);
    }

    return await (prisma as any).$transaction(async (tx: any) => {
      // 1. Update Story record
      const updatedStory = await tx.story.update({
        where: { storyId: existingStoryId },
        data: {
          title: structuredStory.title,
          logline: structuredStory.logline,
          lesson: structuredStory.lesson,
          topic: input.topic || existing.topic,
          ageGroup: input.ageGroup || existing.ageGroup,
          audience: input.audience || existing.audience,
          genre: input.genre || existing.genre,
          visualStyle: input.visualStyle || existing.visualStyle,
          targetDuration: structuredStory.estimatedDurationSeconds || existing.targetDuration,
        },
      });

      // 2. Remove existing scenes and their versions/images
      const oldScenes = await tx.scene.findMany({
        where: { storyId: existingStoryId },
        select: { sceneId: true },
      });
      const oldSceneIds = oldScenes.map((s: any) => s.sceneId);

      if (oldSceneIds.length > 0) {
        await tx.image.deleteMany({ where: { sceneId: { in: oldSceneIds } } });
        await tx.sceneVersion.deleteMany({ where: { sceneId: { in: oldSceneIds } } });
        await tx.scene.deleteMany({ where: { storyId: existingStoryId } });
      }

      // 3. Update StoryCharacter links
      await tx.storyCharacter.deleteMany({ where: { storyId: existingStoryId } });
      for (const char of resolvedCharacters) {
        await tx.storyCharacter.create({
          data: {
            id: randomUUID(),
            storyId: existingStoryId,
            characterId: char.id,
          },
        });
      }

      // 4. Create new scenes
      const createdScenes = [];
      for (const prepScene of preparedScenes) {
        const sceneId = `${existingStoryId}-scene-${prepScene.sceneNumber}`;
        const sc = await tx.scene.create({
          data: {
            id: randomUUID(),
            sceneId,
            storyId: existingStoryId,
            title: prepScene.title,
            number: prepScene.sceneNumber,
            order: prepScene.order,
            startMs: prepScene.startMs,
            endMs: prepScene.endMs,
            narration: prepScene.narration,
            visualPrompt: prepScene.visualPrompt,
            cameraDirection: prepScene.cameraDirection,
            characterIds: prepScene.characterIds,
            estimatedDurationMs: prepScene.estimatedDurationMs,
            generationStatus: 'draft',
            animationData: prepScene.animationData as any,
          },
        });
        createdScenes.push(sc);
      }

      return {
        story: updatedStory,
        scenes: createdScenes,
        characters: resolvedCharacters,
        storyId: existingStoryId,
      };
    });
  }
}
