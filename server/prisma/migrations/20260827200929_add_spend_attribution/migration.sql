-- CreateTable
CREATE TABLE "SpendAttribution" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "spendId" TEXT NOT NULL,
    "poolId" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "amountPaise" INTEGER NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SpendAttribution_spendId_fkey" FOREIGN KEY ("spendId") REFERENCES "Spend" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "SpendAttribution_poolId_fkey" FOREIGN KEY ("poolId") REFERENCES "Pool" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "SpendAttribution_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "SpendAttribution_spendId_idx" ON "SpendAttribution"("spendId");

-- CreateIndex
CREATE INDEX "SpendAttribution_poolId_memberId_idx" ON "SpendAttribution"("poolId", "memberId");
