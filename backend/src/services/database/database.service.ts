import dotenv from 'dotenv';
import path from 'path';

// Fallback to load .env if not yet loaded by bootstrap
if (!process.env.DATABASE_URL) {
  dotenv.config({ path: path.resolve(process.cwd(), '.env') });
  if (!process.env.DATABASE_URL) {
    dotenv.config({ path: path.resolve(__dirname, '../../..', '.env') });
  }
}

import { PrismaClient } from '../../generated/client';
import { PrismaPg } from '@prisma/adapter-pg';

let connUrl = process.env.DATABASE_URL;
if (connUrl && (connUrl.match(/@/g) || []).length > 1) {
  const match = connUrl.match(/^postgresql:\/\/([^:]+):(.+)@([^@]+)$/);
  if (match) {
    connUrl = `postgresql://${encodeURIComponent(match[1])}:${encodeURIComponent(match[2])}@${match[3]}`;
  }
}

const adapter = new PrismaPg({
  connectionString: connUrl,
});

const prisma = new PrismaClient({ adapter });

export function initializeDatabase() {
  console.log('[Database] Database initialized with Prisma (PostgreSQL)');
}

// Story operations
export async function createStory(data: {
  id: string;
  storyId: string;
  title: string;
  logline: string;
  lesson: string;
  topic?: string | null;
  ageGroup?: string | null;
  audience?: string | null;
  genre?: string | null;
  visualStyle?: string | null;
}) {
  return await prisma.story.upsert({
    where: { storyId: data.storyId },
    update: {
      title: data.title,
      logline: data.logline,
      lesson: data.lesson,
      topic: data.topic,
      ageGroup: data.ageGroup,
      audience: data.audience,
      genre: data.genre,
      visualStyle: data.visualStyle,
    },
    create: {
      id: data.id,
      storyId: data.storyId,
      title: data.title,
      logline: data.logline,
      lesson: data.lesson,
      topic: data.topic,
      ageGroup: data.ageGroup,
      audience: data.audience,
      genre: data.genre,
      visualStyle: data.visualStyle,
    },
  });
}

export async function updateStoryMetadata(storyId: string, data: {
  title?: string;
  logline?: string;
  lesson?: string;
  topic?: string | null;
  ageGroup?: string | null;
  audience?: string | null;
  genre?: string | null;
  visualStyle?: string | null;
  targetDuration?: number | null;
}) {
  return await prisma.story.update({
    where: { storyId },
    data,
  });
}

export async function getStoryByStoryId(storyId: string) {
  try {
    return await prisma.story.findUnique({
      where: { storyId },
    });
  } catch (error) {
    console.error('[Database] Error fetching story by storyId:', storyId, error);
    throw error;
  }
}

export async function getAllStories() {
  return await prisma.story.findMany({
    orderBy: { createdAt: 'desc' },
  });
}

export async function deleteStory(storyId: string) {
  return await prisma.$transaction(async (tx) => {
    // 1. Find all scenes for this story
    const scenes = await tx.scene.findMany({
      where: { storyId },
      select: { sceneId: true },
    });
    const sceneIds = scenes.map((s) => s.sceneId);

    // 2. Delete child records of scenes (images and scene versions)
    if (sceneIds.length > 0) {
      await tx.image.deleteMany({
        where: { sceneId: { in: sceneIds } },
      });
      await tx.sceneVersion.deleteMany({
        where: { sceneId: { in: sceneIds } },
      });
      await tx.scene.deleteMany({
        where: { storyId },
      });
    }

    // 3. Delete story-character links
    await tx.storyCharacter.deleteMany({
      where: { storyId },
    });

    // 4. Delete the story
    return await tx.story.delete({
      where: { storyId },
    });
  });
}

