import { execSync } from "node:child_process";
import { existsSync, rmSync } from "node:fs";
import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { PrismaPoolRepository } from "../../src/pools/prisma-pool-repository.js";

const TEST_DB_PATH = "prisma/pools-test.db";
const TEST_DB_URL = `file:./pools-test.db`;

let prisma: PrismaClient;
let organizerId: string;

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
  await prisma.pool.deleteMany();
  await prisma.user.deleteMany();
  const organizer = await prisma.user.create({ data: { phoneNumber: "+919876543210" } });
  organizerId = organizer.id;
});

afterAll(async () => {
  await prisma.$disconnect();
  if (existsSync(TEST_DB_PATH)) rmSync(TEST_DB_PATH);
});

describe("PrismaPoolRepository", () => {
  it("creates an Equal Split Pool owned by the organizer, ACTIVE by default", async () => {
    const repo = new PrismaPoolRepository(prisma);

    const pool = await repo.create(organizerId, {
      name: "Goa Trip",
      type: "EQUAL_SPLIT",
      perPersonAmountPaise: 100000,
      joinCode: "111111",
    });

    expect(pool.organizerId).toBe(organizerId);
    expect(pool.type).toBe("EQUAL_SPLIT");
    expect(pool.perPersonAmountPaise).toBe(100000);
    expect(pool.state).toBe("ACTIVE");
    expect(pool.joinCode).toBe("111111");

    const row = await prisma.pool.findUnique({ where: { id: pool.id } });
    expect(row?.name).toBe("Goa Trip");
  });

  it("creates an Open Pool with a null per-person amount", async () => {
    const repo = new PrismaPoolRepository(prisma);

    const pool = await repo.create(organizerId, {
      name: "Flat 3B Rent",
      type: "OPEN",
      perPersonAmountPaise: null,
      joinCode: "222222",
    });

    expect(pool.type).toBe("OPEN");
    expect(pool.perPersonAmountPaise).toBeNull();
  });

  it("finds a Pool by id", async () => {
    const repo = new PrismaPoolRepository(prisma);
    const created = await repo.create(organizerId, {
      name: "Goa Trip",
      type: "OPEN",
      perPersonAmountPaise: null,
      joinCode: "333333",
    });

    const found = await repo.findById(created.id);
    expect(found?.id).toBe(created.id);

    await expect(repo.findById("does-not-exist")).resolves.toBeNull();
  });

  it("finds a Pool by join code", async () => {
    const repo = new PrismaPoolRepository(prisma);
    const created = await repo.create(organizerId, {
      name: "Goa Trip",
      type: "OPEN",
      perPersonAmountPaise: null,
      joinCode: "444444",
    });

    const found = await repo.findByJoinCode("444444");
    expect(found?.id).toBe(created.id);

    await expect(repo.findByJoinCode("000000")).resolves.toBeNull();
  });

  it("updates a Pool's state", async () => {
    const repo = new PrismaPoolRepository(prisma);
    const created = await repo.create(organizerId, {
      name: "Goa Trip",
      type: "OPEN",
      perPersonAmountPaise: null,
      joinCode: "555555",
    });

    const updated = await repo.updateState(created.id, "LOCKED");
    expect(updated.state).toBe("LOCKED");

    const found = await repo.findById(created.id);
    expect(found?.state).toBe("LOCKED");
  });

  it("lists every Pool for an organizer", async () => {
    const repo = new PrismaPoolRepository(prisma);
    await repo.create(organizerId, {
      name: "Goa Trip",
      type: "OPEN",
      perPersonAmountPaise: null,
      joinCode: "666666",
    });
    await repo.create(organizerId, {
      name: "Flat 3B Rent",
      type: "OPEN",
      perPersonAmountPaise: null,
      joinCode: "777777",
    });

    const pools = await repo.listByOrganizer(organizerId);
    expect(pools).toHaveLength(2);

    await expect(repo.listByOrganizer("does-not-exist")).resolves.toEqual([]);
  });
});
