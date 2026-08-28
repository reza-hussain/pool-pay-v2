import { execSync } from "node:child_process";
import { existsSync, rmSync } from "node:fs";
import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { PrismaPendingSpendRepository } from "../../src/spend-approvals/prisma-pending-spend-repository.js";

const TEST_DB_PATH = "prisma/pending-spends-test.db";
const TEST_DB_URL = `file:./pending-spends-test.db`;

let prisma: PrismaClient;
let organizerId: string;
let poolId: string;
let otherPoolId: string;

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
  await prisma.spend.deleteMany();
  await prisma.pool.deleteMany();
  await prisma.user.deleteMany();
  const organizer = await prisma.user.create({ data: { phoneNumber: "+919876543210" } });
  organizerId = organizer.id;
  const pool = await prisma.pool.create({
    data: { name: "Goa Trip", type: "OPEN", organizerId, joinCode: "555555" },
  });
  poolId = pool.id;
  const otherPool = await prisma.pool.create({
    data: { name: "Other Trip", type: "OPEN", organizerId, joinCode: "666666" },
  });
  otherPoolId = otherPool.id;
});

afterAll(async () => {
  await prisma.$disconnect();
  if (existsSync(TEST_DB_PATH)) rmSync(TEST_DB_PATH);
});

describe("PrismaPendingSpendRepository", () => {
  it("creates a PendingSpend in state PENDING", async () => {
    const repo = new PrismaPendingSpendRepository(prisma);

    const pendingSpend = await repo.create(poolId, organizerId, "merchant@upi", 50000, 500);

    expect(pendingSpend).toMatchObject({
      poolId,
      recorderId: organizerId,
      merchantRef: "merchant@upi",
      amountPaise: 50000,
      feePaise: 500,
      state: "PENDING",
      resultingSpendId: null,
    });
  });

  it("finds a PendingSpend by id", async () => {
    const repo = new PrismaPendingSpendRepository(prisma);
    const created = await repo.create(poolId, organizerId, "merchant@upi", 50000, 500);

    await expect(repo.findById(created.id)).resolves.toMatchObject({ id: created.id });
  });

  it("returns null for an unknown id", async () => {
    const repo = new PrismaPendingSpendRepository(prisma);

    await expect(repo.findById("does-not-exist")).resolves.toBeNull();
  });

  it("lists only PENDING PendingSpends for a Pool, scoped to that Pool", async () => {
    const repo = new PrismaPendingSpendRepository(prisma);
    const stillPending = await repo.create(poolId, organizerId, "merchant-1@upi", 50000, 500);
    const toExecute = await repo.create(poolId, organizerId, "merchant-2@upi", 50000, 500);
    await repo.create(otherPoolId, organizerId, "merchant-3@upi", 50000, 500);
    const spend = await prisma.spend.create({
      data: { poolId, userId: organizerId, merchantRef: "merchant-2@upi", amountPaise: 50000, feePaise: 500 },
    });
    await repo.markExecuted(toExecute.id, spend.id);

    const pending = await repo.listPendingByPool(poolId);
    expect(pending).toHaveLength(1);
    expect(pending[0].id).toBe(stillPending.id);
  });

  it("marks a PendingSpend EXECUTED with its resulting Spend id", async () => {
    const repo = new PrismaPendingSpendRepository(prisma);
    const pendingSpend = await repo.create(poolId, organizerId, "merchant@upi", 50000, 500);
    const spend = await prisma.spend.create({
      data: { poolId, userId: organizerId, merchantRef: "merchant@upi", amountPaise: 50000, feePaise: 500 },
    });

    const updated = await repo.markExecuted(pendingSpend.id, spend.id);

    expect(updated.state).toBe("EXECUTED");
    expect(updated.resultingSpendId).toBe(spend.id);
  });
});
