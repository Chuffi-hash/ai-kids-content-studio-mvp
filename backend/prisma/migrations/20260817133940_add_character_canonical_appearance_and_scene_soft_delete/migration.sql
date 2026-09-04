-- AlterTable
ALTER TABLE "Character" ADD COLUMN     "canonicalAppearance" JSONB,
ADD COLUMN     "referenceImagePrompt" TEXT,
ADD COLUMN     "referenceImageUrl" TEXT;

-- AlterTable
ALTER TABLE "Scene" ADD COLUMN     "deletedAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "Scene_deletedAt_idx" ON "Scene"("deletedAt");
