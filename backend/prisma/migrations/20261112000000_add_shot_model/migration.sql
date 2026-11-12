-- CreateTable
CREATE TABLE IF NOT EXISTS "Shot" (
    "id" TEXT NOT NULL,
    "shotId" TEXT NOT NULL,
    "storyId" TEXT NOT NULL,
    "sceneId" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,
    "title" TEXT,
    "description" TEXT,
    "durationMs" INTEGER NOT NULL DEFAULT 5000,
    "shotType" TEXT,
    "cameraAngle" TEXT,
    "cameraMovement" TEXT,
    "lighting" TEXT,
    "shotDirection" JSONB,
    "characterInstructions" JSONB,
    "backgroundPrompt" TEXT,
    "videoPrompt" TEXT,
    "promptHistory" JSONB,
    "backgroundUrl" TEXT,
    "videoUrl" TEXT,
    "assetStatus" TEXT NOT NULL DEFAULT 'pending',
    "approvalStatus" TEXT NOT NULL DEFAULT 'pending',
    "productionStatus" TEXT NOT NULL DEFAULT 'draft',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Shot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "Shot_shotId_key" ON "Shot"("shotId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Shot_shotId_idx" ON "Shot"("shotId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Shot_sceneId_idx" ON "Shot"("sceneId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Shot_storyId_idx" ON "Shot"("storyId");

-- AddForeignKey
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'Shot_storyId_fkey'
    ) THEN
        ALTER TABLE "Shot" ADD CONSTRAINT "Shot_storyId_fkey" FOREIGN KEY ("storyId") REFERENCES "Story"("storyId") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'Shot_sceneId_fkey'
    ) THEN
        ALTER TABLE "Shot" ADD CONSTRAINT "Shot_sceneId_fkey" FOREIGN KEY ("sceneId") REFERENCES "Scene"("sceneId") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;
