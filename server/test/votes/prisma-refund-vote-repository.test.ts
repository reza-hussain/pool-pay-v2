import { execSync } from "node:child_process";
import { existsSync, rmSync } from "node:fs";
import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { PrismaRefundVoteRepository } from "../../src/votes/prisma-refund-vote-repository.js";

const TEST_DB_PATH = "prisma/refund-votes-test.db";
const TEST_DB_URL = `file:./refund-votes-test.db`;

let prisma: PrismaClient;
let organizerId: string;
let memberId: string;
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
  await prisma.refundVote.deleteMany();
  await prisma.pool.deleteMany();
  await prisma.user.deleteMany();
  const organizer = await prisma.user.create({ data: { phoneNumber: "+919876543210" } });
  const member = await prisma.user.create({ data: { phoneNumber: "+919876500000" } });
  organizerId = organizer.id;
  memberId = member.id;
  const pool = await prisma.pool.create({
    data: { name: "Goa Trip", type: "OPEN", organizerId, joinCode: "555555" },
  });
  poolId = pool.id;
});

afterAll(async () => {
  await prisma.$disconnect();
  if (existsSync(TEST_DB_PATH)) rmSync(TEST_DB_PATH);
});

describe("PrismaRefundVoteRepository", () => {
  it("creates a vote", async () => {
    const repo = new PrismaRefundVoteRepository(prisma);
    const vote = await repo.create(poolId, memberId);
    expect(vote).toMatchObject({ poolId, userId: memberId });
  });

  it("is idempotent for a repeat vote from the same Member", async () => {
    const repo = new PrismaRefundVoteRepository(prisma);
    const first = await repo.create(poolId, memberId);
    const second = await repo.create(poolId, memberId);

    expect(second.id).toBe(first.id);
    await expect(repo.listByPool(poolId)).resolves.toHaveLength(1);
  });

  it("finds a Member's vote", async () => {
    const repo = new PrismaRefundVoteRepository(prisma);
    await repo.create(poolId, memberId);

    await expect(repo.find(poolId, memberId)).resolves.toMatchObject({ poolId, userId: memberId });
  });

  it("returns null when the Member hasn't voted", async () => {
    const repo = new PrismaRefundVoteRepository(prisma);
    await expect(repo.find(poolId, memberId)).resolves.toBeNull();
  });

  it("lists every vote for a pool", async () => {
    const repo = new PrismaRefundVoteRepository(prisma);
    await repo.create(poolId, memberId);
    await repo.create(poolId, organizerId);

    const votes = await repo.listByPool(poolId);
    expect(votes).toHaveLength(2);
  });
});
