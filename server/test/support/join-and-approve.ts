import type { Express } from "express";
import request from "supertest";

// Equal Split joining is approval-gated (ticket #86): POST .../join now
// creates a PENDING JoinRequest rather than a Membership. Test files that
// only care about "this user is a Member" as setup for something else (a
// deposit, a vote, ...) use this instead of asserting on the join step
// itself — it drives the request through to Approved the same way a real
// Organizer would from All Members' Pending requests section. Requires the
// app's createApp() call to have been given a joinRequestService, so the
// join-requests router is mounted.
export async function joinAndApprove(
  app: Express,
  poolId: string,
  organizerId: string,
  memberId: string,
  bearerFor: (userId: string) => string,
): Promise<void> {
  await request(app).post(`/pools/${poolId}/join`).set("Authorization", bearerFor(memberId));
  const pending = await request(app)
    .get(`/pools/${poolId}/join-requests`)
    .set("Authorization", bearerFor(organizerId));
  const match = pending.body.joinRequests.find(
    (r: { joinRequest: { requesterUserId: string } }) => r.joinRequest.requesterUserId === memberId,
  );
  await request(app)
    .post(`/pools/${poolId}/join-requests/${match.joinRequest.id}/approve`)
    .set("Authorization", bearerFor(organizerId));
}
