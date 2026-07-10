import { execSync } from "node:child_process";
import { existsSync, rmSync } from "node:fs";
import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { PrismaUserRepository } from "../../src/auth/prisma-user-repository.js";
import { PrismaOtpStore } from "../../src/auth/prisma-otp-store.js";

const TEST_DB_PATH = "prisma/test.db";
const TEST_DB_URL = `file:./test.db`;

let prisma: PrismaClient;

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
  await prisma.otpRequest.deleteMany();
  await prisma.user.deleteMany();
});

afterAll(async () => {
  await prisma.$disconnect();
  if (existsSync(TEST_DB_PATH)) rmSync(TEST_DB_PATH);
});

describe("PrismaUserRepository", () => {
  it("returns null when no user exists for a phone number", async () => {
    const repo = new PrismaUserRepository(prisma);
    await expect(repo.findByPhoneNumber("+919876543210")).resolves.toBeNull();
  });

  it("creates a user and finds it by phone number afterward", async () => {
    const repo = new PrismaUserRepository(prisma);
    const created = await repo.create("+919876543210");
    expect(created.phoneNumber).toBe("+919876543210");

    const found = await repo.findByPhoneNumber("+919876543210");
    expect(found?.id).toBe(created.id);
  });

  it("enforces one user per phone number", async () => {
    const repo = new PrismaUserRepository(prisma);
    await repo.create("+919876543210");
    await expect(repo.create("+919876543210")).rejects.toThrow();
  });

  it("creates a new user as not fully verified", async () => {
    const repo = new PrismaUserRepository(prisma);
    const created = await repo.create("+919876543210");
    expect(created.isVerified).toBe(false);
  });

  it("finds a user by id", async () => {
    const repo = new PrismaUserRepository(prisma);
    const created = await repo.create("+919876543210");

    const found = await repo.findById(created.id);
    expect(found?.id).toBe(created.id);
    await expect(repo.findById("does-not-exist")).resolves.toBeNull();
  });

  it("marks a user as fully verified", async () => {
    const repo = new PrismaUserRepository(prisma);
    const created = await repo.create("+919876543210");

    const verified = await repo.markFullyVerified(created.id);
    expect(verified.isVerified).toBe(true);

    const found = await repo.findById(created.id);
    expect(found?.isVerified).toBe(true);
  });

  it("creates a new user as not subscribed, and can mark them subscribed", async () => {
    const repo = new PrismaUserRepository(prisma);
    const created = await repo.create("+919876543210");
    expect(created.isSubscribed).toBe(false);

    const subscribed = await repo.subscribe(created.id);
    expect(subscribed.isSubscribed).toBe(true);

    const found = await repo.findById(created.id);
    expect(found?.isSubscribed).toBe(true);
  });
});

describe("PrismaOtpStore", () => {
  it("creates a challenge and finds it by id", async () => {
    const store = new PrismaOtpStore(prisma);
    const expiresAt = new Date(Date.now() + 60_000);
    const challenge = await store.create("+919876543210", "123456", expiresAt);

    const found = await store.findById(challenge.id);
    expect(found).toMatchObject({ phoneNumber: "+919876543210", code: "123456" });
    expect(found?.consumedAt).toBeNull();
  });

  it("marks a challenge as consumed", async () => {
    const store = new PrismaOtpStore(prisma);
    const challenge = await store.create(
      "+919876543210",
      "123456",
      new Date(Date.now() + 60_000),
    );

    await store.markConsumed(challenge.id);

    const found = await store.findById(challenge.id);
    expect(found?.consumedAt).not.toBeNull();
  });
});
