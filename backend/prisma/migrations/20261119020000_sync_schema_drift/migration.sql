-- AlterTable Story: add targetDuration and all schema-aligned fields
ALTER TABLE "Story" ADD COLUMN IF NOT EXISTS "targetDuration" INTEGER;
ALTER TABLE "Story" ADD COLUMN IF NOT EXISTS "visualBible" JSONB;
ALTER TABLE "Story" ADD COLUMN IF NOT EXISTS "flowProjectId" TEXT;
ALTER TABLE "Story" ADD COLUMN IF NOT EXISTS "originalScript" TEXT;
ALTER TABLE "Story" ADD COLUMN IF NOT EXISTS "productionStage" TEXT DEFAULT 'script';
ALTER TABLE "Story" ADD COLUMN IF NOT EXISTS "topic" TEXT;
ALTER TABLE "Story" ADD COLUMN IF NOT EXISTS "ageGroup" TEXT;
ALTER TABLE "Story" ADD COLUMN IF NOT EXISTS "audience" TEXT;
ALTER TABLE "Story" ADD COLUMN IF NOT EXISTS "genre" TEXT;
ALTER TABLE "Story" ADD COLUMN IF NOT EXISTS "visualStyle" TEXT;

-- AlterTable Scene: add all missing scene columns and defaults
ALTER TABLE "Scene" ADD COLUMN IF NOT EXISTS "order" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Scene" ADD COLUMN IF NOT EXISTS "startMs" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Scene" ADD COLUMN IF NOT EXISTS "endMs" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Scene" ADD COLUMN IF NOT EXISTS "visualPrompt" TEXT;
ALTER TABLE "Scene" ADD COLUMN IF NOT EXISTS "cameraDirection" TEXT;
ALTER TABLE "Scene" ADD COLUMN IF NOT EXISTS "characterIds" TEXT;
ALTER TABLE "Scene" ADD COLUMN IF NOT EXISTS "imageUrl" TEXT;
ALTER TABLE "Scene" ADD COLUMN IF NOT EXISTS "videoUrl" TEXT;
ALTER TABLE "Scene" ADD COLUMN IF NOT EXISTS "audioUrl" TEXT;
ALTER TABLE "Scene" ADD COLUMN IF NOT EXISTS "generationStatus" TEXT NOT NULL DEFAULT 'draft';
ALTER TABLE "Scene" ADD COLUMN IF NOT EXISTS "estimatedDurationMs" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Scene" ADD COLUMN IF NOT EXISTS "actualAudioDurationMs" INTEGER;
ALTER TABLE "Scene" ADD COLUMN IF NOT EXISTS "generationError" TEXT;
ALTER TABLE "Scene" ADD COLUMN IF NOT EXISTS "animationData" JSONB;
ALTER TABLE "Scene" ADD COLUMN IF NOT EXISTS "deletedAt" TIMESTAMP(3);

CREATE INDEX IF NOT EXISTS "Scene_deletedAt_idx" ON "Scene"("deletedAt");

-- AlterTable Character: add isLocked and appearance fields
ALTER TABLE "Character" ADD COLUMN IF NOT EXISTS "isLocked" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Character" ADD COLUMN IF NOT EXISTS "canonicalAppearance" JSONB;
ALTER TABLE "Character" ADD COLUMN IF NOT EXISTS "referenceImageUrl" TEXT;
ALTER TABLE "Character" ADD COLUMN IF NOT EXISTS "referenceImagePrompt" TEXT;

-- CreateTable SceneVersion
CREATE TABLE IF NOT EXISTS "SceneVersion" (
    "id" TEXT NOT NULL,
    "sceneId" TEXT NOT NULL,
    "versionNumber" INTEGER NOT NULL DEFAULT 1,
    "prompt" TEXT,
    "narration" TEXT,
    "cameraDirection" TEXT,
    "imageUrl" TEXT,
    "videoUrl" TEXT,
    "audioUrl" TEXT,
    "durationMs" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SceneVersion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex SceneVersion
CREATE INDEX IF NOT EXISTS "SceneVersion_sceneId_idx" ON "SceneVersion"("sceneId");

-- AddForeignKey SceneVersion -> Scene
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'SceneVersion_sceneId_fkey'
    ) THEN
        ALTER TABLE "SceneVersion" ADD CONSTRAINT "SceneVersion_sceneId_fkey" FOREIGN KEY ("sceneId") REFERENCES "Scene"("sceneId") ON DELETE RESTRICT ON UPDATE CASCADE;
    END IF;
END $$;

-- AlterTable Shot: ensure transitions and user edited fields exist
ALTER TABLE "Shot" ADD COLUMN IF NOT EXISTS "transitionType" TEXT DEFAULT 'cut';
ALTER TABLE "Shot" ADD COLUMN IF NOT EXISTS "transitionDurationMs" INTEGER DEFAULT 0;
ALTER TABLE "Shot" ADD COLUMN IF NOT EXISTS "userEditedFields" JSONB;

-- Align Shot foreign keys with schema.prisma RESTRICT rule
DO $$
BEGIN
    ALTER TABLE "Shot" DROP CONSTRAINT IF EXISTS "Shot_sceneId_fkey";
    ALTER TABLE "Shot" DROP CONSTRAINT IF EXISTS "Shot_storyId_fkey";
    ALTER TABLE "Shot" ADD CONSTRAINT "Shot_storyId_fkey" FOREIGN KEY ("storyId") REFERENCES "Story"("storyId") ON DELETE RESTRICT ON UPDATE CASCADE;
    ALTER TABLE "Shot" ADD CONSTRAINT "Shot_sceneId_fkey" FOREIGN KEY ("sceneId") REFERENCES "Scene"("sceneId") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION
    WHEN OTHERS THEN NULL;
END $$;