// Scene operations
export interface SceneData {
  id: string;
  sceneId: string;
  storyId: string;
  title: string;
  number: number;
  order?: number;
  startMs?: number;
  endMs?: number;
  narration?: string;
  visualPrompt?: string | null;
  cameraDirection?: string | null;
  characterIds?: string | null;
  imageUrl?: string | null;
  videoUrl?: string | null;
  audioUrl?: string | null;
  generationStatus?: string;
  estimatedDurationMs?: number;
  actualAudioDurationMs?: number | null;
  generationError?: string | null;
  animationData?: any;
}

export async function createScene(data: SceneData) {
  return await prisma.scene.upsert({
    where: { sceneId: data.sceneId },
    update: {
      storyId: data.storyId,
      title: data.title,
      number: data.number,
      order: data.order ?? data.number,
      startMs: data.startMs ?? 0,
      endMs: data.endMs ?? 0,
      narration: data.narration,
      visualPrompt: data.visualPrompt,
      cameraDirection: data.cameraDirection,
      characterIds: data.characterIds,
      imageUrl: data.imageUrl,
      videoUrl: data.videoUrl,
      audioUrl: data.audioUrl,
      generationStatus: data.generationStatus ?? 'draft',
      estimatedDurationMs: data.estimatedDurationMs ?? 0,
      actualAudioDurationMs: data.actualAudioDurationMs,
      generationError: data.generationError,
      animationData: data.animationData,
    },
    create: {
      id: data.id,
      sceneId: data.sceneId,
      storyId: data.storyId,
      title: data.title,
      number: data.number,
      order: data.order ?? data.number,
      startMs: data.startMs ?? 0,
      endMs: data.endMs ?? 0,
      narration: data.narration || '',
      visualPrompt: data.visualPrompt || null,
      cameraDirection: data.cameraDirection || null,
      characterIds: data.characterIds || null,
      imageUrl: data.imageUrl || null,
      videoUrl: data.videoUrl || null,
      audioUrl: data.audioUrl || null,
      generationStatus: data.generationStatus || 'draft',
      estimatedDurationMs: data.estimatedDurationMs || 0,
      actualAudioDurationMs: data.actualAudioDurationMs || null,
      generationError: data.generationError || null,
      animationData: data.animationData || null,
    },
  });
}

export async function getSceneBySceneId(sceneId: string) {
  return await prisma.scene.findFirst({
    where: {
      OR: [
        { sceneId },
        { id: sceneId },
      ],
    },
    include: {
      versions: {
        orderBy: { versionNumber: 'desc' },
      },
      images: {
        orderBy: { createdAt: 'desc' },
      },
    },
  });
}

export async function getScenesByStoryId(storyId: string, includeDeleted: boolean = false) {
  return await prisma.scene.findMany({
    where: { 
      storyId,
      ...(includeDeleted ? {} : { deletedAt: null })
    },
    orderBy: [
      { order: 'asc' },
      { number: 'asc' },
    ],
    include: {
      versions: {
        orderBy: { versionNumber: 'desc' },
      },
    },
  });
}

export async function updateScene(sceneId: string, data: {
  title?: string;
  narration?: string;
  number?: number;
  order?: number;
  startMs?: number;
  endMs?: number;
  visualPrompt?: string | null;
  cameraDirection?: string | null;
  characterIds?: string | null;
  imageUrl?: string | null;
  videoUrl?: string | null;
  audioUrl?: string | null;
  generationStatus?: string;
  estimatedDurationMs?: number;
  actualAudioDurationMs?: number | null;
  generationError?: string | null;
  animationData?: any;
}) {
  const existing = await getSceneBySceneId(sceneId);
  const targetKey = existing ? existing.sceneId : sceneId;

  return await prisma.scene.update({
    where: { sceneId: targetKey },
    data,
  });
}

