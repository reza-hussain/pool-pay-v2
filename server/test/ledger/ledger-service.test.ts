import { describe, expect, it } from "vitest";
import { LedgerService } from "../../src/ledger/ledger-service.js";
import { NotAPoolMemberError } from "../../src/ledger/types.js";
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

  it("exposes the Spend's actor separately from its merchant-reference counterparty", async () => {
    const { ledgerService, spendRepository, pool } = await makeService();
    await spendRepository.create(pool.id, ORGANIZER_ID, "merchant@upi", 30000, 300);

    const { entries } = await ledgerService.getLedger(pool.id, MEMBER_ID);
    expect(entries[0]).toMatchObject({
      type: "SPEND",
      counterparty: "merchant@upi",
      spendActorUserId: ORGANIZER_ID,
    });
  });

  it("leaves spendActorUserId unset for non-SPEND entries", async () => {
    const { ledgerService, depositRepository, pool } = await makeService();
    await depositRepository.create(pool.id, MEMBER_ID, 10000);

    const { entries } = await ledgerService.getLedger(pool.id, MEMBER_ID);
    expect(entries[0].spendActorUserId).toBeUndefined();
  });

  describe("date-range filtering", () => {
    it("filters out entries created before `from`", async () => {
      const { ledgerService, depositRepository, pool } = await makeService();
      const early = await depositRepository.create(pool.id, MEMBER_ID, 10000);
      await new Promise((resolve) => setTimeout(resolve, 5));
      const cutoff = new Date();
      await new Promise((resolve) => setTimeout(resolve, 5));
      const late = await depositRepository.create(pool.id, MEMBER_ID, 20000);

      const { entries } = await ledgerService.getLedger(pool.id, MEMBER_ID, { from: cutoff });
      expect(entries.map((e) => e.id)).toEqual([late.id]);
      expect(entries.map((e) => e.id)).not.toContain(early.id);
    });

    it("filters out entries created after `to`", async () => {
      const { ledgerService, depositRepository, pool } = await makeService();
      const early = await depositRepository.create(pool.id, MEMBER_ID, 10000);
      await new Promise((resolve) => setTimeout(resolve, 5));
      const cutoff = new Date();
      await new Promise((resolve) => setTimeout(resolve, 5));
      await depositRepository.create(pool.id, MEMBER_ID, 20000);

      const { entries } = await ledgerService.getLedger(pool.id, MEMBER_ID, { to: cutoff });
      expect(entries.map((e) => e.id)).toEqual([early.id]);
    });
  });

  describe("search", () => {
    it("matches a Deposit's counterparty by phone-suffix", async () => {
      const { ledgerService, depositRepository, pool } = await makeService();
      await depositRepository.create(pool.id, MEMBER_ID, 10000);
      const suffix = MEMBER_ID.slice(-4);

      const { entries } = await ledgerService.getLedger(pool.id, MEMBER_ID, { search: suffix });
      expect(entries).toHaveLength(1);

      const { entries: noMatch } = await ledgerService.getLedger(pool.id, MEMBER_ID, {
        search: "zzzz",
      });
      expect(noMatch).toHaveLength(0);
    });

    it("does not match a Spend by its actor's phone-suffix (only Deposits/Reimbursements/Refunds match by counterparty phone-suffix)", async () => {
      const { ledgerService, spendRepository, pool } = await makeService();
      await spendRepository.create(pool.id, ORGANIZER_ID, "merchant@upi", 30000, 300);
      const suffix = ORGANIZER_ID.slice(-4);

      const { entries } = await ledgerService.getLedger(pool.id, MEMBER_ID, { search: suffix });
      expect(entries).toHaveLength(0);
    });

    it("matches a Spend by merchantRef", async () => {
      const { ledgerService, spendRepository, pool } = await makeService();
      await spendRepository.create(pool.id, ORGANIZER_ID, "campground@upi", 30000, 300);

      const { entries } = await ledgerService.getLedger(pool.id, MEMBER_ID, {
        search: "campground",
      });
      expect(entries).toHaveLength(1);
      expect(entries[0].type).toBe("SPEND");
    });

    it("is case-insensitive", async () => {
      const { ledgerService, spendRepository, pool } = await makeService();
      await spendRepository.create(pool.id, ORGANIZER_ID, "Campground@upi", 30000, 300);

      const { entries } = await ledgerService.getLedger(pool.id, MEMBER_ID, {
        search: "CAMPGROUND",
      });
      expect(entries).toHaveLength(1);
    });
  });

  describe("counterparty filtering", () => {
    it("filters to entries whose counterparty is the given Member's userId", async () => {
      const { ledgerService, depositRepository, reimbursementRepository, pool } = await makeService();
      await depositRepository.create(pool.id, MEMBER_ID, 10000);
      await reimbursementRepository.create(pool.id, ORGANIZER_ID, "organizer@upi", 5000);

      const { entries } = await ledgerService.getLedger(pool.id, MEMBER_ID, {
        counterparty: ORGANIZER_ID,
      });
      expect(entries).toHaveLength(1);
      expect(entries[0].type).toBe("REIMBURSEMENT");
    });

    it("never matches a Spend — a Spend's counterparty is a merchant reference, not a Member userId (ADR-0018)", async () => {
      const { ledgerService, spendRepository, pool } = await makeService();
      await spendRepository.create(pool.id, ORGANIZER_ID, "merchant@upi", 30000, 300);

      const { entries } = await ledgerService.getLedger(pool.id, MEMBER_ID, {
        counterparty: ORGANIZER_ID,
      });
      expect(entries).toHaveLength(0);
    });
  });

  describe("types filtering", () => {
    it("filters to only the requested entry types", async () => {
      const { ledgerService, depositRepository, spendRepository, pool } = await makeService();
      await depositRepository.create(pool.id, MEMBER_ID, 10000);
      await spendRepository.create(pool.id, ORGANIZER_ID, "merchant@upi", 30000, 300);

      const { entries } = await ledgerService.getLedger(pool.id, MEMBER_ID, {
        types: ["SPEND"],
      });
      expect(entries).toHaveLength(1);
      expect(entries[0].type).toBe("SPEND");
    });

    it("filters to a multi-type subset", async () => {
      const { ledgerService, depositRepository, spendRepository, reimbursementRepository, refundRepository, pool } =
        await makeService();
      await depositRepository.create(pool.id, MEMBER_ID, 10000);
      await spendRepository.create(pool.id, ORGANIZER_ID, "merchant@upi", 30000, 300);
      await reimbursementRepository.create(pool.id, MEMBER_ID, "member@upi", 20000);
      await refundRepository.create(pool.id, MEMBER_ID, "member@fakebank", 10000);

      const { entries } = await ledgerService.getLedger(pool.id, MEMBER_ID, {
        types: ["DEPOSIT", "REFUND"],
      });
      expect(entries.map((e) => e.type).sort()).toEqual(["DEPOSIT", "REFUND"]);
    });
  });

  describe("pagination", () => {
    async function seedFive(depositRepository: InMemoryDepositRepository, poolId: string) {
      const created = [];
      for (let i = 0; i < 5; i += 1) {
        created.push(await depositRepository.create(poolId, MEMBER_ID, 1000 * (i + 1)));
        await new Promise((resolve) => setTimeout(resolve, 2));
      }
      // Newest first, matching getLedger's ordering.
      return created.reverse();
    }

    it("limits the page size and returns a nextCursor when more entries remain", async () => {
      const { ledgerService, depositRepository, pool } = await makeService();
      const created = await seedFive(depositRepository, pool.id);

      const { entries, nextCursor } = await ledgerService.getLedger(pool.id, MEMBER_ID, {
        limit: 2,
      });

      expect(entries.map((e) => e.id)).toEqual([created[0].id, created[1].id]);
      expect(nextCursor).not.toBeNull();
    });

    it("returns null nextCursor on the last page", async () => {
      const { ledgerService, depositRepository, pool } = await makeService();
      await seedFive(depositRepository, pool.id);

      const { nextCursor } = await ledgerService.getLedger(pool.id, MEMBER_ID, { limit: 100 });
      expect(nextCursor).toBeNull();
    });

    it("walks through all pages via cursor with stable ordering and no duplicates or gaps", async () => {
      const { ledgerService, depositRepository, pool } = await makeService();
      const created = await seedFive(depositRepository, pool.id);

      const collected = [];
      let cursor: string | undefined;
      for (let i = 0; i < 10; i += 1) {
        const page = await ledgerService.getLedger(pool.id, MEMBER_ID, { limit: 2, cursor });
        collected.push(...page.entries);
        if (!page.nextCursor) break;
        cursor = page.nextCursor;
      }

      expect(collected.map((e) => e.id)).toEqual(created.map((e) => e.id));
    });
  });
});

describe("LedgerService.getPoolBalance", () => {
  it("nets Deposits, Spends, Reimbursements, and Refunds", async () => {
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

    const balancePaise = await ledgerService.getPoolBalance(pool.id, MEMBER_ID);
    // Spend's sumByPool includes its feePaise, on top of the 30000 principal.
    expect(balancePaise).toBe(100000 - 30000 - 300 - 20000 - 10000);
  });

  it("is visible to the Organizer too", async () => {
    const { ledgerService, depositRepository, pool } = await makeService();
    await depositRepository.create(pool.id, MEMBER_ID, 10000);

    await expect(ledgerService.getPoolBalance(pool.id, ORGANIZER_ID)).resolves.toBe(10000);
  });

  it("rejects a non-Member", async () => {
    const { ledgerService, pool } = await makeService();
    await expect(ledgerService.getPoolBalance(pool.id, STRANGER_ID)).rejects.toThrow(
      NotAPoolMemberError,
    );
  });

  it("rejects an unknown Pool", async () => {
    const { ledgerService } = await makeService();
    await expect(ledgerService.getPoolBalance("does-not-exist", MEMBER_ID)).rejects.toThrow(
      PoolNotFoundError,
    );
  });
});
