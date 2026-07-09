import { describe, expect, it } from "vitest";
import { LedgerService } from "../../src/ledger/ledger-service.js";
import { NotAPoolMemberError } from "../../src/ledger/types.js";
import { InMemoryPoolRepository } from "../../src/pools/fakes/in-memory-pool-repository.js";
import { InMemoryMembershipRepository } from "../../src/memberships/fakes/in-memory-membership-repository.js";
import { InMemoryDepositRepository } from "../../src/deposits/fakes/in-memory-deposit-repository.js";
import { InMemorySpendRepository } from "../../src/spends/fakes/in-memory-spend-repository.js";
import { InMemoryReimbursementRepository } from "../../src/reimbursements/fakes/in-memory-reimbursement-repository.js";
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
  const ledgerService = new LedgerService({
    poolRepository,
    membershipRepository,
    depositRepository,
    spendRepository,
    reimbursementRepository,
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
    pool,
  };
}

describe("LedgerService.getLedger", () => {
  it("merges Deposits, Spends, and Reimbursements into one chronological list", async () => {
    const { ledgerService, depositRepository, spendRepository, reimbursementRepository, pool } =
      await makeService();

    await depositRepository.create(pool.id, MEMBER_ID, 100000);
    await spendRepository.create(pool.id, ORGANIZER_ID, "merchant@upi", 30000, 300);
    await reimbursementRepository.create(pool.id, MEMBER_ID, "member@upi", 20000);

    const entries = await ledgerService.getLedger(pool.id, MEMBER_ID);

    expect(entries).toHaveLength(3);
    expect(entries.map((e) => e.type).sort()).toEqual(["DEPOSIT", "REIMBURSEMENT", "SPEND"]);
  });

  it("shows the depositing Member as the counterparty for a Deposit", async () => {
    const { ledgerService, depositRepository, pool } = await makeService();
    await depositRepository.create(pool.id, MEMBER_ID, 100000);

    const [entry] = await ledgerService.getLedger(pool.id, MEMBER_ID);
    expect(entry).toMatchObject({ type: "DEPOSIT", amountPaise: 100000, counterparty: MEMBER_ID });
  });

  it("shows the merchant reference and separate fee for a Spend", async () => {
    const { ledgerService, spendRepository, pool } = await makeService();
    await spendRepository.create(pool.id, ORGANIZER_ID, "merchant@upi", 30000, 300);

    const [entry] = await ledgerService.getLedger(pool.id, MEMBER_ID);
    expect(entry).toMatchObject({
      type: "SPEND",
      amountPaise: 30000,
      feePaise: 300,
      counterparty: "merchant@upi",
    });
  });

  it("shows the reimbursed Member as the counterparty for a Reimbursement", async () => {
    const { ledgerService, reimbursementRepository, pool } = await makeService();
    await reimbursementRepository.create(pool.id, MEMBER_ID, "member@upi", 20000);

    const [entry] = await ledgerService.getLedger(pool.id, MEMBER_ID);
    expect(entry).toMatchObject({
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

    const entries = await ledgerService.getLedger(pool.id, MEMBER_ID);
    expect(entries[0].id).toBe(second.id);
    expect(entries[1].id).toBe(first.id);
  });

  it("is visible to the Organizer too", async () => {
    const { ledgerService, depositRepository, pool } = await makeService();
    await depositRepository.create(pool.id, MEMBER_ID, 10000);

    await expect(ledgerService.getLedger(pool.id, ORGANIZER_ID)).resolves.toHaveLength(1);
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
});
