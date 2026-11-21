-- AlterTable
ALTER TABLE "Scene" ADD COLUMN "activeBackgroundVersion" INTEGER DEFAULT 1;

-- AlterTable
ALTER TABLE "Image" ADD COLUMN "googleFlowImageId" TEXT,
ADD COLUMN "googleFlowImageRef" TEXT;

-- CreateIndex
CREATE INDEX "Image_googleFlowImageId_idx" ON "Image"("googleFlowImageId");

-- CreateTable
CREATE TABLE "BackgroundImageVersion" (
    "id" TEXT NOT NULL,
    "sceneId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "provider" TEXT NOT NULL,
    "model" TEXT,
    "prompt" TEXT,
    "parentVersionId" TEXT,
    "localImageId" TEXT,
    "storageKey" TEXT,
    "imageUrl" TEXT,
    "width" INTEGER,
    "height" INTEGER,
    "aspectRatio" TEXT,
    "providerMetadata" JSONB,
    "status" TEXT NOT NULL DEFAULT 'completed',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BackgroundImageVersion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "BackgroundImageVersion_sceneId_idx" ON "BackgroundImageVersion"("sceneId");

-- CreateIndex
CREATE UNIQUE INDEX "BackgroundImageVersion_sceneId_version_key" ON "BackgroundImageVersion"("sceneId", "version");

-- AddForeignKey
ALTER TABLE "BackgroundImageVersion" ADD CONSTRAINT "BackgroundImageVersion_sceneId_fkey" FOREIGN KEY ("sceneId") REFERENCES "Scene"("sceneId") ON DELETE CASCADE ON UPDATE CASCADE;
