import { execSync } from "node:child_process";
import { existsSync, rmSync } from "node:fs";
import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { PrismaInvitationRepository } from "../../src/invitations/prisma-invitation-repository.js";

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
});
