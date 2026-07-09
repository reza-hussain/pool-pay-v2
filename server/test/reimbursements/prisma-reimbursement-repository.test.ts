import { execSync } from "node:child_process";
import { existsSync, rmSync } from "node:fs";
import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { PrismaReimbursementRepository } from "../../src/reimbursements/prisma-reimbursement-repository.js";

const TEST_DB_PATH = "prisma/reimbursements-test.db";
const TEST_DB_URL = `file:./reimbursements-test.db`;

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
  await prisma.reimbursement.deleteMany();
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

describe("PrismaReimbursementRepository", () => {
  it("creates a reimbursement", async () => {
    const repo = new PrismaReimbursementRepository(prisma);
    const reimbursement = await repo.create(poolId, memberId, "member@upi", 30000);
    expect(reimbursement).toMatchObject({
      poolId,
      memberId,
      vpa: "member@upi",
      amountPaise: 30000,
    });
  });

  it("sums reimbursements by pool", async () => {
    const repo = new PrismaReimbursementRepository(prisma);
    await repo.create(poolId, memberId, "member@upi", 30000);
    await repo.create(poolId, memberId, "member@upi", 20000);

    await expect(repo.sumByPool(poolId)).resolves.toBe(50000);
  });

  it("returns 0 for a pool with no reimbursements", async () => {
    const repo = new PrismaReimbursementRepository(prisma);
    await expect(repo.sumByPool(poolId)).resolves.toBe(0);
  });

  it("lists every reimbursement for a pool", async () => {
    const repo = new PrismaReimbursementRepository(prisma);
    await repo.create(poolId, memberId, "member@upi", 30000);
    await repo.create(poolId, memberId, "member@upi", 20000);

    const reimbursements = await repo.listByPool(poolId);
    expect(reimbursements).toHaveLength(2);
  });
});
