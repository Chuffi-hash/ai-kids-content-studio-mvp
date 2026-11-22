import dotenv from "dotenv";
import path from "path";
import { randomUUID } from "crypto";

// Fallback to load .env if not yet loaded by bootstrap
if (!process.env.DATABASE_URL) {
  dotenv.config({ path: path.resolve(process.cwd(), ".env") });
  if (!process.env.DATABASE_URL) {
    dotenv.config({ path: path.resolve(__dirname, "../../..", ".env") });
  }
}

import { PrismaClient } from "../../generated/client";
import { PrismaPg } from "@prisma/adapter-pg";

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

export async function initializeDatabase() {
  try {
    await prisma.$queryRaw`SELECT 1`;
    // Verify core schema tables readiness without destructive resets
    await prisma.story.findFirst({ select: { id: true } });
    console.log(
      "[Database] Database initialized with Prisma (PostgreSQL) - Schema verified & connection healthy",
    );
    return true;
  } catch (err: any) {
    if (err.code === "P1001") {
      console.warn(
        "[Database] Warning: PostgreSQL database is unreachable at localhost. Please verify that Postgres is running on the configured port.",
      );
    } else if (err.code === "P2022") {
      console.warn(
        "[Database] Warning: Schema column mismatch detected. Run `npx prisma migrate deploy` to synchronize migrations.",
      );
    } else {
      console.warn("[Database] Database connection notice:", err.message);
    }
    return false;
  }
}

// Story operations
export async function createStory(data: {
  id?: string;
  storyId?: string;
  title: string;
  logline?: string;
  lesson?: string;
  topic?: string | null;
  ageGroup?: string | null;
  audience?: string | null;
  genre?: string | null;
  visualStyle?: string | null;
  targetDuration?: number | null;
  visualBible?: any;
  flowProjectId?: string | null;
  originalScript?: string | null;
  productionStage?: string | null;
}) {
  const id = data.id || randomUUID();
  const storyId =
    data.storyId || `story-${Date.now()}-${randomUUID().slice(0, 8)}`;
  return await prisma.story.upsert({
    where: { storyId },
    update: {
      title: data.title,
      logline: data.logline || "",
      lesson: data.lesson || "",
      topic: data.topic,
      ageGroup: data.ageGroup,
      audience: data.audience,
      genre: data.genre,
      visualStyle: data.visualStyle,
      targetDuration: data.targetDuration,
      ...(data.flowProjectId !== undefined
        ? { flowProjectId: data.flowProjectId }
        : {}),
      ...(data.originalScript !== undefined
        ? { originalScript: data.originalScript }
        : {}),
      ...(data.productionStage !== undefined
        ? { productionStage: data.productionStage }
        : {}),
      ...(data.visualBible !== undefined
        ? { visualBible: data.visualBible }
        : {}),
    },
    create: {
      id,
      storyId,
      title: data.title,
      logline: data.logline || "",
      lesson: data.lesson || "",
      topic: data.topic,
      ageGroup: data.ageGroup,
      audience: data.audience,
      genre: data.genre,
      visualStyle: data.visualStyle,
      targetDuration: data.targetDuration,
      visualBible: data.visualBible || null,
      flowProjectId: data.flowProjectId || null,
      originalScript: data.originalScript || null,
      productionStage: data.productionStage || "script",
    },
  });
}

export async function updateStoryMetadata(
  storyId: string,
  data: {
    title?: string;
    logline?: string;
    lesson?: string;
    topic?: string | null;
    ageGroup?: string | null;
    audience?: string | null;
    genre?: string | null;
    visualStyle?: string | null;
    targetDuration?: number | null;
    visualBible?: any;
    flowProjectId?: string | null;
    originalScript?: string | null;
    productionStage?: string | null;
  },
) {
  return await prisma.story.update({
    where: { storyId },
    data,
  });
}

export async function updateStoryFlowProject(
  storyId: string,
  flowProjectId: string | null,
) {
  const story = await getStoryByStoryId(storyId);
  if (!story) {
    throw new Error(`Story not found: ${storyId}`);
  }
  return await prisma.story.update({
    where: { id: story.id },
    data: {
      flowProjectId,
    },
  });
}

export async function updateStoryVisualBible(
  storyId: string,
  visualBible: any,
) {
  return await prisma.story.update({
    where: { storyId },
    data: {
      visualBible,
    },
  });
}

export async function getStoryVisualBible(storyId: string) {
  const story = await prisma.story.findUnique({
    where: { storyId },
    select: {
      visualBible: true,
      visualStyle: true,
      title: true,
      genre: true,
      ageGroup: true,
    },
  });
  return story?.visualBible || null;
}

export async function getStoryByStoryId(storyId: string) {
  try {
    let story = await prisma.story.findUnique({
      where: { storyId },
    });
    if (!story) {
      story = await prisma.story.findUnique({
        where: { id: storyId },
      });
    }
    return story;
  } catch (error) {
    console.error(
      "[Database] Error fetching story by storyId:",
      storyId,
      error,
    );
    throw error;
  }
}

export async function getAllStories() {
  return await prisma.story.findMany({
    orderBy: { createdAt: "desc" },
  });
}

