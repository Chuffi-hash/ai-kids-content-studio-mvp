-- CreateTable
CREATE TABLE IF NOT EXISTS "FlowCharacterMapping" (
    "id" TEXT NOT NULL,
    "storyId" TEXT NOT NULL,
    "characterId" TEXT NOT NULL,
    "flowProjectId" TEXT NOT NULL,
    "flowCharacterName" TEXT NOT NULL,
    "syncStatus" TEXT NOT NULL DEFAULT 'pending',
    "sourceReferenceUrl" TEXT,
    "sourceFingerprint" TEXT,
    "lastSyncedAt" TIMESTAMP(3),
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FlowCharacterMapping_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "GenerationJob" (
    "id" TEXT NOT NULL,
    "storyId" TEXT,
    "sceneId" TEXT,
    "characterId" TEXT,
    "provider" TEXT NOT NULL DEFAULT 'google_flow',
    "model" TEXT,
    "targetType" TEXT NOT NULL DEFAULT 'scene_background',
    "assetType" TEXT,
    "prompt" TEXT NOT NULL,
    "flowProjectId" TEXT,
    "workerJobId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'queued',
    "progress" INTEGER NOT NULL DEFAULT 0,
    "error" TEXT,
    "resultAssetId" TEXT,
    "resultUrl" TEXT,
    "metadata" JSONB,
    "retryCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "GenerationJob_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "FlowCharacterMapping_flowProjectId_idx" ON "FlowCharacterMapping"("flowProjectId");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "FlowCharacterMapping_storyId_characterId_key" ON "FlowCharacterMapping"("storyId", "characterId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "GenerationJob_storyId_idx" ON "GenerationJob"("storyId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "GenerationJob_sceneId_idx" ON "GenerationJob"("sceneId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "GenerationJob_characterId_idx" ON "GenerationJob"("characterId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "GenerationJob_workerJobId_idx" ON "GenerationJob"("workerJobId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "GenerationJob_status_idx" ON "GenerationJob"("status");

-- AddForeignKey
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'FlowCharacterMapping_storyId_fkey'
    ) THEN
        ALTER TABLE "FlowCharacterMapping" ADD CONSTRAINT "FlowCharacterMapping_storyId_fkey" FOREIGN KEY ("storyId") REFERENCES "Story"("storyId") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'FlowCharacterMapping_characterId_fkey'
    ) THEN
        ALTER TABLE "FlowCharacterMapping" ADD CONSTRAINT "FlowCharacterMapping_characterId_fkey" FOREIGN KEY ("characterId") REFERENCES "Character"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;
