import { PrismaClient } from '../../generated/client';
import { PrismaPg } from '@prisma/adapter-pg';

const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL,
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

export async function getStoryByStoryId(storyId: string) {
  return await prisma.story.findUnique({
    where: { storyId },
  });
}

export async function getAllStories() {
  return await prisma.story.findMany({
    orderBy: { createdAt: 'desc' },
  });
}

export async function deleteStory(storyId: string) {
  return await prisma.story.delete({
    where: { storyId },
  });
}

// Scene operations
export async function createScene(data: {
  id: string;
  sceneId: string;
  storyId: string;
  title: string;
  number: number;
  narration?: string;
}) {
  return await prisma.scene.upsert({
    where: { sceneId: data.sceneId },
    update: {
      title: data.title,
      narration: data.narration,
    },
    create: {
      id: data.id,
      sceneId: data.sceneId,
      storyId: data.storyId,
      title: data.title,
      number: data.number,
      narration: data.narration || '',
    },
  });
}

export async function getSceneBySceneId(sceneId: string) {
  return await prisma.scene.findUnique({
    where: { sceneId },
  });
}

export async function getScenesByStoryId(storyId: string) {
  return await prisma.scene.findMany({
    where: { storyId },
    orderBy: { number: 'asc' },
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
  return await prisma.character.delete({
    where: { id },
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

export default prisma;
