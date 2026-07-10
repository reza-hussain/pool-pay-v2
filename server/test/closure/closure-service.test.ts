import { describe, expect, it } from "vitest";
import { ClosureService, computeRefunds } from "../../src/closure/closure-service.js";
import { InMemoryRefundRepository } from "../../src/closure/fakes/in-memory-refund-repository.js";
import { PoolAlreadyClosedError } from "../../src/closure/types.js";
import { InMemoryPoolRepository } from "../../src/pools/fakes/in-memory-pool-repository.js";
import { NotPoolOrganizerError } from "../../src/pools/types.js";
import { InMemoryDepositRepository } from "../../src/deposits/fakes/in-memory-deposit-repository.js";
import { InMemorySpendRepository } from "../../src/spends/fakes/in-memory-spend-repository.js";
import { InMemoryReimbursementRepository } from "../../src/reimbursements/fakes/in-memory-reimbursement-repository.js";
import { FakePaymentProvider } from "../../src/payments/fakes/fake-payment-provider.js";
import { PoolNotFoundError } from "../../src/memberships/types.js";

const ORGANIZER_ID = "user_organizer";
const MEMBER_A = "user_member_a";
const MEMBER_B = "user_member_b";
const STRANGER_ID = "user_stranger";

async function makeService() {
  const poolRepository = new InMemoryPoolRepository();
  const depositRepository = new InMemoryDepositRepository();
  const spendRepository = new InMemorySpendRepository();
  const reimbursementRepository = new InMemoryReimbursementRepository();
  const refundRepository = new InMemoryRefundRepository();
  const paymentProvider = new FakePaymentProvider();
  const closureService = new ClosureService({
    poolRepository,
    depositRepository,
    spendRepository,
    reimbursementRepository,
    refundRepository,
    paymentProvider,
  });

  const pool = await poolRepository.create(ORGANIZER_ID, {
    name: "Goa Trip",
    type: "OPEN",
    perPersonAmountPaise: null,
    joinCode: "111111",
  });

  return {
    closureService,
    poolRepository,
    depositRepository,
    spendRepository,
    reimbursementRepository,
    refundRepository,
    paymentProvider,
    pool,
  };
}

describe("ClosureService.closePool", () => {
  it("refunds each Member pro-rata against their total contributions", async () => {
    const { closureService, depositRepository, pool } = await makeService();
    await depositRepository.create(pool.id, MEMBER_A, 60000);
    await depositRepository.create(pool.id, MEMBER_B, 40000);

    const result = await closureService.closePool(pool.id, ORGANIZER_ID);

    expect(result.refundTotalPaise).toBe(100000);
    const byMember = Object.fromEntries(result.refunds.map((r) => [r.memberId, r.amountPaise]));
    expect(byMember[MEMBER_A]).toBe(60000);
    expect(byMember[MEMBER_B]).toBe(40000);
  });

  it("accounts for Spends and Reimbursements already taken out", async () => {
    const { closureService, depositRepository, spendRepository, reimbursementRepository, pool } =
      await makeService();
    await depositRepository.create(pool.id, MEMBER_A, 60000);
    await depositRepository.create(pool.id, MEMBER_B, 40000);
    await spendRepository.create(pool.id, ORGANIZER_ID, "merchant@upi", 20000, 200);
    await reimbursementRepository.create(pool.id, MEMBER_A, "a@upi", 9800);
    // Remaining balance: 100000 - 20000 - 200 - 9800 = 70000.

    const result = await closureService.closePool(pool.id, ORGANIZER_ID);

    expect(result.refundTotalPaise).toBe(70000);
    const byMember = Object.fromEntries(result.refunds.map((r) => [r.memberId, r.amountPaise]));
    expect(byMember[MEMBER_A]).toBe(42000); // 60% of 70000
    expect(byMember[MEMBER_B]).toBe(28000); // 40% of 70000
  });

  it("sets the Pool's state to CLOSED", async () => {
    const { closureService, pool } = await makeService();

    const result = await closureService.closePool(pool.id, ORGANIZER_ID);

    expect(result.pool.state).toBe("CLOSED");
  });

  it("excludes a Member with zero deposits from the refund", async () => {
    const { closureService, depositRepository, pool } = await makeService();
    await depositRepository.create(pool.id, MEMBER_A, 50000);

    const result = await closureService.closePool(pool.id, ORGANIZER_ID);

    expect(result.refunds.map((r) => r.memberId)).toEqual([MEMBER_A]);
  });

  it("closes a Pool with no deposits and issues no refunds", async () => {
    const { closureService, pool } = await makeService();

    const result = await closureService.closePool(pool.id, ORGANIZER_ID);

    expect(result.refundTotalPaise).toBe(0);
    expect(result.refunds).toEqual([]);
  });

  it("records each Refund with a VPA and no fee", async () => {
    const { closureService, depositRepository, pool } = await makeService();
    await depositRepository.create(pool.id, MEMBER_A, 50000);

    const result = await closureService.closePool(pool.id, ORGANIZER_ID);

    expect(result.refunds[0].vpa).toBeTruthy();
    expect(result.refunds[0].amountPaise).toBe(50000);
  });

  it("rejects Closure by a non-Organizer", async () => {
    const { closureService, pool } = await makeService();

    await expect(closureService.closePool(pool.id, STRANGER_ID)).rejects.toThrow(
      NotPoolOrganizerError,
    );
  });

  it("rejects Closure of an unknown Pool", async () => {
    const { closureService } = await makeService();

    await expect(closureService.closePool("does-not-exist", ORGANIZER_ID)).rejects.toThrow(
      PoolNotFoundError,
    );
  });

  it("rejects Closure of an already-Closed Pool", async () => {
    const { closureService, pool } = await makeService();
    await closureService.closePool(pool.id, ORGANIZER_ID);

    await expect(closureService.closePool(pool.id, ORGANIZER_ID)).rejects.toThrow(
      PoolAlreadyClosedError,
    );
  });

  it("allows Closing a Locked Pool", async () => {
    const { closureService, poolRepository, depositRepository, pool } = await makeService();
    await depositRepository.create(pool.id, MEMBER_A, 50000);
    await poolRepository.updateState(pool.id, "LOCKED");

    const result = await closureService.closePool(pool.id, ORGANIZER_ID);

    expect(result.pool.state).toBe("CLOSED");
  });
});