export async function deleteStory(storyId: string) {
  return await prisma.$transaction(async (tx) => {
    // 0. Resolve canonical story
    const targetStory = await tx.story.findFirst({
      where: { OR: [{ storyId }, { id: storyId }] },
    });
    if (!targetStory) {
      throw new Error(`Story not found: ${storyId}`);
    }
    const resolvedStoryId = targetStory.storyId;

    // 1. Find all scenes for this story (including soft-deleted scenes)
    const scenes = await tx.scene.findMany({
      where: { storyId: resolvedStoryId },
      select: { sceneId: true },
    });
    const sceneIds = scenes.map((s) => s.sceneId);

    // 2. Delete all Shot records first (shots reference scenes and story)
    await tx.shot.deleteMany({
      where: {
        OR: [
          { storyId: resolvedStoryId },
          ...(sceneIds.length > 0 ? [{ sceneId: { in: sceneIds } }] : []),
        ],
      },
    });

    // 3. Delete child records of scenes (images and scene versions), then scenes
    if (sceneIds.length > 0) {
      await tx.image.deleteMany({
        where: { sceneId: { in: sceneIds } },
      });
      await tx.sceneVersion.deleteMany({
        where: { sceneId: { in: sceneIds } },
      });
      await tx.scene.deleteMany({
        where: { storyId: resolvedStoryId },
      });
    }

    // 4. Delete story-character links
    await tx.storyCharacter.deleteMany({
      where: { storyId: resolvedStoryId },
    });

    // 5. Delete the story
    return await tx.story.delete({
      where: { storyId: resolvedStoryId },
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
      generationStatus: data.generationStatus ?? "draft",
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
      narration: data.narration || "",
      visualPrompt: data.visualPrompt || null,
      cameraDirection: data.cameraDirection || null,
      characterIds: data.characterIds || null,
      imageUrl: data.imageUrl || null,
      videoUrl: data.videoUrl || null,
      audioUrl: data.audioUrl || null,
      generationStatus: data.generationStatus || "draft",
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
      OR: [{ sceneId }, { id: sceneId }],
    },
    include: {
      versions: {
        orderBy: { versionNumber: "desc" },
      },
      backgroundVersions: {
        orderBy: { version: "asc" },
      },
      images: {
        orderBy: { createdAt: "desc" },
      },
    },
  });
}

export const getSceneById = getSceneBySceneId;

export async function getScenesByStoryId(
  storyId: string,
  includeDeleted: boolean = false,
) {
  return await prisma.scene.findMany({
    where: {
      storyId,
      ...(includeDeleted ? {} : { deletedAt: null }),
    },
    orderBy: [{ order: "asc" }, { number: "asc" }],
    include: {
      versions: {
        orderBy: { versionNumber: "desc" },
      },
      backgroundVersions: {
        orderBy: { version: "asc" },
      },
    },
  });
}

export async function updateScene(
  sceneId: string,
  data: {
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
    activeBackgroundVersion?: number | null;
  },
) {
  const existing = await getSceneBySceneId(sceneId);
  const targetKey = existing ? existing.sceneId : sceneId;

  return await prisma.scene.update({
    where: { sceneId: targetKey },
    data,
  });
}

export async function batchUpdateSceneTimelines(
  storyId: string,
  updates: Array<{
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
  }>,
) {
  if (updates.length > 0) {
    const sceneIds = updates.map((u) => u.sceneId);
    const existing = await prisma.scene.findMany({
      where: {
        storyId,
        sceneId: { in: sceneIds },
      },
      select: { sceneId: true },
    });
    if (existing.length !== updates.length) {
      throw new Error(
        "One or more scenes do not belong to the story being edited",
      );
    }
  }

  const operations = updates.map((update) => {
    const data: any = {
      order: update.order,
      startMs: update.startMs,
      endMs: update.endMs,
    };
    if (update.estimatedDurationMs !== undefined)
      data.estimatedDurationMs = update.estimatedDurationMs;
    if (update.actualAudioDurationMs !== undefined)
      data.actualAudioDurationMs = update.actualAudioDurationMs;
    if (update.title !== undefined) data.title = update.title;
    if (update.narration !== undefined) data.narration = update.narration;
    if (update.visualPrompt !== undefined)
      data.visualPrompt = update.visualPrompt;
    if (update.cameraDirection !== undefined)
      data.cameraDirection = update.cameraDirection;
    if (update.characterIds !== undefined) {
      data.characterIds = Array.isArray(update.characterIds)
        ? JSON.stringify(update.characterIds)
        : update.characterIds;
    }
    if (update.imageUrl !== undefined) data.imageUrl = update.imageUrl;
    if (update.videoUrl !== undefined) data.videoUrl = update.videoUrl;
    if (update.audioUrl !== undefined) data.audioUrl = update.audioUrl;
    if (update.generationStatus !== undefined)
      data.generationStatus = update.generationStatus;
    if (update.animationData !== undefined)
      data.animationData = update.animationData;

    return prisma.scene.update({
      where: { sceneId: update.sceneId },
      data,
    });
  });
  return await prisma.$transaction(operations);
}

export async function deleteScene(sceneId: string) {
  return await prisma.$transaction(async (tx) => {
    const target = await tx.scene.findFirst({
      where: { OR: [{ sceneId }, { id: sceneId }] },
    });
    if (!target) throw new Error("Scene not found");

    const deleted = await tx.scene.update({
      where: { sceneId: target.sceneId },
      data: { deletedAt: new Date() },
    });

    // Recalculate contiguous order and start/end times for remaining active scenes
    const remainingScenes = await tx.scene.findMany({
      where: { storyId: target.storyId, deletedAt: null },
      orderBy: [{ order: "asc" }, { number: "asc" }],
    });

    let currentStartMs = 0;
    for (let i = 0; i < remainingScenes.length; i++) {
      const sc = remainingScenes[i];
      const dur =
        sc.endMs > sc.startMs
          ? sc.endMs - sc.startMs
          : sc.estimatedDurationMs || 5000;
      await tx.scene.update({
        where: { sceneId: sc.sceneId },
        data: {
          order: i + 1,
          number: i + 1,
          startMs: currentStartMs,
          endMs: currentStartMs + dur,
        },
      });
      currentStartMs += dur;
    }

    return deleted;
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
      orderBy: { versionNumber: "desc" },
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
    orderBy: { versionNumber: "desc" },
  });
}

export async function restoreSceneVersion(sceneId: string, versionId: string) {
  const version = await prisma.sceneVersion.findUnique({
    where: { id: versionId },
  });
  if (!version || version.sceneId !== sceneId) {
    throw new Error("Scene version not found");
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
  googleFlowProjectId?: string | null;
  googleFlowEditId?: string | null;
  googleFlowEditUrl?: string | null;
  googleFlowPrompt?: string | null;
  googleFlowParentAssetId?: string | null;
  googleFlowVersion?: number | null;
  googleFlowImageId?: string | null;
  googleFlowImageRef?: string | null;
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
      googleFlowProjectId: data.googleFlowProjectId,
      googleFlowEditId: data.googleFlowEditId,
      googleFlowEditUrl: data.googleFlowEditUrl,
      googleFlowPrompt: data.googleFlowPrompt,
      googleFlowParentAssetId: data.googleFlowParentAssetId,
      googleFlowVersion: data.googleFlowVersion ?? 1,
      googleFlowImageId: data.googleFlowImageId,
      googleFlowImageRef: data.googleFlowImageRef,
    },
  });
}

