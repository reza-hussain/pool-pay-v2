/*
  Warnings:

  - Added the required column `joinCode` to the `Pool` table without a default value. This is not possible if the table is not empty.

*/
-- CreateTable
CREATE TABLE "Membership" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "poolId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "joinedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Membership_poolId_fkey" FOREIGN KEY ("poolId") REFERENCES "Pool" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Membership_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Pool" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "perPersonAmountPaise" INTEGER,
    "state" TEXT NOT NULL DEFAULT 'ACTIVE',
    "organizerId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "joinCode" TEXT NOT NULL,
    CONSTRAINT "Pool_organizerId_fkey" FOREIGN KEY ("organizerId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_Pool" ("createdAt", "id", "name", "organizerId", "perPersonAmountPaise", "state", "type") SELECT "createdAt", "id", "name", "organizerId", "perPersonAmountPaise", "state", "type" FROM "Pool";
DROP TABLE "Pool";
ALTER TABLE "new_Pool" RENAME TO "Pool";
CREATE UNIQUE INDEX "Pool_joinCode_key" ON "Pool"("joinCode");
CREATE INDEX "Pool_organizerId_idx" ON "Pool"("organizerId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "Membership_poolId_userId_key" ON "Membership"("poolId", "userId");
