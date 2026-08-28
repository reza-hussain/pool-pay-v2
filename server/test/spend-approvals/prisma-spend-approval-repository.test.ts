import { execSync } from "node:child_process";
import { existsSync, rmSync } from "node:fs";
import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { PrismaSpendApprovalRepository } from "../../src/spend-approvals/prisma-spend-approval-repository.js";

const TEST_DB_PATH = "prisma/spend-approvals-test.db";
const TEST_DB_URL = `file:./spend-approvals-test.db`;

let prisma: PrismaClient;
let organizerId: string;
let memberId: string;
let poolId: string;
let pendingSpendId: string;

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
  await prisma.spendApproval.deleteMany();
  await prisma.pendingSpend.deleteMany();
  await prisma.pool.deleteMany();
  await prisma.user.deleteMany();
  const organizer = await prisma.user.create({ data: { phoneNumber: "+919876543210" } });
  organizerId = organizer.id;
  const member = await prisma.user.create({ data: { phoneNumber: "+919876500000" } });
  memberId = member.id;
  const pool = await prisma.pool.create({
    data: { name: "Goa Trip", type: "OPEN", organizerId, joinCode: "555555" },
  });
  poolId = pool.id;
  const pendingSpend = await prisma.pendingSpend.create({
    data: { poolId, recorderId: organizerId, merchantRef: "merchant@upi", amountPaise: 50000, feePaise: 500 },
  });
  pendingSpendId = pendingSpend.id;
});

afterAll(async () => {
  await prisma.$disconnect();
  if (existsSync(TEST_DB_PATH)) rmSync(TEST_DB_PATH);
});

describe("PrismaSpendApprovalRepository", () => {
  it("creates an approval", async () => {
    const repo = new PrismaSpendApprovalRepository(prisma);

    const approval = await repo.create(pendingSpendId, poolId, memberId);

    expect(approval).toMatchObject({ pendingSpendId, poolId, userId: memberId });
  });

  it("is idempotent for a repeat approval from the same Member", async () => {
    const repo = new PrismaSpendApprovalRepository(prisma);
    const first = await repo.create(pendingSpendId, poolId, memberId);
    const second = await repo.create(pendingSpendId, poolId, memberId);

    expect(second.id).toBe(first.id);
    await expect(repo.listByPendingSpend(pendingSpendId)).resolves.toHaveLength(1);
  });

  it("finds a Member's approval", async () => {
    const repo = new PrismaSpendApprovalRepository(prisma);
    await repo.create(pendingSpendId, poolId, memberId);

    await expect(repo.find(pendingSpendId, memberId)).resolves.toMatchObject({
      pendingSpendId,
      userId: memberId,
    });
  });

  it("returns null when the Member hasn't approved", async () => {
    const repo = new PrismaSpendApprovalRepository(prisma);
    await expect(repo.find(pendingSpendId, memberId)).resolves.toBeNull();
  });

  it("lists every approval for a PendingSpend", async () => {
    const repo = new PrismaSpendApprovalRepository(prisma);
    await repo.create(pendingSpendId, poolId, memberId);
    await repo.create(pendingSpendId, poolId, organizerId);

    const approvals = await repo.listByPendingSpend(pendingSpendId);
    expect(approvals).toHaveLength(2);
  });
});
