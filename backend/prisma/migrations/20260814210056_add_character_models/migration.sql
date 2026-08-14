-- CreateTable
CREATE TABLE "Character" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "species" TEXT NOT NULL,
    "personality" TEXT NOT NULL,
    "visualDescription" TEXT NOT NULL,
    "distinctiveFeatures" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Character_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StoryCharacter" (
    "id" TEXT NOT NULL,
    "storyId" TEXT NOT NULL,
    "characterId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StoryCharacter_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Character_name_idx" ON "Character"("name");

-- CreateIndex
CREATE INDEX "StoryCharacter_storyId_idx" ON "StoryCharacter"("storyId");

-- CreateIndex
CREATE INDEX "StoryCharacter_characterId_idx" ON "StoryCharacter"("characterId");

-- CreateIndex
CREATE UNIQUE INDEX "StoryCharacter_storyId_characterId_key" ON "StoryCharacter"("storyId", "characterId");

-- AddForeignKey
ALTER TABLE "StoryCharacter" ADD CONSTRAINT "StoryCharacter_storyId_fkey" FOREIGN KEY ("storyId") REFERENCES "Story"("storyId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StoryCharacter" ADD CONSTRAINT "StoryCharacter_characterId_fkey" FOREIGN KEY ("characterId") REFERENCES "Character"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
