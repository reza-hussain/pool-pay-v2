import { beforeEach, describe, expect, it } from "vitest";
import { MembershipService } from "../../src/memberships/membership-service.js";
import { InMemoryMembershipRepository } from "../../src/memberships/fakes/in-memory-membership-repository.js";
import { InMemoryPoolRepository } from "../../src/pools/fakes/in-memory-pool-repository.js";
import {
  CannotRemoveOrganizerError,
  InvalidJoinCodeError,
  MemberNotFoundError,
  PoolClosedError,
  PoolNotFoundError,
} from "../../src/memberships/types.js";
import { NotPoolOrganizerError } from "../../src/pools/types.js";

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

describe("MembershipService.removeMember", () => {
  it("removes a Member so they no longer appear as a Member", async () => {
    const { membershipService, pool } = await makeService();
    await membershipService.joinByPoolId(MEMBER_ID, pool.id);

    await membershipService.removeMember(pool.id, ORGANIZER_ID, MEMBER_ID);

    const members = await membershipService.listMembers(pool.id);
    expect(members.map((m) => m.userId)).not.toContain(MEMBER_ID);
  });

  it("allows the removed Member to rejoin later", async () => {
    const { membershipService, pool } = await makeService();
    await membershipService.joinByPoolId(MEMBER_ID, pool.id);
    await membershipService.removeMember(pool.id, ORGANIZER_ID, MEMBER_ID);

    const rejoined = await membershipService.joinByPoolId(MEMBER_ID, pool.id);

    expect(rejoined).toMatchObject({ poolId: pool.id, userId: MEMBER_ID });
    expect(await membershipService.listMembers(pool.id)).toHaveLength(1);
  });

  it("rejects removal by a non-Organizer", async () => {
    const { membershipService, pool } = await makeService();
    await membershipService.joinByPoolId(MEMBER_ID, pool.id);

    await expect(
      membershipService.removeMember(pool.id, MEMBER_ID, MEMBER_ID),
    ).rejects.toThrow(NotPoolOrganizerError);
  });

  it("rejects the Organizer removing themselves", async () => {
    const { membershipService, pool } = await makeService();

    await expect(
      membershipService.removeMember(pool.id, ORGANIZER_ID, ORGANIZER_ID),
    ).rejects.toThrow(CannotRemoveOrganizerError);
  });

  it("rejects removing someone who isn't a Member", async () => {
    const { membershipService, pool } = await makeService();

    await expect(
      membershipService.removeMember(pool.id, ORGANIZER_ID, "user_stranger"),
    ).rejects.toThrow(MemberNotFoundError);
  });

  it("rejects removal from an unknown Pool", async () => {
    const { membershipService } = await makeService();

    await expect(
      membershipService.removeMember("does-not-exist", ORGANIZER_ID, MEMBER_ID),
    ).rejects.toThrow(PoolNotFoundError);
  });

  it("rejects removal from an already-Closed Pool", async () => {
    const { membershipService, poolRepository, pool } = await makeService();
    await membershipService.joinByPoolId(MEMBER_ID, pool.id);
    await poolRepository.updateState(pool.id, "CLOSED");

    await expect(
      membershipService.removeMember(pool.id, ORGANIZER_ID, MEMBER_ID),
    ).rejects.toThrow(PoolClosedError);
  });
});
