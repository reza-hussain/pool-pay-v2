import { beforeEach, describe, expect, it } from "vitest";
import { MembershipService } from "../../src/memberships/membership-service.js";
import { InMemoryMembershipRepository } from "../../src/memberships/fakes/in-memory-membership-repository.js";
import { InMemoryPoolRepository } from "../../src/pools/fakes/in-memory-pool-repository.js";
import {
  InvalidJoinCodeError,
  PoolClosedError,
  PoolNotFoundError,
} from "../../src/memberships/types.js";

const ORGANIZER_ID = "user_organizer";
const MEMBER_ID = "user_member";

async function makeService() {
  const poolRepository = new InMemoryPoolRepository();
  const membershipRepository = new InMemoryMembershipRepository();
  const membershipService = new MembershipService({ poolRepository, membershipRepository });

  const pool = await poolRepository.create(ORGANIZER_ID, {
    name: "Goa Trip",
    type: "OPEN",
    perPersonAmountPaise: null,
    joinCode: "123456",
  });

  return { membershipService, poolRepository, membershipRepository, pool };
}

describe("MembershipService.joinByPoolId", () => {
  it("creates a MEMBER membership for the joining user", async () => {
    const { membershipService, pool } = await makeService();

    const membership = await membershipService.joinByPoolId(MEMBER_ID, pool.id);

    expect(membership).toMatchObject({ poolId: pool.id, userId: MEMBER_ID, role: "MEMBER" });
  });

  it("throws PoolNotFoundError for an unknown pool id", async () => {
    const { membershipService } = await makeService();
    await expect(membershipService.joinByPoolId(MEMBER_ID, "does-not-exist")).rejects.toThrow(
      PoolNotFoundError,
    );
  });

  it("is idempotent — joining twice returns the same membership, no duplicate", async () => {
    const { membershipService, membershipRepository, pool } = await makeService();

    const first = await membershipService.joinByPoolId(MEMBER_ID, pool.id);
    const second = await membershipService.joinByPoolId(MEMBER_ID, pool.id);

    expect(second.id).toBe(first.id);
    const all = await membershipRepository.listByPool(pool.id);
    expect(all.filter((m) => m.userId === MEMBER_ID)).toHaveLength(1);
  });

  it("throws PoolClosedError when the Pool is closed", async () => {
    const { membershipService, poolRepository, pool } = await makeService();
    (await poolRepository.findById(pool.id))!.state = "CLOSED";

    await expect(membershipService.joinByPoolId(MEMBER_ID, pool.id)).rejects.toThrow(
      PoolClosedError,
    );
  });
});

describe("MembershipService.joinByCode", () => {
  it("resolves the Pool by its join code and creates a membership", async () => {
    const { membershipService, pool } = await makeService();

    const membership = await membershipService.joinByCode(MEMBER_ID, "123456");

    expect(membership).toMatchObject({ poolId: pool.id, userId: MEMBER_ID, role: "MEMBER" });
  });

  it("throws InvalidJoinCodeError for an unknown code", async () => {
    const { membershipService } = await makeService();
    await expect(membershipService.joinByCode(MEMBER_ID, "000000")).rejects.toThrow(
      InvalidJoinCodeError,
    );
  });
});

describe("MembershipService.listMembers", () => {
  it("lists every member of a Pool, including the Organizer", async () => {
    const { membershipService, membershipRepository, pool } = await makeService();
    await membershipRepository.create(pool.id, ORGANIZER_ID, "ORGANIZER");
    await membershipService.joinByPoolId(MEMBER_ID, pool.id);

    const members = await membershipService.listMembers(pool.id);

    expect(members).toHaveLength(2);
    expect(members.map((m) => m.userId).sort()).toEqual([MEMBER_ID, ORGANIZER_ID].sort());
  });
});
