import { execSync } from "node:child_process";
import { existsSync, rmSync } from "node:fs";
import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { PrismaNotificationRepository } from "../../src/notifications/prisma-notification-repository.js";

const TEST_DB_PATH = "prisma/notifications-test.db";
const TEST_DB_URL = `file:./notifications-test.db`;

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
  await prisma.notification.deleteMany();
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

describe("PrismaNotificationRepository", () => {
  it("creates a notification", async () => {
    const repo = new PrismaNotificationRepository(prisma);
    const notification = await repo.create(memberId, poolId, "POOL_LOCKED", "Goa Trip was locked");
    expect(notification).toMatchObject({
      recipientUserId: memberId,
      poolId,
      type: "POOL_LOCKED",
      message: "Goa Trip was locked",
      readAt: null,
    });
  });

  it("lists only the given user's notifications", async () => {
    const repo = new PrismaNotificationRepository(prisma);
    await repo.create(memberId, poolId, "POOL_LOCKED", "Goa Trip was locked");
    await repo.create(organizerId, poolId, "REFUND_PROCESSED", "Refund of ₹500 processed for Goa Trip");

    const forMember = await repo.listByUser(memberId);
    expect(forMember).toHaveLength(1);
    expect(forMember[0].recipientUserId).toBe(memberId);
  });

  it("returns an empty list for a user with no notifications", async () => {
    const repo = new PrismaNotificationRepository(prisma);
    await expect(repo.listByUser(memberId)).resolves.toEqual([]);
  });

  it("marks every unread notification for that user as read, leaving others alone", async () => {
    const repo = new PrismaNotificationRepository(prisma);
    await repo.create(memberId, poolId, "POOL_LOCKED", "Goa Trip was locked");
    await repo.create(organizerId, poolId, "POOL_LOCKED", "Goa Trip was locked");

    await repo.markAllReadForUser(memberId);

    const [forMember] = await repo.listByUser(memberId);
    const [forOrganizer] = await repo.listByUser(organizerId);
    expect(forMember.readAt).not.toBeNull();
    expect(forOrganizer.readAt).toBeNull();
  });
});
