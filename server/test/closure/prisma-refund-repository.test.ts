import { execSync } from "node:child_process";
import { existsSync, rmSync } from "node:fs";
import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { PrismaRefundRepository } from "../../src/closure/prisma-refund-repository.js";

const TEST_DB_PATH = "prisma/refunds-test.db";
const TEST_DB_URL = `file:./refunds-test.db`;

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
  await prisma.refund.deleteMany();
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

describe("PrismaRefundRepository", () => {
  it("creates a refund", async () => {
    const repo = new PrismaRefundRepository(prisma);
    const refund = await repo.create(poolId, memberId, "member@fakebank", 30000);
    expect(refund).toMatchObject({
      poolId,
      memberId,
      vpa: "member@fakebank",
      amountPaise: 30000,
    });
  });

  it("sums refunds by pool", async () => {
    const repo = new PrismaRefundRepository(prisma);
    await repo.create(poolId, memberId, "member@fakebank", 30000);
    await repo.create(poolId, memberId, "member@fakebank", 20000);

    await expect(repo.sumByPool(poolId)).resolves.toBe(50000);
  });

  it("returns 0 for a pool with no refunds", async () => {
    const repo = new PrismaRefundRepository(prisma);
    await expect(repo.sumByPool(poolId)).resolves.toBe(0);
  });

  it("lists every refund for a pool", async () => {
    const repo = new PrismaRefundRepository(prisma);
    await repo.create(poolId, memberId, "member@fakebank", 30000);
    await repo.create(poolId, memberId, "member@fakebank", 20000);

    const refunds = await repo.listByPool(poolId);
    expect(refunds).toHaveLength(2);
  });
});
