import { describe, expect, it } from "vitest";
import { getMemberBalance, getMemberBalances } from "../../src/ledger/member-balance.js";
import { InMemoryDepositRepository } from "../../src/deposits/fakes/in-memory-deposit-repository.js";
import { InMemorySpendAttributionRepository } from "../../src/spends/fakes/in-memory-spend-attribution-repository.js";

const POOL_ID = "pool_1";
const MEMBER_A = "user_a";
const MEMBER_B = "user_b";

function makeRepos() {
  const depositRepository = new InMemoryDepositRepository();
  const spendAttributionRepository = new InMemorySpendAttributionRepository();
  return { depositRepository, spendAttributionRepository };
}

describe("getMemberBalance", () => {
  it("is a Member's total Deposits minus their attributed Spend share", async () => {
    const repos = makeRepos();
    await repos.depositRepository.create(POOL_ID, MEMBER_A, 100000);
    await repos.spendAttributionRepository.createForSpend("spend_1", POOL_ID, [
      { memberId: MEMBER_A, amountPaise: 30000 },
    ]);

    await expect(getMemberBalance(repos, POOL_ID, MEMBER_A)).resolves.toBe(70000);
  });

  it("is zero for a Member with no Deposits or attributions", async () => {
    const repos = makeRepos();

    await expect(getMemberBalance(repos, POOL_ID, MEMBER_A)).resolves.toBe(0);
  });

  it("sums across multiple Deposits and attributions for the same Member", async () => {
    const repos = makeRepos();
    await repos.depositRepository.create(POOL_ID, MEMBER_A, 50000);
    await repos.depositRepository.create(POOL_ID, MEMBER_A, 20000);
    await repos.spendAttributionRepository.createForSpend("spend_1", POOL_ID, [
      { memberId: MEMBER_A, amountPaise: 10000 },
    ]);
    await repos.spendAttributionRepository.createForSpend("spend_2", POOL_ID, [
      { memberId: MEMBER_A, amountPaise: 5000 },
    ]);

    await expect(getMemberBalance(repos, POOL_ID, MEMBER_A)).resolves.toBe(55000);
  });

  it("ignores another Member's Deposits and attributions", async () => {
    const repos = makeRepos();
    await repos.depositRepository.create(POOL_ID, MEMBER_A, 100000);
    await repos.depositRepository.create(POOL_ID, MEMBER_B, 999999);
    await repos.spendAttributionRepository.createForSpend("spend_1", POOL_ID, [
      { memberId: MEMBER_B, amountPaise: 500000 },
    ]);

    await expect(getMemberBalance(repos, POOL_ID, MEMBER_A)).resolves.toBe(100000);
  });

  it("ignores another Pool's Deposits and attributions", async () => {
    const repos = makeRepos();
    await repos.depositRepository.create("other_pool", MEMBER_A, 999999);
    await repos.spendAttributionRepository.createForSpend("spend_1", "other_pool", [
      { memberId: MEMBER_A, amountPaise: 500000 },
    ]);

    await expect(getMemberBalance(repos, POOL_ID, MEMBER_A)).resolves.toBe(0);
  });
});

describe("getMemberBalances", () => {
  it("returns a balance per Member who has any Deposit or attribution", async () => {
    const repos = makeRepos();
    await repos.depositRepository.create(POOL_ID, MEMBER_A, 60000);
    await repos.depositRepository.create(POOL_ID, MEMBER_B, 40000);
    await repos.spendAttributionRepository.createForSpend("spend_1", POOL_ID, [
      { memberId: MEMBER_A, amountPaise: 10000 },
      { memberId: MEMBER_B, amountPaise: 10000 },
    ]);

    const balances = await getMemberBalances(repos, POOL_ID);

    expect(balances.get(MEMBER_A)).toBe(50000);
    expect(balances.get(MEMBER_B)).toBe(30000);
  });

  it("includes a Member with attributions but no Deposits (treated as zero deposited)", async () => {
    // Shouldn't happen in practice (a Spend attribution implies the Member
    // was active), but the map shouldn't silently drop them if it did.
    const repos = makeRepos();
    await repos.spendAttributionRepository.createForSpend("spend_1", POOL_ID, [
      { memberId: MEMBER_A, amountPaise: 5000 },
    ]);

    const balances = await getMemberBalances(repos, POOL_ID);

    expect(balances.get(MEMBER_A)).toBe(-5000);
  });

  it("returns an empty map for a Pool with no Deposits or attributions", async () => {
    const repos = makeRepos();

    const balances = await getMemberBalances(repos, POOL_ID);

    expect(balances.size).toBe(0);
  });
});
