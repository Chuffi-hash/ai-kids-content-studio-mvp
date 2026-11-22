-- AlterTable
ALTER TABLE "FlowCharacterMapping" ADD COLUMN IF NOT EXISTS "flowCharacterId" TEXT,
ADD COLUMN IF NOT EXISTS "flowCharacterUrl" TEXT,
ADD COLUMN IF NOT EXISTS "activeVersion" INTEGER NOT NULL DEFAULT 1;

-- CreateTable
CREATE TABLE IF NOT EXISTS "FlowCharacterVersion" (
    "id" TEXT NOT NULL,
    "mappingId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'google_flow',
    "model" TEXT,
    "flowProjectId" TEXT NOT NULL,
    "flowCharacterId" TEXT NOT NULL,
    "flowCharacterUrl" TEXT NOT NULL,
    "prompt" TEXT,
    "formattedPrompt" TEXT,
    "characterName" TEXT,
    "characterInfo" TEXT,
    "voiceName" TEXT,
    "voiceId" TEXT,
    "imageUrl" TEXT,
    "storageKey" TEXT,
    "parentCharacterId" TEXT,
    "metadata" JSONB,
    "status" TEXT NOT NULL DEFAULT 'completed',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FlowCharacterVersion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "FlowCharacterVersion_mappingId_idx" ON "FlowCharacterVersion"("mappingId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "FlowCharacterVersion_flowCharacterId_idx" ON "FlowCharacterVersion"("flowCharacterId");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "FlowCharacterVersion_mappingId_version_key" ON "FlowCharacterVersion"("mappingId", "version");

-- AddForeignKey
DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'FlowCharacterVersion_mappingId_fkey'
    ) THEN
        ALTER TABLE "FlowCharacterVersion" ADD CONSTRAINT "FlowCharacterVersion_mappingId_fkey" FOREIGN KEY ("mappingId") REFERENCES "FlowCharacterMapping"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;
