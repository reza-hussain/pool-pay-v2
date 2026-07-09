import { execSync } from "node:child_process";
import { existsSync, rmSync } from "node:fs";
import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { PrismaSpendRepository } from "../../src/spends/prisma-spend-repository.js";

const TEST_DB_PATH = "prisma/spends-test.db";
const TEST_DB_URL = `file:./spends-test.db`;

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
  await prisma.spend.deleteMany();
  await prisma.pool.deleteMany();
  await prisma.user.deleteMany();
  const organizer = await prisma.user.create({ data: { phoneNumber: "+919876543210" } });
  organizerId = organizer.id;
  const pool = await prisma.pool.create({
    data: {
      name: "Goa Trip",
      type: "OPEN",
      organizerId,
      joinCode: "555555",
    },
  });
  poolId = pool.id;
});

afterAll(async () => {
  await prisma.$disconnect();
  if (existsSync(TEST_DB_PATH)) rmSync(TEST_DB_PATH);
});

describe("PrismaSpendRepository", () => {
  it("creates a spend", async () => {
    const repo = new PrismaSpendRepository(prisma);
    const spend = await repo.create(poolId, organizerId, "merchant@upi", 50000, 500);
    expect(spend).toMatchObject({
      poolId,
      userId: organizerId,
      merchantRef: "merchant@upi",
      amountPaise: 50000,
      feePaise: 500,
    });
  });

  it("sums amount + fee by pool", async () => {
    const repo = new PrismaSpendRepository(prisma);
    await repo.create(poolId, organizerId, "merchant-1@upi", 50000, 500);
    await repo.create(poolId, organizerId, "merchant-2@upi", 20000, 200);

    await expect(repo.sumByPool(poolId)).resolves.toBe(70700);
  });

  it("returns 0 for a pool with no spends", async () => {
    const repo = new PrismaSpendRepository(prisma);
    await expect(repo.sumByPool(poolId)).resolves.toBe(0);
  });

  it("lists every spend for a pool", async () => {
    const repo = new PrismaSpendRepository(prisma);
    await repo.create(poolId, organizerId, "merchant-1@upi", 50000, 500);
    await repo.create(poolId, organizerId, "merchant-2@upi", 20000, 200);

    const spends = await repo.listByPool(poolId);
    expect(spends).toHaveLength(2);
  });
});
