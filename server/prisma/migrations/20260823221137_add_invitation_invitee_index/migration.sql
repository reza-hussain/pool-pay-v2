-- CreateIndex
CREATE INDEX "Invitation_inviteeUserId_state_idx" ON "Invitation"("inviteeUserId", "state");
