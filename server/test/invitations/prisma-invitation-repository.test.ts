import { execSync } from "node:child_process";
import { existsSync, rmSync } from "node:fs";
import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { PrismaInvitationRepository } from "../../src/invitations/prisma-invitation-repository.js";
import { InvitationNotCancellableError } from "../../src/invitations/types.js";

const TEST_DB_PATH = "prisma/invitations-test.db";
const TEST_DB_URL = `file:./invitations-test.db`;

let prisma: PrismaClient;
let organizerId: string;
let poolId: string;

beforeAll(() => {
  if (existsSync(TEST_DB_PATH)) rmSync(TEST_DB_PATH);
  execSync("npx prisma db push --skip-generate", {
    env: { ...process.env, DATABASE_URL: TEST_DB_URL },
    cwd: process.cwd(),
    stdio: "pipe",
  });
  prisma = new PrismaClient({ datasources: { db: { url: TEST_DB_URL } } });
});

beforeEach(async () => {
  await prisma.invitation.deleteMany();
  await prisma.pool.deleteMany();
  await prisma.user.deleteMany();
  const organizer = await prisma.user.create({ data: { phoneNumber: "+919876543210" } });
  organizerId = organizer.id;
  const pool = await prisma.pool.create({
    data: {
      name: "Uneven Dinner",
      type: "CUSTOM_SPLIT",
      perPersonAmountPaise: null,
      organizerId: organizer.id,
      joinCode: "444444",
    },
  });
  poolId = pool.id;
});

afterAll(async () => {
  await prisma.$disconnect();
  if (existsSync(TEST_DB_PATH)) rmSync(TEST_DB_PATH);
});

function futureDate(): Date {
  return new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
}

describe("PrismaInvitationRepository", () => {
  it("creates a PENDING Invitation", async () => {
    const repo = new PrismaInvitationRepository(prisma);
    const invitation = await repo.create({
      poolId,
      inviteeUserId: organizerId,
      assignedAmountPaise: 30000,
      token: "token_1",
      expiresAt: futureDate(),
    });

    expect(invitation).toMatchObject({
      poolId,
      inviteeUserId: organizerId,
      assignedAmountPaise: 30000,
      state: "PENDING",
      token: "token_1",
      paidAt: null,
    });
  });

  it("finds a PENDING Invitation by pool and invitee, or returns null", async () => {
    const repo = new PrismaInvitationRepository(prisma);
    await repo.create({
      poolId,
      inviteeUserId: organizerId,
      assignedAmountPaise: 30000,
      token: "token_1",
      expiresAt: futureDate(),
    });

    await expect(repo.findPendingByPoolAndInvitee(poolId, organizerId)).resolves.toMatchObject({
      assignedAmountPaise: 30000,
    });
    await expect(repo.findPendingByPoolAndInvitee(poolId, "user_no_invite")).resolves.toBeNull();
  });

  it("marks an Invitation paid", async () => {
    const repo = new PrismaInvitationRepository(prisma);
    const invitation = await repo.create({
      poolId,
      inviteeUserId: organizerId,
      assignedAmountPaise: 30000,
      token: "token_1",
      expiresAt: futureDate(),
    });

    const paid = await repo.markPaid(invitation.id);

    expect(paid.state).toBe("PAID");
    expect(paid.paidAt).toBeInstanceOf(Date);
    await expect(repo.findPendingByPoolAndInvitee(poolId, organizerId)).resolves.toBeNull();
  });

  it("marks an Invitation expired", async () => {
    const repo = new PrismaInvitationRepository(prisma);
    const invitation = await repo.create({
      poolId,
      inviteeUserId: organizerId,
      assignedAmountPaise: 30000,
      token: "token_1",
      expiresAt: futureDate(),
    });

    const expired = await repo.markExpired(invitation.id);

    expect(expired.state).toBe("EXPIRED");
    await expect(repo.findPendingByPoolAndInvitee(poolId, organizerId)).resolves.toBeNull();
  });

  it("lists PENDING Invitations for an invitee across every Pool, newest first", async () => {
    const repo = new PrismaInvitationRepository(prisma);
    const otherPool = await prisma.pool.create({
      data: {
        name: "Second Pool",
        type: "CUSTOM_SPLIT",
        perPersonAmountPaise: null,
        organizerId,
        joinCode: "555555",
      },
    });
    const first = await repo.create({
      poolId,
      inviteeUserId: organizerId,
      assignedAmountPaise: 10000,
      token: "token_first",
      expiresAt: futureDate(),
    });
    const second = await repo.create({
      poolId: otherPool.id,
      inviteeUserId: organizerId,
      assignedAmountPaise: 20000,
      token: "token_second",
      expiresAt: futureDate(),
    });
    await repo.markPaid(first.id);

    const pending = await repo.listPendingByInvitee(organizerId);

    expect(pending).toHaveLength(1);
    expect(pending[0].id).toBe(second.id);
  });

  it("lists every Invitation ever sent for a Pool, regardless of state", async () => {
    const repo = new PrismaInvitationRepository(prisma);
    const pending = await repo.create({
      poolId,
      inviteeUserId: organizerId,
      assignedAmountPaise: 10000,
      token: "token_pending",
      expiresAt: futureDate(),
    });
    const paidInvitation = await repo.create({
      poolId,
      inviteeUserId: organizerId,
      assignedAmountPaise: 20000,
      token: "token_paid",
      expiresAt: futureDate(),
    });
    await repo.markPaid(paidInvitation.id);

    const all = await repo.listByPool(poolId);

    expect(all.map((i) => i.id).sort()).toEqual([pending.id, paidInvitation.id].sort());
  });

  it("finds an Invitation by id, or returns null", async () => {
    const repo = new PrismaInvitationRepository(prisma);
    const invitation = await repo.create({
      poolId,
      inviteeUserId: organizerId,
      assignedAmountPaise: 30000,
      token: "token_1",
      expiresAt: futureDate(),
    });

    await expect(repo.findById(invitation.id)).resolves.toMatchObject({ assignedAmountPaise: 30000 });
    await expect(repo.findById("does-not-exist")).resolves.toBeNull();
  });

  it("marks an Invitation cancelled", async () => {
    const repo = new PrismaInvitationRepository(prisma);
    const invitation = await repo.create({
      poolId,
      inviteeUserId: organizerId,
      assignedAmountPaise: 30000,
      token: "token_1",
      expiresAt: futureDate(),
    });

    const cancelled = await repo.markCancelled(invitation.id);

    expect(cancelled.state).toBe("CANCELLED");
    await expect(repo.findPendingByPoolAndInvitee(poolId, organizerId)).resolves.toBeNull();
  });

  it("refuses to cancel an Invitation that has already moved off PENDING (race guard)", async () => {
    const repo = new PrismaInvitationRepository(prisma);
    const invitation = await repo.create({
      poolId,
      inviteeUserId: organizerId,
      assignedAmountPaise: 30000,
      token: "token_1",
      expiresAt: futureDate(),
    });
    await repo.markPaid(invitation.id);

    await expect(repo.markCancelled(invitation.id)).rejects.toThrow(InvitationNotCancellableError);

    const stored = await repo.findById(invitation.id);
    expect(stored?.state).toBe("PAID");
  });
});
