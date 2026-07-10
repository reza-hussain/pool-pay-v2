import { execSync } from "node:child_process";
import { existsSync, rmSync } from "node:fs";
import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { PrismaPendingDepositRepository } from "../../src/deposits/prisma-pending-deposit-repository.js";

const TEST_DB_PATH = "prisma/pending-deposits-test.db";
const TEST_DB_URL = `file:./pending-deposits-test.db`;

let prisma: PrismaClient;
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
  await prisma.pendingDeposit.deleteMany();
  await prisma.membership.deleteMany();
  await prisma.pool.deleteMany();
  await prisma.user.deleteMany();
  const organizer = await prisma.user.create({ data: { phoneNumber: "+919876543210" } });
  const member = await prisma.user.create({ data: { phoneNumber: "+919876500000" } });
  memberId = member.id;
  const pool = await prisma.pool.create({
    data: {
      name: "Goa Trip",
      type: "EQUAL_SPLIT",
      perPersonAmountPaise: 100000,
      organizerId: organizer.id,
      joinCode: "555555",
    },
  });
  poolId = pool.id;
});

afterAll(async () => {
  await prisma.$disconnect();
  if (existsSync(TEST_DB_PATH)) rmSync(TEST_DB_PATH);
});

describe("PrismaPendingDepositRepository", () => {
  it("creates a pending deposit unconsumed", async () => {
    const repo = new PrismaPendingDepositRepository(prisma);
    const pending = await repo.create("ref_1", poolId, memberId);
    expect(pending).toMatchObject({
      providerRef: "ref_1",
      poolId,
      userId: memberId,
      consumedAt: null,
      resultingDepositId: null,
    });
  });

  it("finds a pending deposit by providerRef, or returns null", async () => {
    const repo = new PrismaPendingDepositRepository(prisma);
    await repo.create("ref_1", poolId, memberId);

    await expect(repo.findByProviderRef("ref_1")).resolves.toMatchObject({ poolId, userId: memberId });
    await expect(repo.findByProviderRef("does-not-exist")).resolves.toBeNull();
  });

  it("marks a pending deposit consumed with the resulting deposit id", async () => {
    const repo = new PrismaPendingDepositRepository(prisma);
    await repo.create("ref_1", poolId, memberId);

    await repo.markConsumed("ref_1", "deposit_1");

    const pending = await repo.findByProviderRef("ref_1");
    expect(pending?.resultingDepositId).toBe("deposit_1");
    expect(pending?.consumedAt).toBeInstanceOf(Date);
  });
});