describe("ClosureService.closePoolViaVote", () => {
  it("closes the Pool and refunds pro-rata without an Organizer check", async () => {
    const { closureService, depositRepository, pool } = await makeService();
    await depositRepository.create(pool.id, MEMBER_A, 60000);
    await depositRepository.create(pool.id, MEMBER_B, 40000);

    const result = await closureService.closePoolViaVote(pool.id);

    expect(result.pool.state).toBe("CLOSED");
    expect(result.refundTotalPaise).toBe(100000);
  });

  it("does not claw back money already Spent or Reimbursed", async () => {
    const { closureService, depositRepository, spendRepository, pool } = await makeService();
    await depositRepository.create(pool.id, MEMBER_A, 100000);
    await spendRepository.create(pool.id, ORGANIZER_ID, "merchant@upi", 40000, 400);

    const result = await closureService.closePoolViaVote(pool.id);

    expect(result.refundTotalPaise).toBe(100000 - 40000 - 400);
  });

  it("rejects Closure of an already-Closed Pool", async () => {
    const { closureService, pool } = await makeService();
    await closureService.closePoolViaVote(pool.id);

    await expect(closureService.closePoolViaVote(pool.id)).rejects.toThrow(PoolAlreadyClosedError);
  });

  it("rejects Closure of an unknown Pool", async () => {
    const { closureService } = await makeService();

    await expect(closureService.closePoolViaVote("does-not-exist")).rejects.toThrow(
      PoolNotFoundError,
    );
  });
});

describe("ClosureService.previewClosure", () => {
  it("returns the same breakdown as closePool would, without paying out or closing", async () => {
    const { closureService, depositRepository, poolRepository, pool } = await makeService();
    await depositRepository.create(pool.id, MEMBER_A, 60000);
    await depositRepository.create(pool.id, MEMBER_B, 40000);

    const preview = await closureService.previewClosure(pool.id, ORGANIZER_ID);

    expect(preview.refundTotalPaise).toBe(100000);
    const stillOpen = await poolRepository.findById(pool.id);
    expect(stillOpen?.state).toBe("ACTIVE");
  });

  it("rejects a non-Organizer", async () => {
    const { closureService, pool } = await makeService();

    await expect(closureService.previewClosure(pool.id, STRANGER_ID)).rejects.toThrow(
      NotPoolOrganizerError,
    );
  });
});

describe("computeRefunds", () => {
  it("distributes rounding remainder so refunds sum to exactly the balance", () => {
    const contributions = new Map([
      ["a", 100],
      ["b", 100],
      ["c", 100],
    ]);

    const refunds = computeRefunds(contributions, 100);

    expect(refunds.reduce((sum, r) => sum + r.amountPaise, 0)).toBe(100);
    // 100/3 = 33.33 each; the leftover paisa goes to one of them.
    expect(refunds.every((r) => r.amountPaise === 33 || r.amountPaise === 34)).toBe(true);
  });

  it("returns an empty list when the remaining balance is zero", () => {
    const contributions = new Map([["a", 100]]);

    expect(computeRefunds(contributions, 0)).toEqual([]);
  });

  it("returns an empty list when nobody contributed", () => {
    expect(computeRefunds(new Map(), 5000)).toEqual([]);
  });
});
