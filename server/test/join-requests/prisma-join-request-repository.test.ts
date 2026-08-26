import { execSync } from "node:child_process";
import { existsSync, rmSync } from "node:fs";
import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { PrismaJoinRequestRepository } from "../../src/join-requests/prisma-join-request-repository.js";
import { JoinRequestNotPendingError } from "../../src/join-requests/types.js";

const TEST_DB_PATH = "prisma/join-requests-test.db";
const TEST_DB_URL = `file:./join-requests-test.db`;

let prisma: PrismaClient;
let organizerId: string;
let requesterId: string;
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
  await prisma.joinRequest.deleteMany();
  await prisma.pool.deleteMany();
  await prisma.user.deleteMany();
  const organizer = await prisma.user.create({ data: { phoneNumber: "+919876543210" } });
  const requester = await prisma.user.create({ data: { phoneNumber: "+919876500000" } });
  organizerId = organizer.id;
  requesterId = requester.id;
  const pool = await prisma.pool.create({
    data: { name: "Goa Trip", type: "EQUAL_SPLIT", perPersonAmountPaise: 100000, organizerId, joinCode: "999999" },
  });
  poolId = pool.id;
});

afterAll(async () => {
  await prisma.$disconnect();
  if (existsSync(TEST_DB_PATH)) rmSync(TEST_DB_PATH);
});

describe("PrismaJoinRequestRepository", () => {
  it("creates a PENDING request and finds it by id", async () => {
    const repo = new PrismaJoinRequestRepository(prisma);

    const created = await repo.create({ poolId, requesterUserId: requesterId });
    expect(created).toMatchObject({ poolId, requesterUserId: requesterId, state: "PENDING" });
    expect(created.decidedAt).toBeNull();

    const found = await repo.findById(created.id);
    expect(found?.id).toBe(created.id);
  });

  it("findLatestByPoolAndRequester returns the most recent request", async () => {
    const repo = new PrismaJoinRequestRepository(prisma);
    const first = await repo.create({ poolId, requesterUserId: requesterId });
    await repo.reject(first.id);
    const second = await repo.create({ poolId, requesterUserId: requesterId });

    const latest = await repo.findLatestByPoolAndRequester(poolId, requesterId);
    expect(latest?.id).toBe(second.id);
  });

  it("listPendingByPool returns only PENDING requests, oldest first", async () => {
    const repo = new PrismaJoinRequestRepository(prisma);
    const other = await prisma.user.create({ data: { phoneNumber: "+919876500001" } });
    const first = await repo.create({ poolId, requesterUserId: requesterId });
    const second = await repo.create({ poolId, requesterUserId: other.id });
    await repo.approve(first.id);

    const pending = await repo.listPendingByPool(poolId);
    expect(pending.map((r) => r.id)).toEqual([second.id]);
  });

  it("approve marks the request APPROVED with a decidedAt", async () => {
    const repo = new PrismaJoinRequestRepository(prisma);
    const created = await repo.create({ poolId, requesterUserId: requesterId });

    const approved = await repo.approve(created.id);

    expect(approved.state).toBe("APPROVED");
    expect(approved.decidedAt).not.toBeNull();
  });

  it("reject marks the request REJECTED with a decidedAt", async () => {
    const repo = new PrismaJoinRequestRepository(prisma);
    const created = await repo.create({ poolId, requesterUserId: requesterId });

    const rejected = await repo.reject(created.id);

    expect(rejected.state).toBe("REJECTED");
    expect(rejected.decidedAt).not.toBeNull();
  });

  it("throws JoinRequestNotPendingError approving an already-decided request (race guard)", async () => {
    const repo = new PrismaJoinRequestRepository(prisma);
    const created = await repo.create({ poolId, requesterUserId: requesterId });
    await repo.approve(created.id);

    await expect(repo.approve(created.id)).rejects.toThrow(JoinRequestNotPendingError);
    await expect(repo.reject(created.id)).rejects.toThrow(JoinRequestNotPendingError);
  });
});
