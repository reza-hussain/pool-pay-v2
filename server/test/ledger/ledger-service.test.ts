import { describe, expect, it } from "vitest";
import { LedgerService } from "../../src/ledger/ledger-service.js";
import { InvalidLedgerCursorError, NotAPoolMemberError } from "../../src/ledger/types.js";
import { InMemoryPoolRepository } from "../../src/pools/fakes/in-memory-pool-repository.js";
import { InMemoryMembershipRepository } from "../../src/memberships/fakes/in-memory-membership-repository.js";
import { InMemoryDepositRepository } from "../../src/deposits/fakes/in-memory-deposit-repository.js";
import { InMemorySpendRepository } from "../../src/spends/fakes/in-memory-spend-repository.js";
import { InMemoryReimbursementRepository } from "../../src/reimbursements/fakes/in-memory-reimbursement-repository.js";
import { InMemoryRefundRepository } from "../../src/closure/fakes/in-memory-refund-repository.js";
import { PoolNotFoundError } from "../../src/memberships/types.js";

const ORGANIZER_ID = "user_organizer";
const MEMBER_ID = "user_member";
const STRANGER_ID = "user_stranger";

async function makeService() {
  const poolRepository = new InMemoryPoolRepository();
  const membershipRepository = new InMemoryMembershipRepository();
  const depositRepository = new InMemoryDepositRepository();
  const spendRepository = new InMemorySpendRepository();
  const reimbursementRepository = new InMemoryReimbursementRepository();
  const refundRepository = new InMemoryRefundRepository();
  const ledgerService = new LedgerService({
    poolRepository,
    membershipRepository,
    depositRepository,
    spendRepository,
    reimbursementRepository,
    refundRepository,
  });

  const pool = await poolRepository.create(ORGANIZER_ID, {
    name: "Goa Trip",
    type: "OPEN",
    perPersonAmountPaise: null,
    joinCode: "111111",
  });
  await membershipRepository.create(pool.id, ORGANIZER_ID, "ORGANIZER");
  await membershipRepository.create(pool.id, MEMBER_ID, "MEMBER");

  return {
    ledgerService,
    poolRepository,
    depositRepository,
    spendRepository,
    reimbursementRepository,
    refundRepository,
    pool,
  };
}

