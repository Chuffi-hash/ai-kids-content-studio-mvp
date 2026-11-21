-- AlterTable
ALTER TABLE "Image" ADD COLUMN "googleFlowProjectId" TEXT,
ADD COLUMN "googleFlowEditId" TEXT,
ADD COLUMN "googleFlowEditUrl" TEXT,
ADD COLUMN "googleFlowPrompt" TEXT,
ADD COLUMN "googleFlowParentAssetId" TEXT,
ADD COLUMN "googleFlowVersion" INTEGER DEFAULT 1;

-- CreateIndex
CREATE INDEX "Image_googleFlowEditId_idx" ON "Image"("googleFlowEditId");

-- CreateIndex
CREATE INDEX "Image_googleFlowProjectId_idx" ON "Image"("googleFlowProjectId");