export async function batchUpdateSceneTimelines(storyId: string, updates: Array<{
  sceneId: string;
  order: number;
  startMs: number;
  endMs: number;
  estimatedDurationMs?: number;
  actualAudioDurationMs?: number | null;
  title?: string;
  narration?: string;
  visualPrompt?: string | null;
  cameraDirection?: string | null;
  characterIds?: string | string[] | null;
  imageUrl?: string | null;
  videoUrl?: string | null;
  audioUrl?: string | null;
  generationStatus?: string;
  animationData?: any;
}>) {
  const operations = updates.map((update) => {
    const data: any = {
      order: update.order,
      startMs: update.startMs,
      endMs: update.endMs,
    };
    if (update.estimatedDurationMs !== undefined) data.estimatedDurationMs = update.estimatedDurationMs;
    if (update.actualAudioDurationMs !== undefined) data.actualAudioDurationMs = update.actualAudioDurationMs;
    if (update.title !== undefined) data.title = update.title;
    if (update.narration !== undefined) data.narration = update.narration;
    if (update.visualPrompt !== undefined) data.visualPrompt = update.visualPrompt;
    if (update.cameraDirection !== undefined) data.cameraDirection = update.cameraDirection;
    if (update.characterIds !== undefined) {
      data.characterIds = Array.isArray(update.characterIds)
        ? JSON.stringify(update.characterIds)
        : update.characterIds;
    }
    if (update.imageUrl !== undefined) data.imageUrl = update.imageUrl;
    if (update.videoUrl !== undefined) data.videoUrl = update.videoUrl;
    if (update.audioUrl !== undefined) data.audioUrl = update.audioUrl;
    if (update.generationStatus !== undefined) data.generationStatus = update.generationStatus;
    if (update.animationData !== undefined) data.animationData = update.animationData;

    return prisma.scene.update({
      where: { sceneId: update.sceneId },
      data,
    });
  });
  return await prisma.$transaction(operations);
}

export async function deleteScene(sceneId: string) {
  return await prisma.scene.update({
    where: { sceneId },
    data: { deletedAt: new Date() },
  });
}

export async function restoreScene(sceneId: string) {
  return await prisma.scene.update({
    where: { sceneId },
    data: { deletedAt: null },
  });
}

// Scene Version operations
export async function createSceneVersion(data: {
  id: string;
  sceneId: string;
  versionNumber?: number;
  prompt?: string | null;
  narration?: string | null;
  cameraDirection?: string | null;
  imageUrl?: string | null;
  videoUrl?: string | null;
  audioUrl?: string | null;
  durationMs?: number;
}) {
  const targetScene = await getSceneBySceneId(data.sceneId);
  const actualSceneId = targetScene ? targetScene.sceneId : data.sceneId;

  let nextVersionNumber = data.versionNumber;
  if (!nextVersionNumber) {
    const latest = await prisma.sceneVersion.findFirst({
      where: { sceneId: actualSceneId },
      orderBy: { versionNumber: 'desc' },
    });
    nextVersionNumber = (latest?.versionNumber ?? 0) + 1;
  }

  return await prisma.sceneVersion.create({
    data: {
      id: data.id,
      sceneId: actualSceneId,
      versionNumber: nextVersionNumber,
      prompt: data.prompt,
      narration: data.narration,
      cameraDirection: data.cameraDirection,
      imageUrl: data.imageUrl,
      videoUrl: data.videoUrl,
      audioUrl: data.audioUrl,
      durationMs: data.durationMs ?? 0,
    },
  });
}

export async function getSceneVersions(sceneId: string) {
  return await prisma.sceneVersion.findMany({
    where: { sceneId },
    orderBy: { versionNumber: 'desc' },
  });
}

export async function restoreSceneVersion(sceneId: string, versionId: string) {
  const version = await prisma.sceneVersion.findUnique({
    where: { id: versionId },
  });
  if (!version || version.sceneId !== sceneId) {
    throw new Error('Scene version not found');
  }

  return await prisma.scene.update({
    where: { sceneId },
    data: {
      visualPrompt: version.prompt,
      narration: version.narration ?? undefined,
      cameraDirection: version.cameraDirection,
      imageUrl: version.imageUrl,
      videoUrl: version.videoUrl,
      audioUrl: version.audioUrl,
    },
  });
}

