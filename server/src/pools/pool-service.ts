import {
  InvalidPerPersonAmountError,
  InvalidPoolNameError,
  MissingPerPersonAmountError,
  UnexpectedPerPersonAmountError,
  type CreatePoolInput,
  type Pool,
  type PoolRepository,
} from "./types.js";

export interface PoolServiceOptions {
  poolRepository: PoolRepository;
}

export class PoolService {
  private readonly poolRepository: PoolRepository;

  constructor(options: PoolServiceOptions) {
    this.poolRepository = options.poolRepository;
  }

  async createPool(organizerId: string, input: CreatePoolInput): Promise<Pool> {
    const name = input.name.trim();
    if (!name) {
      throw new InvalidPoolNameError();
    }

    if (input.type === "EQUAL_SPLIT") {
      if (input.perPersonAmountPaise === undefined) {
        throw new MissingPerPersonAmountError();
      }
      if (
        !Number.isInteger(input.perPersonAmountPaise) ||
        input.perPersonAmountPaise <= 0
      ) {
        throw new InvalidPerPersonAmountError();
      }
      return this.poolRepository.create(organizerId, {
        name,
        type: "EQUAL_SPLIT",
        perPersonAmountPaise: input.perPersonAmountPaise,
      });
    }

    if (input.perPersonAmountPaise !== undefined) {
      throw new UnexpectedPerPersonAmountError();
    }
    return this.poolRepository.create(organizerId, {
      name,
      type: "OPEN",
      perPersonAmountPaise: null,
    });
  }
}