export async function getImagesBySceneId(sceneId: string) {
  return await prisma.image.findMany({
    where: { sceneId },
    orderBy: { createdAt: "desc" },
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

// Background Image Version operations
export async function createBackgroundImageVersion(data: {
  id?: string;
  sceneId: string;
  version?: number;
  provider: string;
  model?: string | null;
  prompt?: string | null;
  parentVersionId?: string | null;
  localImageId?: string | null;
  storageKey?: string | null;
  imageUrl?: string | null;
  width?: number | null;
  height?: number | null;
  aspectRatio?: string | null;
  providerMetadata?: any;
  status?: string;
  makeActive?: boolean;
}) {
  return await prisma.$transaction(async (tx) => {
    const targetScene = await tx.scene.findFirst({
      where: {
        OR: [{ sceneId: data.sceneId }, { id: data.sceneId }],
      },
    });

    if (!targetScene) {
      throw new Error(`Scene not found: ${data.sceneId}`);
    }

    const actualSceneId = targetScene.sceneId;

    let targetVersion = data.version;
    if (typeof targetVersion !== "number" || targetVersion <= 0) {
      const highest = await tx.backgroundImageVersion.findFirst({
        where: { sceneId: actualSceneId },
        orderBy: { version: "desc" },
      });
      targetVersion = (highest?.version ?? 0) + 1;
    }

    const parsedMetadata =
      typeof data.providerMetadata === "string"
        ? JSON.parse(data.providerMetadata)
        : data.providerMetadata ?? undefined;
    const flowMetadata =
      parsedMetadata?.googleFlow && typeof parsedMetadata.googleFlow === "object"
        ? parsedMetadata.googleFlow
        : parsedMetadata ?? {};

    const versionRecord = await tx.backgroundImageVersion.create({
      data: {
        id: data.id || randomUUID(),
        sceneId: actualSceneId,
        version: targetVersion,
        provider: data.provider,
        model: data.model || null,
        prompt: data.prompt || null,
        parentVersionId: data.parentVersionId || null,
        localImageId: data.localImageId || null,
        storageKey: data.storageKey || null,
        imageUrl: data.imageUrl || null,
        width: data.width || null,
        height: data.height || null,
        aspectRatio: data.aspectRatio || null,
        providerMetadata: parsedMetadata,
        status: data.status || "completed",
      },
    });

    const shouldMakeActive = data.makeActive !== false;
    if (shouldMakeActive) {
      const currentAnim = (targetScene.animationData as any) || {};
      const currentBg = currentAnim.background || {};
      const updatedAnim = {
        ...currentAnim,
        background: {
          ...currentBg,
          imageUrl: data.imageUrl || targetScene.imageUrl,
          activeVersion: targetVersion,
          versionId: versionRecord.id,
          provider: data.provider,
          prompt: data.prompt ?? currentBg.prompt,
          googleFlowProjectId: flowMetadata.projectId ?? flowMetadata.googleFlowProjectId ?? currentBg.googleFlowProjectId,
          googleFlowEditId: flowMetadata.editId ?? flowMetadata.googleFlowEditId ?? currentBg.googleFlowEditId,
          googleFlowEditUrl: flowMetadata.editUrl ?? flowMetadata.googleFlowEditUrl ?? currentBg.googleFlowEditUrl,
          googleFlowPrompt: flowMetadata.prompt ?? data.prompt ?? currentBg.googleFlowPrompt ?? null,
          googleFlowImageId:
            flowMetadata.imageId ??
            flowMetadata.googleFlowImageId ??
            flowMetadata.editId ??
            flowMetadata.googleFlowEditId ??
            currentBg.googleFlowImageId ??
            currentBg.googleFlowEditId ??
            null,
          googleFlowImageRef: flowMetadata.imageRef ?? flowMetadata.googleFlowImageRef ?? currentBg.googleFlowImageRef ?? null,
          googleFlowImageSourceUrl: flowMetadata.imageSourceUrl ?? flowMetadata.googleFlowImageSourceUrl ?? currentBg.googleFlowImageSourceUrl ?? null,
          googleFlowParentAssetId: flowMetadata.parentAssetId ?? flowMetadata.googleFlowParentAssetId ?? currentBg.googleFlowParentAssetId ?? null,
          googleFlowVersion: targetVersion,
        },
      };

      await tx.scene.update({
        where: { sceneId: actualSceneId },
        data: {
          imageUrl: data.imageUrl || targetScene.imageUrl,
          activeBackgroundVersion: targetVersion,
          animationData: updatedAnim,
        },
      });
    }

    return versionRecord;
  });
}

export async function getBackgroundImageVersions(sceneId: string) {
  const targetScene = await getSceneBySceneId(sceneId);
  const actualSceneId = targetScene ? targetScene.sceneId : sceneId;

  return await prisma.backgroundImageVersion.findMany({
    where: { sceneId: actualSceneId },
    orderBy: { version: "asc" },
  });
}

export async function getBackgroundImageVersion(id: string) {
  return await prisma.backgroundImageVersion.findUnique({
    where: { id },
  });
}

export async function restoreBackgroundImageVersion(
  sceneId: string,
  versionIdOrNumber: string | number,
) {
  return await prisma.$transaction(async (tx) => {
    const targetScene = await tx.scene.findFirst({
      where: {
        OR: [{ sceneId }, { id: sceneId }],
      },
    });

    if (!targetScene) {
      throw new Error(`Scene not found: ${sceneId}`);
    }

    const actualSceneId = targetScene.sceneId;

    let targetVersion;
    if (typeof versionIdOrNumber === "number") {
      targetVersion = await tx.backgroundImageVersion.findUnique({
        where: {
          sceneId_version: {
            sceneId: actualSceneId,
            version: versionIdOrNumber,
          },
        },
      });
    } else {
      targetVersion = await tx.backgroundImageVersion.findFirst({
        where: {
          id: versionIdOrNumber,
          sceneId: actualSceneId,
        },
      });
    }

    if (!targetVersion) {
      throw new Error(`Background image version not found: ${versionIdOrNumber}`);
    }

    const currentAnim = (targetScene.animationData as any) || {};
    const currentBg = currentAnim.background || {};
    const providerMeta = (targetVersion.providerMetadata as any) || {};
    const flowMetadata =
      providerMeta.googleFlow && typeof providerMeta.googleFlow === "object"
        ? providerMeta.googleFlow
        : providerMeta;

    const updatedAnim = {
      ...currentAnim,
      background: {
        ...currentBg,
        imageUrl: targetVersion.imageUrl,
        activeVersion: targetVersion.version,
        versionId: targetVersion.id,
        provider: targetVersion.provider,
        prompt: targetVersion.prompt ?? currentBg.prompt,
        googleFlowProjectId: flowMetadata.projectId ?? flowMetadata.googleFlowProjectId ?? currentBg.googleFlowProjectId,
        googleFlowEditId: flowMetadata.editId ?? flowMetadata.googleFlowEditId ?? currentBg.googleFlowEditId,
        googleFlowEditUrl: flowMetadata.editUrl ?? flowMetadata.googleFlowEditUrl ?? currentBg.googleFlowEditUrl,
        googleFlowPrompt: flowMetadata.prompt ?? targetVersion.prompt ?? currentBg.googleFlowPrompt ?? null,
        googleFlowImageId:
          flowMetadata.imageId ??
          flowMetadata.googleFlowImageId ??
          flowMetadata.editId ??
          flowMetadata.googleFlowEditId ??
          null,
        googleFlowImageRef: flowMetadata.imageRef ?? flowMetadata.googleFlowImageRef ?? null,
        googleFlowImageSourceUrl: flowMetadata.imageSourceUrl ?? flowMetadata.googleFlowImageSourceUrl ?? null,
        googleFlowParentAssetId: flowMetadata.parentAssetId ?? flowMetadata.googleFlowParentAssetId ?? null,
        googleFlowVersion: targetVersion.version,
      },
    };

    const updatedScene = await tx.scene.update({
      where: { sceneId: actualSceneId },
      data: {
        imageUrl: targetVersion.imageUrl || targetScene.imageUrl,
        activeBackgroundVersion: targetVersion.version,
        animationData: updatedAnim,
      },
      include: {
        backgroundVersions: {
          orderBy: { version: "asc" },
        },
      },
    });

    return {
      scene: updatedScene,
      restoredVersion: targetVersion,
    };
  });
}

export class CharacterConflictError extends Error {
  statusCode: number;
  code: string;

  constructor(message: string) {
    super(message);
    this.name = "CharacterConflictError";
    this.statusCode = 409;
    this.code = "P2002";
  }
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
  const trimmedName = data.name.trim();

  // Check if character already exists by name (case-insensitive)
  const existing = await prisma.character.findFirst({
    where: {
      name: {
        equals: trimmedName,
        mode: "insensitive",
      },
    },
  });

  if (existing) {
    throw new CharacterConflictError(
      `Character with name "${trimmedName}" already exists`,
    );
  }

  // Create new character
  return await prisma.character.create({
    data: {
      id: data.id,
      name: trimmedName,
      species: data.species || "human",
      personality: data.personality || "friendly and curious",
      visualDescription:
        data.visualDescription ||
        (data as any).description ||
        `${trimmedName} the ${data.species || "character"}`,
      distinctiveFeatures: data.distinctiveFeatures || "",
      canonicalAppearance: data.canonicalAppearance,
      referenceImageUrl: data.referenceImageUrl,
      referenceImagePrompt: data.referenceImagePrompt,
    },
  });
}

export async function getCharacterByName(name: string) {
  const trimmedName = name.trim();
  return await prisma.character.findFirst({
    where: {
      name: {
        equals: trimmedName,
        mode: "insensitive",
      },
    },
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

export async function updateCharacter(
  id: string,
  data: {
    name?: string;
    species?: string;
    personality?: string;
    visualDescription?: string;
    distinctiveFeatures?: string;
    canonicalAppearance?: any;
    referenceImageUrl?: string;
    referenceImagePrompt?: string;
  },
) {
  const updateData = { ...data };
  if (updateData.name) {
    const trimmed = updateData.name.trim();
    const existing = await prisma.character.findFirst({
      where: {
        name: {
          equals: trimmed,
          mode: "insensitive",
        },
      },
    });
    if (existing && existing.id !== id) {
      throw new CharacterConflictError(
        `Character with name "${trimmed}" already exists`,
      );
    }
    updateData.name = trimmed;
  }

  return await prisma.character.update({
    where: { id },
    data: updateData,
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

export async function unlinkStoryCharacter(
  storyId: string,
  characterId: string,
) {
  return await prisma.storyCharacter.deleteMany({
    where: {
      storyId,
      characterId,
    },
  });
}

export async function setStoryCharacters(
  storyId: string,
  characterIds: string[],
) {
  return await prisma.$transaction(async (tx) => {
    await tx.storyCharacter.deleteMany({
      where: { storyId },
    });
    for (const characterId of characterIds) {
      await tx.storyCharacter.create({
        data: {
          id: randomUUID(),
          storyId,
          characterId,
        },
      });
    }
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

// ====================================================
// Shot Operations (Cinematic Scene & Shot Director)
// ====================================================

export interface CreateShotInput {
  id?: string;
  shotId?: string;
  storyId: string;
  sceneId: string;
  number: number;
  order?: number;
  title?: string;
  description?: string;
  durationMs?: number;
  shotType?: string;
  cameraAngle?: string;
  cameraMovement?: string;
  lighting?: string;
  shotDirection?: any;
  characterInstructions?: any;
  backgroundPrompt?: string | null;
  videoPrompt?: string | null;
  promptHistory?: any;
  backgroundUrl?: string | null;
  videoUrl?: string | null;
  assetStatus?: string;
  approvalStatus?: string;
  productionStatus?: string;
}

export async function createShot(data: CreateShotInput) {
  const id = data.id || randomUUID();
  const shotId =
    data.shotId ||
    `shot-${data.sceneId}-${data.number}-${randomUUID().slice(0, 6)}`;
  return await prisma.shot.create({
    data: {
      id,
      shotId,
      storyId: data.storyId,
      sceneId: data.sceneId,
      number: data.number,
      order: data.order ?? data.number,
      title: data.title || `Shot ${data.number}`,
      description: data.description || "",
      durationMs: data.durationMs || 5000,
      shotType: data.shotType || "wide_establishing",
      cameraAngle: data.cameraAngle || "eye_level",
      cameraMovement: data.cameraMovement || "static",
      lighting: data.lighting || "Natural day lighting",
      shotDirection: data.shotDirection ?? null,
      characterInstructions: data.characterInstructions ?? null,
      backgroundPrompt: data.backgroundPrompt || null,
      videoPrompt: data.videoPrompt || null,
      promptHistory: data.promptHistory ?? [],
      backgroundUrl: data.backgroundUrl || null,
      videoUrl: data.videoUrl || null,
      assetStatus: data.assetStatus || "pending",
      approvalStatus: data.approvalStatus || "pending",
      productionStatus: data.productionStatus || "draft",
    },
  });
}

export async function getShotsByStoryId(
  storyId: string,
  options?: { includeArchived?: boolean },
) {
  return await prisma.shot.findMany({
    where: {
      storyId,
      ...(options?.includeArchived
        ? {}
        : { productionStatus: { not: "archived" } }),
    },
    orderBy: [{ order: "asc" }, { number: "asc" }],
  });
}

export async function getShotsBySceneId(
  sceneId: string,
  options?: { includeArchived?: boolean },
) {
  return await prisma.shot.findMany({
    where: {
      sceneId,
      ...(options?.includeArchived
        ? {}
        : { productionStatus: { not: "archived" } }),
    },
    orderBy: [{ order: "asc" }, { number: "asc" }],
  });
}

export async function getShotById(shotId: string) {
  return await prisma.shot.findUnique({
    where: { shotId },
    include: {
      scene: true,
      story: true,
    },
  });
}

export async function updateShot(
  shotId: string,
  updates: Partial<{
    title: string;
    description: string;
    durationMs: number;
    order: number;
    number: number;
    shotType: string;
    cameraAngle: string;
    cameraMovement: string;
    lighting: string;
    shotDirection: any;
    characterInstructions: any;
    backgroundPrompt: string;
    videoPrompt: string;
    promptHistory: any;
    backgroundUrl: string;
    videoUrl: string;
    assetStatus: string;
    approvalStatus: string;
    productionStatus: string;
    transitionType: string;
    transitionDurationMs: number;
    userEditedFields: any;
  }>,
  options?: { isUserAction?: boolean },
) {
  const existing = await prisma.shot.findUnique({
    where: { shotId },
  });

  const currentEdited =
    (existing?.userEditedFields as Record<string, boolean>) || {};
  const newlyEdited: Record<string, boolean> = { ...currentEdited };

  if (options?.isUserAction !== false) {
    for (const key of Object.keys(updates)) {
      if (key !== "userEditedFields" && key !== "updatedAt") {
        newlyEdited[key] = true;
      }
    }
  }

  return await prisma.shot.update({
    where: { shotId },
    data: {
      ...updates,
      userEditedFields: newlyEdited,
    },
  });
}

export async function deleteShot(shotId: string) {
  return await prisma.shot.delete({
    where: { shotId },
  });
}

export async function reconcileAndUpsertSceneShots(
  storyId: string,
  sceneId: string,
  shots: CreateShotInput[],
) {
  return await prisma.$transaction(async (tx) => {
    const existing = await tx.shot.findMany({
      where: { sceneId },
      orderBy: { order: "asc" },
    });

    const matchedIds = new Set<string>();
    const results = [];

    for (let i = 0; i < shots.length; i++) {
      const s = shots[i];
      // Match by shotId first, then by shot number
      const match = existing.find(
        (e) => (s.shotId && e.shotId === s.shotId) || e.number === s.number,
      );

      if (match) {
        matchedIds.add(match.id);
        const hasCustomPrompt =
          Array.isArray(match.promptHistory) && match.promptHistory.length > 1;
        const isApproved = match.approvalStatus === "approved";
        const hasAsset = Boolean(match.backgroundUrl || match.videoUrl);
        const userEdits =
          ((match as any).userEditedFields as Record<string, boolean>) || {};

        // Preserve user edited prompts and fields if user touched them, or if approved or manually customized
        const titleVal =
          userEdits["title"] || isApproved
            ? match.title
            : s.title || match.title;
        const descVal =
          userEdits["description"] || isApproved
            ? match.description
            : s.description || match.description;
        const durVal = userEdits["durationMs"]
          ? match.durationMs
          : s.durationMs || match.durationMs;
        const shotTypeVal =
          userEdits["shotType"] || isApproved
            ? match.shotType
            : s.shotType || match.shotType;
        const camAngleVal = userEdits["cameraAngle"]
          ? match.cameraAngle
          : s.cameraAngle || match.cameraAngle;
        const camMoveVal = userEdits["cameraMovement"]
          ? match.cameraMovement
          : s.cameraMovement || match.cameraMovement;
        const bgPromptVal =
          userEdits["backgroundPrompt"] || isApproved || hasCustomPrompt
            ? match.backgroundPrompt
            : s.backgroundPrompt || match.backgroundPrompt;
        const vidPromptVal =
          userEdits["videoPrompt"] || isApproved || hasCustomPrompt
            ? match.videoPrompt
            : s.videoPrompt || match.videoPrompt;
        const history =
          Array.isArray(match.promptHistory) && match.promptHistory.length > 0
            ? match.promptHistory
            : (s.promptHistory ?? []);

        const updated = await tx.shot.update({
          where: { id: match.id },
          data: {
            title: titleVal,
            description: descVal,
            durationMs: durVal,
            shotType: shotTypeVal,
            cameraAngle: camAngleVal,
            cameraMovement: camMoveVal,
            lighting: s.lighting || match.lighting,
            shotDirection: s.shotDirection ?? match.shotDirection,
            characterInstructions:
              s.characterInstructions ?? match.characterInstructions,
            backgroundPrompt: bgPromptVal,
            videoPrompt: vidPromptVal,
            promptHistory: history,
            backgroundUrl: match.backgroundUrl || s.backgroundUrl,
            videoUrl: match.videoUrl || s.videoUrl,
            assetStatus: hasAsset
              ? match.assetStatus
              : s.assetStatus || match.assetStatus,
            approvalStatus: match.approvalStatus || s.approvalStatus,
            productionStatus:
              hasAsset || isApproved
                ? "ready"
                : s.productionStatus || match.productionStatus,
          },
        });
        results.push(updated);
      } else {
        // Create new shot non-destructively
        const id = s.id || randomUUID();
        const shotId =
          s.shotId ||
          `shot-${sceneId}-${s.number || i + 1}-${randomUUID().slice(0, 6)}`;
        const created = await tx.shot.create({
          data: {
            id,
            shotId,
            storyId,
            sceneId,
            number: s.number ?? i + 1,
            order: s.order ?? i + 1,
            title: s.title || `Shot ${s.number ?? i + 1}`,
            description: s.description || "",
            durationMs: s.durationMs || 5000,
            shotType: s.shotType || "wide_establishing",
            cameraAngle: s.cameraAngle || "eye_level",
            cameraMovement: s.cameraMovement || "static",
            lighting: s.lighting || "Natural day lighting",
            shotDirection: s.shotDirection ?? null,
            characterInstructions: s.characterInstructions ?? null,
            backgroundPrompt: s.backgroundPrompt || null,
            videoPrompt: s.videoPrompt || null,
            promptHistory: s.promptHistory ?? [],
            backgroundUrl: s.backgroundUrl || null,
            videoUrl: s.videoUrl || null,
            assetStatus: s.assetStatus || "pending",
            approvalStatus: s.approvalStatus || "pending",
            productionStatus: s.productionStatus || "draft",
          },
        });
        results.push(created);
      }
    }

    // Preserve unmatched existing shots with approved work, user edits, custom prompts, or attached assets by archiving them
    for (const ex of existing) {
      if (!matchedIds.has(ex.id)) {
        const hasAsset = Boolean(ex.backgroundUrl || ex.videoUrl);
        const isApproved = ex.approvalStatus === "approved";
        const userEdits =
          ((ex as any).userEditedFields as Record<string, boolean>) || {};
        const hasUserEdits = Object.keys(userEdits).length > 0;
        const hasCustomPrompt =
          Array.isArray(ex.promptHistory) && ex.promptHistory.length > 1;
        if (hasAsset || isApproved || hasUserEdits || hasCustomPrompt) {
          const archived = await tx.shot.update({
            where: { id: ex.id },
            data: { productionStatus: "archived" },
          });
          results.push(archived);
        } else {
          await tx.shot.delete({ where: { id: ex.id } });
        }
      }
    }

    return results;
  });
}

export async function replaceSceneShots(
  storyId: string,
  sceneId: string,
  shots: CreateShotInput[],
) {
  return reconcileAndUpsertSceneShots(storyId, sceneId, shots);
}

// -------------------------------------------------------------------------
// Flow Character Mapping operations
// -------------------------------------------------------------------------

export async function getFlowCharacterMapping(storyId: string, characterId: string) {
  return prisma.flowCharacterMapping.findUnique({
    where: {
      storyId_characterId: { storyId, characterId },
    },
    include: {
      character: true,
      story: true,
    },
  });
}

export async function listFlowCharacterMappings(storyId: string) {
  return prisma.flowCharacterMapping.findMany({
    where: { storyId },
    include: {
      character: true,
    },
    orderBy: { createdAt: 'asc' },
  });
}

export async function upsertFlowCharacterMapping(data: {
  storyId: string;
  characterId: string;
  flowProjectId: string;
  flowCharacterName: string;
  flowCharacterId?: string | null;
  flowCharacterUrl?: string | null;
  activeVersion?: number;
  syncStatus?: string;
  sourceReferenceUrl?: string | null;
  sourceFingerprint?: string | null;
  lastSyncedAt?: Date | null;
  lastError?: string | null;
}) {
  return (prisma as any).flowCharacterMapping.upsert({
    where: {
      storyId_characterId: {
        storyId: data.storyId,
        characterId: data.characterId,
      },
    },
    create: {
      storyId: data.storyId,
      characterId: data.characterId,
      flowProjectId: data.flowProjectId,
      flowCharacterName: data.flowCharacterName,
      flowCharacterId: data.flowCharacterId || null,
      flowCharacterUrl: data.flowCharacterUrl || null,
      activeVersion: data.activeVersion ?? 1,
      syncStatus: data.syncStatus || 'synced',
      sourceReferenceUrl: data.sourceReferenceUrl,
      sourceFingerprint: data.sourceFingerprint,
      lastSyncedAt: data.lastSyncedAt || new Date(),
      lastError: data.lastError,
    },
    update: {
      flowProjectId: data.flowProjectId,
      flowCharacterName: data.flowCharacterName,
      ...(data.flowCharacterId !== undefined ? { flowCharacterId: data.flowCharacterId } : {}),
      ...(data.flowCharacterUrl !== undefined ? { flowCharacterUrl: data.flowCharacterUrl } : {}),
      ...(data.activeVersion !== undefined ? { activeVersion: data.activeVersion } : {}),
      syncStatus: data.syncStatus || 'synced',
      sourceReferenceUrl: data.sourceReferenceUrl,
      sourceFingerprint: data.sourceFingerprint,
      lastSyncedAt: data.lastSyncedAt || new Date(),
      lastError: data.lastError,
    },
  });
}

export async function deleteFlowCharacterMapping(storyId: string, characterId: string) {
  return prisma.flowCharacterMapping.deleteMany({
    where: { storyId, characterId },
  });
}

// -------------------------------------------------------------------------
// FlowCharacterVersion operations
// -------------------------------------------------------------------------

export async function createFlowCharacterVersion(data: {
  id?: string;
  mappingId: string;
  version?: number;
  provider?: string;
  model?: string | null;
  flowProjectId: string;
  flowCharacterId: string;
  flowCharacterUrl: string;
  prompt?: string | null;
  formattedPrompt?: string | null;
  characterName?: string | null;
  characterInfo?: string | null;
  voiceName?: string | null;
  voiceId?: string | null;
  imageUrl?: string | null;
  storageKey?: string | null;
  parentCharacterId?: string | null;
  metadata?: any;
  status?: string;
}) {
  const versionModel = (prisma as any).flowCharacterVersion;
  let targetVersion = data.version;
  if (!targetVersion && versionModel?.findFirst) {
    try {
      const latest = await versionModel.findFirst({
        where: { mappingId: data.mappingId },
        orderBy: { version: 'desc' },
      });
      targetVersion = (latest?.version ?? 0) + 1;
    } catch {
      targetVersion = 1;
    }
  }
  if (!targetVersion) targetVersion = 1;

  const versionRecord = {
    id: data.id || randomUUID(),
    mappingId: data.mappingId,
    version: targetVersion,
    provider: data.provider || "google_flow",
    model: data.model || null,
    flowProjectId: data.flowProjectId,
    flowCharacterId: data.flowCharacterId,
    flowCharacterUrl: data.flowCharacterUrl,
    prompt: data.prompt || null,
    formattedPrompt: data.formattedPrompt || null,
    characterName: data.characterName || null,
    characterInfo: data.characterInfo || null,
    voiceName: data.voiceName || null,
    voiceId: data.voiceId || null,
    imageUrl: data.imageUrl || null,
    storageKey: data.storageKey || null,
    parentCharacterId: data.parentCharacterId || null,
    metadata: data.metadata || null,
    status: data.status || "completed",
    createdAt: new Date(),
  };

  if (versionModel?.create) {
    try {
      const created = await versionModel.create({ data: versionRecord });
      // Update mapping activeVersion
      await (prisma as any).flowCharacterMapping.update({
        where: { id: data.mappingId },
        data: {
          activeVersion: targetVersion,
          flowCharacterId: data.flowCharacterId,
          flowCharacterUrl: data.flowCharacterUrl,
        },
      }).catch(() => {});
      return created;
    } catch (createErr) {
      console.warn("[Database] FlowCharacterVersion create fallback:", (createErr as Error).message);
    }
  }

  // Fallback update on mapping
  await (prisma as any).flowCharacterMapping.update({
    where: { id: data.mappingId },
    data: {
      activeVersion: targetVersion,
      flowCharacterId: data.flowCharacterId,
      flowCharacterUrl: data.flowCharacterUrl,
    },
  }).catch(() => {});

  return versionRecord;
}

export async function getFlowCharacterVersions(mappingId: string) {
  const versionModel = (prisma as any).flowCharacterVersion;
  if (versionModel?.findMany) {
    try {
      return await versionModel.findMany({
        where: { mappingId },
        orderBy: { version: "desc" },
      });
    } catch (err) {
      console.warn("[Database] getFlowCharacterVersions fallback:", (err as Error).message);
    }
  }
  return [];
}

export async function getFlowCharacterVersion(id: string) {
  const versionModel = (prisma as any).flowCharacterVersion;
  if (versionModel?.findUnique) {
    try {
      return await versionModel.findUnique({
        where: { id },
      });
    } catch (err) {
      console.warn("[Database] getFlowCharacterVersion fallback:", (err as Error).message);
    }
  }
  return null;
}

export async function restoreFlowCharacterVersion(mappingId: string, versionIdOrNumber: string | number) {
  const versionModel = (prisma as any).flowCharacterVersion;
  let targetVersion: any = null;

  if (versionModel) {
    try {
      if (typeof versionIdOrNumber === "number") {
        targetVersion = await versionModel.findFirst({
          where: { mappingId, version: versionIdOrNumber },
        });
      } else {
        targetVersion = await versionModel.findFirst({
          where: { mappingId, id: versionIdOrNumber },
        });
      }
    } catch (err) {
      console.warn("[Database] restoreFlowCharacterVersion lookup fallback:", (err as Error).message);
    }
  }

  if (targetVersion) {
    await (prisma as any).flowCharacterMapping.update({
      where: { id: mappingId },
      data: {
        activeVersion: targetVersion.version,
        flowCharacterId: targetVersion.flowCharacterId,
        flowCharacterUrl: targetVersion.flowCharacterUrl,
      },
    });
    return targetVersion;
  }

  // If versions table is not present, update mapping directly if number passed
  if (typeof versionIdOrNumber === "number") {
    return await (prisma as any).flowCharacterMapping.update({
      where: { id: mappingId },
      data: { activeVersion: versionIdOrNumber },
    });
  }

  throw new Error(`Flow character version not found: ${versionIdOrNumber}`);
}

// -------------------------------------------------------------------------
// GenerationJob operations
// -------------------------------------------------------------------------

export async function createGenerationJob(data: {
  id?: string;
  storyId?: string | null;
  sceneId?: string | null;
  characterId?: string | null;
  provider?: string;
  model?: string | null;
  targetType: string;
  assetType?: string | null;
  prompt: string;
  flowProjectId?: string | null;
  workerJobId?: string | null;
  status?: string;
  progress?: number;
  metadata?: any;
}) {
  return prisma.generationJob.create({
    data: {
      id: data.id || randomUUID(),
      storyId: data.storyId,
      sceneId: data.sceneId,
      characterId: data.characterId,
      provider: data.provider || 'google_flow',
      model: data.model,
      targetType: data.targetType,
      assetType: data.assetType,
      prompt: data.prompt,
      flowProjectId: data.flowProjectId,
      workerJobId: data.workerJobId,
      status: data.status || 'queued',
      progress: data.progress ?? 0,
      metadata: data.metadata,
    },
  });
}

export async function updateGenerationJob(
  id: string,
  data: {
    status?: string;
    progress?: number;
    error?: string | null;
    resultAssetId?: string | null;
    resultUrl?: string | null;
    workerJobId?: string | null;
    metadata?: any;
    completedAt?: Date | null;
    retryCount?: number;
  }
) {
  return prisma.generationJob.update({
    where: { id },
    data,
  });
}

export async function getGenerationJob(id: string) {
  return prisma.generationJob.findUnique({
    where: { id },
  });
}

export async function listGenerationJobs(filters?: {
  storyId?: string;
  sceneId?: string;
  characterId?: string;
  status?: string;
  limit?: number;
}) {
  return prisma.generationJob.findMany({
    where: {
      ...(filters?.storyId ? { storyId: filters.storyId } : {}),
      ...(filters?.sceneId ? { sceneId: filters.sceneId } : {}),
      ...(filters?.characterId ? { characterId: filters.characterId } : {}),
      ...(filters?.status ? { status: filters.status } : {}),
    },
    orderBy: { createdAt: 'desc' },
    take: filters?.limit || 50,
  });
}

export { prisma };
export default prisma;
