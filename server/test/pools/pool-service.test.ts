import { beforeEach, describe, expect, it } from "vitest";
import { PoolService } from "../../src/pools/pool-service.js";
import { InMemoryPoolRepository } from "../../src/pools/fakes/in-memory-pool-repository.js";
import {
  InvalidPerPersonAmountError,
  InvalidPoolNameError,
  MissingPerPersonAmountError,
  UnexpectedPerPersonAmountError,
} from "../../src/pools/types.js";

const ORGANIZER_ID = "user_1";

function makePoolService() {
  const poolRepository = new InMemoryPoolRepository();
  const poolService = new PoolService({ poolRepository });
  return { poolService, poolRepository };
}

describe("PoolService.createPool", () => {
  it("creates an Equal Split Pool with the organizer, ACTIVE state, and per-person amount", async () => {
    const { poolService } = makePoolService();

    const pool = await poolService.createPool(ORGANIZER_ID, {
      name: "Goa Trip",
      type: "EQUAL_SPLIT",
      perPersonAmountPaise: 100000,
    });

    expect(pool.name).toBe("Goa Trip");
    expect(pool.type).toBe("EQUAL_SPLIT");
    expect(pool.perPersonAmountPaise).toBe(100000);
    expect(pool.state).toBe("ACTIVE");
    expect(pool.organizerId).toBe(ORGANIZER_ID);
  });

  it("creates an Open Pool with no per-person amount", async () => {
    const { poolService } = makePoolService();

    const pool = await poolService.createPool(ORGANIZER_ID, {
      name: "Flat 3B Rent",
      type: "OPEN",
    });

    expect(pool.type).toBe("OPEN");
    expect(pool.perPersonAmountPaise).toBeNull();
    expect(pool.state).toBe("ACTIVE");
  });

  it("rejects a blank pool name", async () => {
    const { poolService } = makePoolService();

    await expect(
      poolService.createPool(ORGANIZER_ID, { name: "   ", type: "OPEN" }),
    ).rejects.toThrow(InvalidPoolNameError);
  });

  it("rejects an Equal Split Pool with no per-person amount", async () => {
    const { poolService } = makePoolService();

    await expect(
      poolService.createPool(ORGANIZER_ID, { name: "Goa Trip", type: "EQUAL_SPLIT" }),
    ).rejects.toThrow(MissingPerPersonAmountError);
  });

  it("rejects an Equal Split Pool with a zero or negative per-person amount", async () => {
    const { poolService } = makePoolService();

    await expect(
      poolService.createPool(ORGANIZER_ID, {
        name: "Goa Trip",
        type: "EQUAL_SPLIT",
        perPersonAmountPaise: 0,
      }),
    ).rejects.toThrow(InvalidPerPersonAmountError);

    await expect(
      poolService.createPool(ORGANIZER_ID, {
        name: "Goa Trip",
        type: "EQUAL_SPLIT",
        perPersonAmountPaise: -500,
      }),
    ).rejects.toThrow(InvalidPerPersonAmountError);
  });

  it("rejects a non-integer per-person amount", async () => {
    const { poolService } = makePoolService();

    await expect(
      poolService.createPool(ORGANIZER_ID, {
        name: "Goa Trip",
        type: "EQUAL_SPLIT",
        perPersonAmountPaise: 100.5,
      }),
    ).rejects.toThrow(InvalidPerPersonAmountError);
  });

  it("rejects an Open Pool that has a per-person amount", async () => {
    const { poolService } = makePoolService();

    await expect(
      poolService.createPool(ORGANIZER_ID, {
        name: "Flat 3B Rent",
        type: "OPEN",
        perPersonAmountPaise: 5000,
      }),
    ).rejects.toThrow(UnexpectedPerPersonAmountError);
  });
});
