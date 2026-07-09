-- CreateTable
CREATE TABLE "Deposit" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "poolId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "amountPaise" INTEGER NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Deposit_poolId_fkey" FOREIGN KEY ("poolId") REFERENCES "Pool" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Deposit_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "Deposit_poolId_idx" ON "Deposit"("poolId");

-- CreateIndex
CREATE INDEX "Deposit_poolId_userId_idx" ON "Deposit"("poolId", "userId");
