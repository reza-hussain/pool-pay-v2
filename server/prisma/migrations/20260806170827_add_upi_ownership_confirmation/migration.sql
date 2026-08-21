-- CreateTable
CREATE TABLE "UpiOwnershipConfirmation" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "providerRef" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "upiId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "confirmedAt" DATETIME,
    CONSTRAINT "UpiOwnershipConfirmation_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "UpiOwnershipConfirmation_providerRef_key" ON "UpiOwnershipConfirmation"("providerRef");

-- CreateIndex
CREATE INDEX "UpiOwnershipConfirmation_userId_upiId_idx" ON "UpiOwnershipConfirmation"("userId", "upiId");
