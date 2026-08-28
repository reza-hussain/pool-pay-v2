-- CreateTable
CREATE TABLE "PendingSpend" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "poolId" TEXT NOT NULL,
    "recorderId" TEXT NOT NULL,
    "merchantRef" TEXT NOT NULL,
    "amountPaise" INTEGER NOT NULL,
    "feePaise" INTEGER NOT NULL,
    "state" TEXT NOT NULL DEFAULT 'PENDING',
    "resultingSpendId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PendingSpend_poolId_fkey" FOREIGN KEY ("poolId") REFERENCES "Pool" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "PendingSpend_recorderId_fkey" FOREIGN KEY ("recorderId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "PendingSpend_resultingSpendId_fkey" FOREIGN KEY ("resultingSpendId") REFERENCES "Spend" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "SpendApproval" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "pendingSpendId" TEXT NOT NULL,
    "poolId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SpendApproval_pendingSpendId_fkey" FOREIGN KEY ("pendingSpendId") REFERENCES "PendingSpend" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "SpendApproval_poolId_fkey" FOREIGN KEY ("poolId") REFERENCES "Pool" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "SpendApproval_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "PendingSpend_resultingSpendId_key" ON "PendingSpend"("resultingSpendId");

-- CreateIndex
CREATE INDEX "PendingSpend_poolId_idx" ON "PendingSpend"("poolId");

-- CreateIndex
CREATE INDEX "SpendApproval_pendingSpendId_idx" ON "SpendApproval"("pendingSpendId");

-- CreateIndex
CREATE INDEX "SpendApproval_poolId_idx" ON "SpendApproval"("poolId");

-- CreateIndex
CREATE UNIQUE INDEX "SpendApproval_pendingSpendId_userId_key" ON "SpendApproval"("pendingSpendId", "userId");