// Image operations
export async function createImage(data: {
  id: string;
  sceneId: string;
  provider: string;
  model: string;
  prompt: string;
  storageKey: string;
  imageUrl: string;
  width: number;
  height: number;
  status: string;
}) {
  return await prisma.image.create({
    data: {
      id: data.id,
      sceneId: data.sceneId,
      provider: data.provider,
      model: data.model,
      prompt: data.prompt,
      storageKey: data.storageKey,
      imageUrl: data.imageUrl,
      width: data.width,
      height: data.height,
      status: data.status,
    },
  });
}

export async function getImagesBySceneId(sceneId: string) {
  return await prisma.image.findMany({
    where: { sceneId },
    orderBy: { createdAt: 'desc' },
  });
}

export async function getImageById(id: string) {
  return await prisma.image.findUnique({
    where: { id },
  });
}

export async function updateImageStatus(id: string, status: string) {
  return await prisma.image.update({
    where: { id },
    data: { status },
  });
}

// Character operations
export async function createCharacter(data: {
  id: string;
  name: string;
  species: string;
  personality: string;
  visualDescription: string;
  distinctiveFeatures: string;
  canonicalAppearance?: any;
  referenceImageUrl?: string;
  referenceImagePrompt?: string;
}) {
  // Check if character exists by name
  const existing = await prisma.character.findFirst({
    where: { name: data.name },
  });

  if (existing) {
    // Update existing character
    return await prisma.character.update({
      where: { id: existing.id },
      data: {
        species: data.species,
        personality: data.personality,
        visualDescription: data.visualDescription,
        distinctiveFeatures: data.distinctiveFeatures,
        canonicalAppearance: data.canonicalAppearance,
        referenceImageUrl: data.referenceImageUrl,
        referenceImagePrompt: data.referenceImagePrompt,
      },
    });
  }

  // Create new character
  return await prisma.character.create({
    data: {
      id: data.id,
      name: data.name,
      species: data.species,
      personality: data.personality,
      visualDescription: data.visualDescription,
      distinctiveFeatures: data.distinctiveFeatures,
      canonicalAppearance: data.canonicalAppearance,
      referenceImageUrl: data.referenceImageUrl,
      referenceImagePrompt: data.referenceImagePrompt,
    },
  });
}

export async function getCharacterByName(name: string) {
  return await prisma.character.findFirst({
    where: { name },
  });
}

export async function getCharacterById(id: string) {
  return await prisma.character.findUnique({
    where: { id },
  });
}

export async function getAllCharacters() {
  return await prisma.character.findMany();
}

export async function deleteCharacter(id: string) {
  return await prisma.$transaction(async (tx) => {
    // 1. Delete story-character join records
    await tx.storyCharacter.deleteMany({
      where: { characterId: id },
    });

    // 2. Delete the character itself
    return await tx.character.delete({
      where: { id },
    });
  });
}

export async function updateCharacter(id: string, data: {
  name?: string;
  species?: string;
  personality?: string;
  visualDescription?: string;
  distinctiveFeatures?: string;
  canonicalAppearance?: any;
  referenceImageUrl?: string;
  referenceImagePrompt?: string;
}) {
  return await prisma.character.update({
    where: { id },
    data,
  });
}

// StoryCharacter operations
export async function linkStoryCharacter(data: {
  id: string;
  storyId: string;
  characterId: string;
}) {
  return await prisma.storyCharacter.upsert({
    where: {
      storyId_characterId: {
        storyId: data.storyId,
        characterId: data.characterId,
      },
    },
    update: {},
    create: {
      id: data.id,
      storyId: data.storyId,
      characterId: data.characterId,
    },
  });
}

export async function getCharactersByStoryId(storyId: string) {
  const storyCharacters = await prisma.storyCharacter.findMany({
    where: { storyId },
    include: {
      character: true,
    },
  });

  return storyCharacters.map((sc) => sc.character);
}

export async function getStoriesByCharacterId(characterId: string) {
  const storyCharacters = await prisma.storyCharacter.findMany({
    where: { characterId },
    include: {
      story: true,
    },
  });

  return storyCharacters.map((sc) => sc.story);
}

export { prisma };
export default prisma;

