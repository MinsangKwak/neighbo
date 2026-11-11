-- AlterTable
ALTER TABLE "User" ADD COLUMN "neighborhood" TEXT;

-- AlterTable
ALTER TABLE "Product" ADD COLUMN "neighborhood" TEXT;

-- CreateIndex
CREATE INDEX "Product_neighborhood_deletedAt_createdAt_id_idx" ON "Product"("neighborhood", "deletedAt", "createdAt" DESC, "id" DESC);