describe("LedgerService.getLedger", () => {
  it("merges Deposits, Spends, Reimbursements, and Refunds into one chronological list", async () => {
    const {
      ledgerService,
      depositRepository,
      spendRepository,
      reimbursementRepository,
      refundRepository,
      pool,
    } = await makeService();

    await depositRepository.create(pool.id, MEMBER_ID, 100000);
    await spendRepository.create(pool.id, ORGANIZER_ID, "merchant@upi", 30000, 300);
    await reimbursementRepository.create(pool.id, MEMBER_ID, "member@upi", 20000);
    await refundRepository.create(pool.id, MEMBER_ID, "member@fakebank", 10000);

    const { entries } = await ledgerService.getLedger(pool.id, MEMBER_ID);

    expect(entries).toHaveLength(4);
    expect(entries.map((e) => e.type).sort()).toEqual([
      "DEPOSIT",
      "REFUND",
      "REIMBURSEMENT",
      "SPEND",
    ]);
  });

  it("shows the refunded Member as the counterparty for a Refund", async () => {
    const { ledgerService, refundRepository, pool } = await makeService();
    await refundRepository.create(pool.id, MEMBER_ID, "member@fakebank", 10000);

    const { entries } = await ledgerService.getLedger(pool.id, MEMBER_ID);
    expect(entries[0]).toMatchObject({ type: "REFUND", amountPaise: 10000, counterparty: MEMBER_ID });
  });

  it("shows the depositing Member as the counterparty for a Deposit", async () => {
    const { ledgerService, depositRepository, pool } = await makeService();
    await depositRepository.create(pool.id, MEMBER_ID, 100000);

    const { entries } = await ledgerService.getLedger(pool.id, MEMBER_ID);
    expect(entries[0]).toMatchObject({ type: "DEPOSIT", amountPaise: 100000, counterparty: MEMBER_ID });
  });

  it("shows the merchant reference and separate fee for a Spend", async () => {
    const { ledgerService, spendRepository, pool } = await makeService();
    await spendRepository.create(pool.id, ORGANIZER_ID, "merchant@upi", 30000, 300);

    const { entries } = await ledgerService.getLedger(pool.id, MEMBER_ID);
    expect(entries[0]).toMatchObject({
      type: "SPEND",
      amountPaise: 30000,
      feePaise: 300,
      counterparty: "merchant@upi",
    });
  });

  it("shows the reimbursed Member as the counterparty for a Reimbursement", async () => {
    const { ledgerService, reimbursementRepository, pool } = await makeService();
    await reimbursementRepository.create(pool.id, MEMBER_ID, "member@upi", 20000);

    const { entries } = await ledgerService.getLedger(pool.id, MEMBER_ID);
    expect(entries[0]).toMatchObject({
      type: "REIMBURSEMENT",
      amountPaise: 20000,
      counterparty: MEMBER_ID,
    });
  });

  it("orders entries newest first", async () => {
    const { ledgerService, depositRepository, pool } = await makeService();
    const first = await depositRepository.create(pool.id, MEMBER_ID, 10000);
    await new Promise((resolve) => setTimeout(resolve, 5));
    const second = await depositRepository.create(pool.id, MEMBER_ID, 20000);

    const { entries } = await ledgerService.getLedger(pool.id, MEMBER_ID);
    expect(entries[0].id).toBe(second.id);
    expect(entries[1].id).toBe(first.id);
  });

  it("is visible to the Organizer too", async () => {
    const { ledgerService, depositRepository, pool } = await makeService();
    await depositRepository.create(pool.id, MEMBER_ID, 10000);

    const { entries } = await ledgerService.getLedger(pool.id, ORGANIZER_ID);
    expect(entries).toHaveLength(1);
  });

  it("rejects a non-Member", async () => {
    const { ledgerService, pool } = await makeService();
    await expect(ledgerService.getLedger(pool.id, STRANGER_ID)).rejects.toThrow(
      NotAPoolMemberError,
    );
  });

  it("rejects an unknown Pool", async () => {
    const { ledgerService } = await makeService();
    await expect(ledgerService.getLedger("does-not-exist", MEMBER_ID)).rejects.toThrow(
      PoolNotFoundError,
    );
  });

  it("exposes a Spend's actor separately from its merchant-reference counterparty", async () => {
    const { ledgerService, spendRepository, pool } = await makeService();
    await spendRepository.create(pool.id, ORGANIZER_ID, "merchant@upi", 30000, 300);

    const { entries } = await ledgerService.getLedger(pool.id, MEMBER_ID);
    expect(entries[0]).toMatchObject({
      type: "SPEND",
      counterparty: "merchant@upi",
      actor: ORGANIZER_ID,
    });
  });

  it("leaves actor unset for non-SPEND entry types", async () => {
    const { ledgerService, depositRepository, pool } = await makeService();
    await depositRepository.create(pool.id, MEMBER_ID, 10000);

    const { entries } = await ledgerService.getLedger(pool.id, MEMBER_ID);
    expect(entries[0].actor).toBeUndefined();
  });

  describe("filtering", () => {
    it("filters by date range (from/to, inclusive)", async () => {
      const { ledgerService, depositRepository, pool } = await makeService();
      const first = await depositRepository.create(pool.id, MEMBER_ID, 10000);
      await new Promise((resolve) => setTimeout(resolve, 5));
      const cutoff = new Date();
      await new Promise((resolve) => setTimeout(resolve, 5));
      const second = await depositRepository.create(pool.id, MEMBER_ID, 20000);

      const { entries: after } = await ledgerService.getLedger(pool.id, MEMBER_ID, { from: cutoff });
      expect(after.map((e) => e.id)).toEqual([second.id]);

      const { entries: before } = await ledgerService.getLedger(pool.id, MEMBER_ID, { to: cutoff });
      expect(before.map((e) => e.id)).toEqual([first.id]);
    });

    it("filters by entry type", async () => {
      const { ledgerService, depositRepository, spendRepository, pool } = await makeService();
      await depositRepository.create(pool.id, MEMBER_ID, 10000);
      await spendRepository.create(pool.id, ORGANIZER_ID, "merchant@upi", 30000, 300);

      const { entries } = await ledgerService.getLedger(pool.id, MEMBER_ID, { types: ["SPEND"] });
      expect(entries).toHaveLength(1);
      expect(entries[0].type).toBe("SPEND");
    });

    it("filters by a subset of multiple entry types", async () => {
      const {
        ledgerService,
        depositRepository,
        spendRepository,
        reimbursementRepository,
        refundRepository,
        pool,
      } = await makeService();
      await depositRepository.create(pool.id, MEMBER_ID, 10000);
      await spendRepository.create(pool.id, ORGANIZER_ID, "merchant@upi", 30000, 300);
      await reimbursementRepository.create(pool.id, MEMBER_ID, "member@upi", 20000);
      await refundRepository.create(pool.id, MEMBER_ID, "member@fakebank", 10000);

      const { entries } = await ledgerService.getLedger(pool.id, MEMBER_ID, {
        types: ["SPEND", "REFUND"],
      });
      expect(entries.map((e) => e.type).sort()).toEqual(["REFUND", "SPEND"]);
    });

    it("filters by counterparty (Member userId)", async () => {
      const { ledgerService, depositRepository, pool } = await makeService();
      await depositRepository.create(pool.id, MEMBER_ID, 10000);
      await depositRepository.create(pool.id, ORGANIZER_ID, 20000);

      const { entries } = await ledgerService.getLedger(pool.id, MEMBER_ID, {
        counterparty: ORGANIZER_ID,
      });
      expect(entries).toHaveLength(1);
      expect(entries[0].counterparty).toBe(ORGANIZER_ID);
    });

    it("search matches a Deposit's counterparty phone-suffix", async () => {
      const { ledgerService, depositRepository, pool } = await makeService();
      await depositRepository.create(pool.id, MEMBER_ID, 10000);
      const suffix = MEMBER_ID.slice(-4);

      const { entries } = await ledgerService.getLedger(pool.id, MEMBER_ID, { search: suffix });
      expect(entries).toHaveLength(1);
    });

    it("search does not match a Deposit counterparty outside its phone-suffix", async () => {
      const { ledgerService, depositRepository, pool } = await makeService();
      await depositRepository.create(pool.id, MEMBER_ID, 10000);

      const { entries } = await ledgerService.getLedger(pool.id, MEMBER_ID, {
        search: MEMBER_ID.slice(0, 4),
      });
      expect(entries).toHaveLength(0);
    });

    it("search matches a Reimbursement's counterparty phone-suffix", async () => {
      const { ledgerService, reimbursementRepository, pool } = await makeService();
      await reimbursementRepository.create(pool.id, MEMBER_ID, "member@upi", 20000);

      const { entries } = await ledgerService.getLedger(pool.id, MEMBER_ID, {
        search: MEMBER_ID.slice(-4),
      });
      expect(entries).toHaveLength(1);
      expect(entries[0].type).toBe("REIMBURSEMENT");
    });

    it("search matches a Refund's counterparty phone-suffix", async () => {
      const { ledgerService, refundRepository, pool } = await makeService();
      await refundRepository.create(pool.id, MEMBER_ID, "member@fakebank", 10000);

      const { entries } = await ledgerService.getLedger(pool.id, MEMBER_ID, {
        search: MEMBER_ID.slice(-4),
      });
      expect(entries).toHaveLength(1);
      expect(entries[0].type).toBe("REFUND");
    });

    it("search matches a Spend's full merchantRef, not just its suffix", async () => {
      const { ledgerService, spendRepository, pool } = await makeService();
      await spendRepository.create(pool.id, ORGANIZER_ID, "merchant@upi", 30000, 300);

      const { entries } = await ledgerService.getLedger(pool.id, MEMBER_ID, {
        search: "merchant",
      });
      expect(entries).toHaveLength(1);
      expect(entries[0].type).toBe("SPEND");
    });

    it("search is case-insensitive", async () => {
      const { ledgerService, spendRepository, pool } = await makeService();
      await spendRepository.create(pool.id, ORGANIZER_ID, "Merchant@UPI", 30000, 300);

      const { entries } = await ledgerService.getLedger(pool.id, MEMBER_ID, {
        search: "merchant",
      });
      expect(entries).toHaveLength(1);
    });
  });

  describe("pagination", () => {
    async function seedFive(depositRepository: { create: (poolId: string, userId: string, amountPaise: number) => Promise<{ id: string }> }, poolId: string) {
      const ids: string[] = [];
      for (let i = 0; i < 5; i++) {
        const deposit = await depositRepository.create(poolId, MEMBER_ID, 1000 * (i + 1));
        ids.push(deposit.id);
        await new Promise((resolve) => setTimeout(resolve, 5));
      }
      // Newest first, matching getLedger's ordering.
      return ids.reverse();
    }

    it("paginates with a limit and stable nextCursor across pages", async () => {
      const { ledgerService, depositRepository, pool } = await makeService();
      const expectedOrder = await seedFive(depositRepository, pool.id);

      const page1 = await ledgerService.getLedger(pool.id, MEMBER_ID, { limit: 2 });
      expect(page1.entries.map((e) => e.id)).toEqual(expectedOrder.slice(0, 2));
      expect(page1.nextCursor).not.toBeNull();

      const page2 = await ledgerService.getLedger(pool.id, MEMBER_ID, {
        limit: 2,
        cursor: page1.nextCursor as string,
      });
      expect(page2.entries.map((e) => e.id)).toEqual(expectedOrder.slice(2, 4));
      expect(page2.nextCursor).not.toBeNull();

      const page3 = await ledgerService.getLedger(pool.id, MEMBER_ID, {
        limit: 2,
        cursor: page2.nextCursor as string,
      });
      expect(page3.entries.map((e) => e.id)).toEqual(expectedOrder.slice(4, 5));
      expect(page3.nextCursor).toBeNull();
    });

    it("returns a null nextCursor when a limit is given but everything fits on one page", async () => {
      const { ledgerService, depositRepository, pool } = await makeService();
      await depositRepository.create(pool.id, MEMBER_ID, 1000);

      const page = await ledgerService.getLedger(pool.id, MEMBER_ID, { limit: 10 });
      expect(page.entries).toHaveLength(1);
      expect(page.nextCursor).toBeNull();
    });

    it("rejects a malformed cursor", async () => {
      const { ledgerService, pool } = await makeService();
      await expect(
        ledgerService.getLedger(pool.id, MEMBER_ID, { cursor: "not-a-real-cursor" }),
      ).rejects.toThrow(InvalidLedgerCursorError);
    });
  });
});
