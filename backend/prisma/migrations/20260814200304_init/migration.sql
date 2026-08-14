-- CreateTable
CREATE TABLE "Story" (
    "id" TEXT NOT NULL,
    "storyId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "logline" TEXT NOT NULL,
    "lesson" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Story_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Scene" (
    "id" TEXT NOT NULL,
    "sceneId" TEXT NOT NULL,
    "storyId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "narration" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Scene_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Image" (
    "id" TEXT NOT NULL,
    "sceneId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "prompt" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "imageUrl" TEXT NOT NULL,
    "width" INTEGER NOT NULL,
    "height" INTEGER NOT NULL,
    "status" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Image_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Story_storyId_key" ON "Story"("storyId");

-- CreateIndex
CREATE INDEX "Story_storyId_idx" ON "Story"("storyId");

-- CreateIndex
CREATE UNIQUE INDEX "Scene_sceneId_key" ON "Scene"("sceneId");

-- CreateIndex
CREATE INDEX "Scene_sceneId_idx" ON "Scene"("sceneId");

-- CreateIndex
CREATE INDEX "Scene_storyId_idx" ON "Scene"("storyId");

-- CreateIndex
CREATE INDEX "Image_sceneId_idx" ON "Image"("sceneId");

-- CreateIndex
CREATE INDEX "Image_status_idx" ON "Image"("status");

-- AddForeignKey
ALTER TABLE "Scene" ADD CONSTRAINT "Scene_storyId_fkey" FOREIGN KEY ("storyId") REFERENCES "Story"("storyId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Image" ADD CONSTRAINT "Image_sceneId_fkey" FOREIGN KEY ("sceneId") REFERENCES "Scene"("sceneId") ON DELETE RESTRICT ON UPDATE CASCADE;
