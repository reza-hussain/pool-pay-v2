import { execSync } from "node:child_process";
import { existsSync, rmSync } from "node:fs";
import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { PrismaDepositRepository } from "../../src/deposits/prisma-deposit-repository.js";

const TEST_DB_PATH = "prisma/deposits-test.db";
const TEST_DB_URL = `file:./deposits-test.db`;

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
  await prisma.deposit.deleteMany();
  await prisma.membership.deleteMany();
  await prisma.pool.deleteMany();
  await prisma.user.deleteMany();
  const organizer = await prisma.user.create({ data: { phoneNumber: "+919876543210" } });
  const member = await prisma.user.create({ data: { phoneNumber: "+919876500000" } });
  organizerId = organizer.id;
  memberId = member.id;
  const pool = await prisma.pool.create({
    data: {
      name: "Goa Trip",
      type: "EQUAL_SPLIT",
      perPersonAmountPaise: 100000,
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

describe("PrismaDepositRepository", () => {
  it("creates a deposit", async () => {
    const repo = new PrismaDepositRepository(prisma);
    const deposit = await repo.create(poolId, memberId, 40000);
    expect(deposit).toMatchObject({ poolId, userId: memberId, amountPaise: 40000 });
  });

  it("sums deposits by pool", async () => {
    const repo = new PrismaDepositRepository(prisma);
    await repo.create(poolId, memberId, 40000);
    await repo.create(poolId, organizerId, 60000);

    await expect(repo.sumByPool(poolId)).resolves.toBe(100000);
  });

  it("returns 0 for a pool with no deposits", async () => {
    const repo = new PrismaDepositRepository(prisma);
    await expect(repo.sumByPool(poolId)).resolves.toBe(0);
  });

  it("sums deposits by pool and user separately", async () => {
    const repo = new PrismaDepositRepository(prisma);
    await repo.create(poolId, memberId, 40000);
    await repo.create(poolId, memberId, 10000);
    await repo.create(poolId, organizerId, 60000);

    await expect(repo.sumByPoolAndUser(poolId, memberId)).resolves.toBe(50000);
    await expect(repo.sumByPoolAndUser(poolId, organizerId)).resolves.toBe(60000);
  });

  it("lists every deposit for a pool", async () => {
    const repo = new PrismaDepositRepository(prisma);
    await repo.create(poolId, memberId, 40000);
    await repo.create(poolId, organizerId, 60000);

    const deposits = await repo.listByPool(poolId);
    expect(deposits).toHaveLength(2);
  });
});
