import { execSync } from "node:child_process";
import { existsSync, rmSync } from "node:fs";
import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { PrismaSpendAttributionRepository } from "../../src/spends/prisma-spend-attribution-repository.js";

const TEST_DB_PATH = "prisma/spend-attributions-test.db";
const TEST_DB_URL = `file:./spend-attributions-test.db`;

let prisma: PrismaClient;
let organizerId: string;
let memberAId: string;
let memberBId: string;
let poolId: string;
let spendId: string;
let otherSpendId: string;

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
  await prisma.spendAttribution.deleteMany();
  await prisma.spend.deleteMany();
  await prisma.pool.deleteMany();
  await prisma.user.deleteMany();
  const organizer = await prisma.user.create({ data: { phoneNumber: "+919876543210" } });
  organizerId = organizer.id;
  const memberA = await prisma.user.create({ data: { phoneNumber: "+919876543211" } });
  memberAId = memberA.id;
  const memberB = await prisma.user.create({ data: { phoneNumber: "+919876543212" } });
  memberBId = memberB.id;
  const pool = await prisma.pool.create({
    data: { name: "Goa Trip", type: "OPEN", organizerId, joinCode: "555555" },
  });
  poolId = pool.id;
  const spend = await prisma.spend.create({
    data: { poolId, userId: organizerId, merchantRef: "merchant@upi", amountPaise: 20000, feePaise: 200 },
  });
  spendId = spend.id;
  const otherSpend = await prisma.spend.create({
    data: { poolId, userId: organizerId, merchantRef: "other@upi", amountPaise: 5000, feePaise: 50 },
  });
  otherSpendId = otherSpend.id;
});

afterAll(async () => {
  await prisma.$disconnect();
  if (existsSync(TEST_DB_PATH)) rmSync(TEST_DB_PATH);
});

describe("PrismaSpendAttributionRepository", () => {
  it("creates one row per Member share for a Spend", async () => {
    const repo = new PrismaSpendAttributionRepository(prisma);

    const created = await repo.createForSpend(spendId, poolId, [
      { memberId: memberAId, amountPaise: 10100 },
      { memberId: memberBId, amountPaise: 10100 },
    ]);

    expect(created).toHaveLength(2);
    expect(created).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ spendId, poolId, memberId: memberAId, amountPaise: 10100 }),
        expect.objectContaining({ spendId, poolId, memberId: memberBId, amountPaise: 10100 }),
      ]),
    );
  });

  it("sums a Member's attributed amount across every Spend in a Pool", async () => {
    const repo = new PrismaSpendAttributionRepository(prisma);
    await repo.createForSpend(spendId, poolId, [{ memberId: memberAId, amountPaise: 20200 }]);
    await repo.createForSpend(otherSpendId, poolId, [{ memberId: memberAId, amountPaise: 5050 }]);

    await expect(repo.sumByPoolAndMember(poolId, memberAId)).resolves.toBe(25250);
  });

  it("returns 0 for a Member with no attributions in the Pool", async () => {
    const repo = new PrismaSpendAttributionRepository(prisma);

    await expect(repo.sumByPoolAndMember(poolId, memberAId)).resolves.toBe(0);
  });

  it("excludes another Member's attributions from the sum", async () => {
    const repo = new PrismaSpendAttributionRepository(prisma);
    await repo.createForSpend(spendId, poolId, [
      { memberId: memberAId, amountPaise: 10100 },
      { memberId: memberBId, amountPaise: 10100 },
    ]);

    await expect(repo.sumByPoolAndMember(poolId, memberAId)).resolves.toBe(10100);
  });

  it("lists every attribution for a pool", async () => {
    const repo = new PrismaSpendAttributionRepository(prisma);
    await repo.createForSpend(spendId, poolId, [
      { memberId: memberAId, amountPaise: 10100 },
      { memberId: memberBId, amountPaise: 10100 },
    ]);
    await repo.createForSpend(otherSpendId, poolId, [{ memberId: memberAId, amountPaise: 5050 }]);

    const attributions = await repo.listByPool(poolId);
    expect(attributions).toHaveLength(3);
  });

  it("lists only the attributions for one specific Spend", async () => {
    const repo = new PrismaSpendAttributionRepository(prisma);
    await repo.createForSpend(spendId, poolId, [
      { memberId: memberAId, amountPaise: 10100 },
      { memberId: memberBId, amountPaise: 10100 },
    ]);
    await repo.createForSpend(otherSpendId, poolId, [{ memberId: memberAId, amountPaise: 5050 }]);

    const attributions = await repo.listBySpend(spendId);
    expect(attributions).toHaveLength(2);
    expect(attributions.every((a) => a.spendId === spendId)).toBe(true);
  });
});
