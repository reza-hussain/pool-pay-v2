import { execSync } from "node:child_process";
import { existsSync, rmSync } from "node:fs";
import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { PrismaUserRepository } from "../../src/auth/prisma-user-repository.js";
import { PrismaOtpStore } from "../../src/auth/prisma-otp-store.js";
import { PrismaUpiOwnershipConfirmationRepository } from "../../src/auth/prisma-upi-ownership-confirmation-repository.js";

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
  await prisma.upiOwnershipConfirmation.deleteMany();
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

  it("creates a new user with no profile, and can complete Onboarding (ADR 0012)", async () => {
    const repo = new PrismaUserRepository(prisma);
    const created = await repo.create("+919876543210");
    expect(created).toMatchObject({ isOnboarded: false, name: null, upiId: null });

    const onboarded = await repo.completeProfile(created.id, {
      name: "Asha Rao",
      email: "asha@example.com",
      dateOfBirth: new Date("2000-01-01T00:00:00.000Z"),
      upiId: "asha@upi",
      avatarUrl: null,
    });
    expect(onboarded).toMatchObject({ isOnboarded: true, name: "Asha Rao", upiId: "asha@upi" });

    const found = await repo.findById(created.id);
    expect(found).toMatchObject({ isOnboarded: true, upiId: "asha@upi" });
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

describe("PrismaUpiOwnershipConfirmationRepository (ticket #38, ADR 0015)", () => {
  it("creates a PENDING confirmation and finds it by id or providerRef", async () => {
    const userRepo = new PrismaUserRepository(prisma);
    const user = await userRepo.create("+919876543210");
    const repo = new PrismaUpiOwnershipConfirmationRepository(prisma);

    const createdAt = new Date("2026-07-09T00:00:00.000Z");
    const created = await repo.create(user.id, "asha.rao@upi", "ref_1", createdAt);
    expect(created).toMatchObject({
      userId: user.id,
      upiId: "asha.rao@upi",
      providerRef: "ref_1",
      status: "PENDING",
      confirmedAt: null,
    });
    expect(created.createdAt).toEqual(createdAt);

    await expect(repo.findById(created.id)).resolves.toMatchObject({ providerRef: "ref_1" });
    await expect(repo.findByProviderRef("ref_1")).resolves.toMatchObject({ userId: user.id });
    await expect(repo.findByProviderRef("does-not-exist")).resolves.toBeNull();
  });

  it("marks a confirmation CONFIRMED and surfaces it as the latest confirmed for that (userId, upiId)", async () => {
    const userRepo = new PrismaUserRepository(prisma);
    const user = await userRepo.create("+919876543210");
    const repo = new PrismaUpiOwnershipConfirmationRepository(prisma);
    await repo.create(user.id, "asha.rao@upi", "ref_1", new Date());

    await expect(repo.findLatestConfirmed(user.id, "asha.rao@upi")).resolves.toBeNull();

    await repo.markConfirmed("ref_1");

    const confirmed = await repo.findLatestConfirmed(user.id, "asha.rao@upi");
    expect(confirmed).toMatchObject({ providerRef: "ref_1", status: "CONFIRMED" });
    expect(confirmed?.confirmedAt).toBeInstanceOf(Date);
  });

  it("marks a confirmation FAILED", async () => {
    const userRepo = new PrismaUserRepository(prisma);
    const user = await userRepo.create("+919876543210");
    const repo = new PrismaUpiOwnershipConfirmationRepository(prisma);
    await repo.create(user.id, "asha.rao@upi", "ref_1", new Date());

    await repo.markFailed("ref_1");

    const found = await repo.findByProviderRef("ref_1");
    expect(found?.status).toBe("FAILED");
  });

  it("doesn't surface a CONFIRMED row for a different UPI ID as the latest confirmed", async () => {
    const userRepo = new PrismaUserRepository(prisma);
    const user = await userRepo.create("+919876543210");
    const repo = new PrismaUpiOwnershipConfirmationRepository(prisma);
    await repo.create(user.id, "asha.rao@upi", "ref_1", new Date());
    await repo.markConfirmed("ref_1");

    await expect(repo.findLatestConfirmed(user.id, "someone-else@upi")).resolves.toBeNull();
  });
});
