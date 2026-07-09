import { describe, expect, it } from "vitest";
import { SpendService } from "../../src/spends/spend-service.js";
import { InMemorySpendRepository } from "../../src/spends/fakes/in-memory-spend-repository.js";
import { InMemoryDepositRepository } from "../../src/deposits/fakes/in-memory-deposit-repository.js";
import { InMemoryReimbursementRepository } from "../../src/reimbursements/fakes/in-memory-reimbursement-repository.js";
import { InMemoryPoolRepository } from "../../src/pools/fakes/in-memory-pool-repository.js";
import { FakePaymentProvider } from "../../src/payments/fakes/fake-payment-provider.js";
import {
  InsufficientPoolBalanceError,
  InvalidMerchantReferenceError,
  InvalidSpendAmountError,
} from "../../src/spends/types.js";
import { PoolNotFoundError } from "../../src/memberships/types.js";
import { NotPoolOrganizerError } from "../../src/pools/types.js";

const ORGANIZER_ID = "user_organizer";
const MEMBER_ID = "user_member";

async function makeService() {
  const poolRepository = new InMemoryPoolRepository();
  const depositRepository = new InMemoryDepositRepository();
  const spendRepository = new InMemorySpendRepository();
  const reimbursementRepository = new InMemoryReimbursementRepository();
  const paymentProvider = new FakePaymentProvider();
  const spendService = new SpendService({
    poolRepository,
    depositRepository,
    spendRepository,
    reimbursementRepository,
    paymentProvider,
  });

  const pool = await poolRepository.create(ORGANIZER_ID, {
    name: "Goa Trip",
    type: "OPEN",
    perPersonAmountPaise: null,
    joinCode: "111111",
  });
  await depositRepository.create(pool.id, MEMBER_ID, 100000);

  return {
    spendService,
    poolRepository,
    depositRepository,
    spendRepository,
    reimbursementRepository,
    paymentProvider,
    pool,
  };
}

describe("SpendService.recordSpend", () => {
  it("deducts the amount plus a 1% fee from the Pool balance", async () => {
    const { spendService, pool } = await makeService();

    const spend = await spendService.recordSpend(pool.id, ORGANIZER_ID, "merchant@upi", 50000);

    expect(spend.amountPaise).toBe(50000);
    expect(spend.feePaise).toBe(500);
    expect(spend.merchantRef).toBe("merchant@upi");
    expect(await spendService.getPoolBalance(pool.id)).toBe(100000 - 50000 - 500);
  });

  it("rounds the fee to the nearest paise", async () => {
    const { spendService, pool } = await makeService();

    const spend = await spendService.recordSpend(pool.id, ORGANIZER_ID, "merchant@upi", 333);

    expect(spend.feePaise).toBe(3); // 333 * 0.01 = 3.33 -> 3
  });

  it("rejects a Spend that would exceed the Pool's current balance", async () => {
    const { spendService, pool } = await makeService();

    await expect(
      spendService.recordSpend(pool.id, ORGANIZER_ID, "merchant@upi", 100000),
    ).rejects.toThrow(InsufficientPoolBalanceError);
  });

  it("rejects a Spend from a non-Organizer", async () => {
    const { spendService, pool } = await makeService();

    await expect(
      spendService.recordSpend(pool.id, MEMBER_ID, "merchant@upi", 1000),
    ).rejects.toThrow(NotPoolOrganizerError);
  });

  it("rejects a Spend into an unknown Pool", async () => {
    const { spendService } = await makeService();

    await expect(
      spendService.recordSpend("does-not-exist", ORGANIZER_ID, "merchant@upi", 1000),
    ).rejects.toThrow(PoolNotFoundError);
  });

  it("rejects a non-positive amount", async () => {
    const { spendService, pool } = await makeService();

    await expect(
      spendService.recordSpend(pool.id, ORGANIZER_ID, "merchant@upi", 0),
    ).rejects.toThrow(InvalidSpendAmountError);
    await expect(
      spendService.recordSpend(pool.id, ORGANIZER_ID, "merchant@upi", -500),
    ).rejects.toThrow(InvalidSpendAmountError);
  });

  it("rejects a non-integer amount", async () => {
    const { spendService, pool } = await makeService();

    await expect(
      spendService.recordSpend(pool.id, ORGANIZER_ID, "merchant@upi", 100.5),
    ).rejects.toThrow(InvalidSpendAmountError);
  });

  it("rejects a blank merchant reference", async () => {
    const { spendService, pool } = await makeService();

    await expect(spendService.recordSpend(pool.id, ORGANIZER_ID, "  ", 1000)).rejects.toThrow(
      InvalidMerchantReferenceError,
    );
  });

  it("accounts for prior Spends when checking balance for a subsequent Spend", async () => {
    const { spendService, pool } = await makeService();

    await spendService.recordSpend(pool.id, ORGANIZER_ID, "merchant-1@upi", 60000);
    // Balance is now 100000 - 60000 - 600 = 39400. A further 40000 spend
    // (plus its fee) should exceed that.
    await expect(
      spendService.recordSpend(pool.id, ORGANIZER_ID, "merchant-2@upi", 40000),
    ).rejects.toThrow(InsufficientPoolBalanceError);
  });

  it("accounts for prior Reimbursements when checking balance", async () => {
    const { spendService, reimbursementRepository, pool } = await makeService();

    await reimbursementRepository.create(pool.id, MEMBER_ID, "member@upi", 70000);
    // Balance is now 100000 - 70000 = 30000.
    await expect(
      spendService.recordSpend(pool.id, ORGANIZER_ID, "merchant@upi", 30000),
    ).rejects.toThrow(InsufficientPoolBalanceError);
  });
});
