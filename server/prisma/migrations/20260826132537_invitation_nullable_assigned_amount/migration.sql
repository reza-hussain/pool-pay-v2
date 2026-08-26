-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Invitation" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "poolId" TEXT NOT NULL,
    "inviteeUserId" TEXT NOT NULL,
    "assignedAmountPaise" INTEGER,
    "state" TEXT NOT NULL DEFAULT 'PENDING',
    "token" TEXT NOT NULL,
    "expiresAt" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "paidAt" DATETIME,
    CONSTRAINT "Invitation_poolId_fkey" FOREIGN KEY ("poolId") REFERENCES "Pool" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Invitation_inviteeUserId_fkey" FOREIGN KEY ("inviteeUserId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_Invitation" ("assignedAmountPaise", "createdAt", "expiresAt", "id", "inviteeUserId", "paidAt", "poolId", "state", "token") SELECT "assignedAmountPaise", "createdAt", "expiresAt", "id", "inviteeUserId", "paidAt", "poolId", "state", "token" FROM "Invitation";
DROP TABLE "Invitation";
ALTER TABLE "new_Invitation" RENAME TO "Invitation";
CREATE UNIQUE INDEX "Invitation_token_key" ON "Invitation"("token");
CREATE INDEX "Invitation_poolId_idx" ON "Invitation"("poolId");
CREATE INDEX "Invitation_poolId_inviteeUserId_idx" ON "Invitation"("poolId", "inviteeUserId");
CREATE INDEX "Invitation_inviteeUserId_state_idx" ON "Invitation"("inviteeUserId", "state");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
