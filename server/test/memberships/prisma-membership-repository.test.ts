import { execSync } from "node:child_process";
import { existsSync, rmSync } from "node:fs";
import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { PrismaMembershipRepository } from "../../src/memberships/prisma-membership-repository.js";

const TEST_DB_PATH = "prisma/memberships-test.db";
const TEST_DB_URL = `file:./memberships-test.db`;

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
  await prisma.membership.deleteMany();
  await prisma.pool.deleteMany();
  await prisma.user.deleteMany();
  const organizer = await prisma.user.create({ data: { phoneNumber: "+919876543210" } });
  const member = await prisma.user.create({ data: { phoneNumber: "+919876500000" } });
  organizerId = organizer.id;
  memberId = member.id;
  const pool = await prisma.pool.create({
    data: { name: "Goa Trip", type: "OPEN", organizerId, joinCode: "999999" },
  });
  poolId = pool.id;
});

afterAll(async () => {
  await prisma.$disconnect();
  if (existsSync(TEST_DB_PATH)) rmSync(TEST_DB_PATH);
});

describe("PrismaMembershipRepository", () => {
  it("creates a membership and finds it by pool and user", async () => {
    const repo = new PrismaMembershipRepository(prisma);

    const created = await repo.create(poolId, memberId, "MEMBER");
    expect(created).toMatchObject({ poolId, userId: memberId, role: "MEMBER" });

    const found = await repo.find(poolId, memberId);
    expect(found?.id).toBe(created.id);

    await expect(repo.find(poolId, "does-not-exist")).resolves.toBeNull();
  });

  it("is idempotent for a repeat create of the same pool and user", async () => {
    const repo = new PrismaMembershipRepository(prisma);
    const first = await repo.create(poolId, memberId, "MEMBER");
    const second = await repo.create(poolId, memberId, "MEMBER");

    expect(second.id).toBe(first.id);
    await expect(repo.listByPool(poolId)).resolves.toHaveLength(1);
  });

  it("lists every membership for a pool", async () => {
    const repo = new PrismaMembershipRepository(prisma);
    await repo.create(poolId, organizerId, "ORGANIZER");
    await repo.create(poolId, memberId, "MEMBER");

    const members = await repo.listByPool(poolId);
    expect(members).toHaveLength(2);
    expect(members.map((m) => m.role).sort()).toEqual(["MEMBER", "ORGANIZER"]);
  });

  it("excludes a removed Member from find() and listByPool()", async () => {
    const repo = new PrismaMembershipRepository(prisma);
    await repo.create(poolId, memberId, "MEMBER");

    await repo.remove(poolId, memberId);

    await expect(repo.find(poolId, memberId)).resolves.toBeNull();
    await expect(repo.listByPool(poolId)).resolves.toEqual([]);
  });

  it("reactivates a removed Membership on rejoin", async () => {
    const repo = new PrismaMembershipRepository(prisma);
    const original = await repo.create(poolId, memberId, "MEMBER");
    await repo.remove(poolId, memberId);

    const rejoined = await repo.create(poolId, memberId, "MEMBER");

    expect(rejoined.id).toBe(original.id);
    await expect(repo.find(poolId, memberId)).resolves.toMatchObject({ id: original.id });
  });
});
