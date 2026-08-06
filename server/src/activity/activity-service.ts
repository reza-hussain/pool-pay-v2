import type { DepositRepository } from "../deposits/types.js";
import type { RefundRepository } from "../closure/types.js";
import type { MembershipRepository } from "../memberships/types.js";
import type { PoolRepository } from "../pools/types.js";
import type { UserRepository } from "../auth/types.js";
import type { ActivityEntry } from "./types.js";

export interface ActivityServiceOptions {
  membershipRepository: MembershipRepository;
  poolRepository: PoolRepository;
  depositRepository: DepositRepository;
  refundRepository: RefundRepository;
  userRepository: UserRepository;
}

export class ActivityService {
  private readonly membershipRepository: MembershipRepository;
  private readonly poolRepository: PoolRepository;
  private readonly depositRepository: DepositRepository;
  private readonly refundRepository: RefundRepository;
  private readonly userRepository: UserRepository;

  constructor(options: ActivityServiceOptions) {
    this.membershipRepository = options.membershipRepository;
    this.poolRepository = options.poolRepository;
    this.depositRepository = options.depositRepository;
    this.refundRepository = options.refundRepository;
    this.userRepository = options.userRepository;
  }

  async getActivity(userId: string): Promise<ActivityEntry[]> {
    // listByUser already treats a removed Membership as absent (see
    // MembershipRepository), so a removed Pool's entries drop out on their own.
    const memberships = await this.membershipRepository.listByUser(userId);
    const entriesByPool = await Promise.all(
      memberships.map((membership) => this.entriesForPool(membership.poolId)),
    );

    return entriesByPool
      .flat()
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }

  private async entriesForPool(poolId: string): Promise<ActivityEntry[]> {
    const pool = await this.poolRepository.findById(poolId);
    if (!pool) {
      return [];
    }

    const [deposits, refunds] = await Promise.all([
      this.depositRepository.listByPool(poolId),
      this.refundRepository.listByPool(poolId),
    ]);

    const counterpartyIds = new Set([
      ...deposits.map((deposit) => deposit.userId),
      ...refunds.map((refund) => refund.memberId),
    ]);
    const counterparties = await Promise.all(
      [...counterpartyIds].map((id) => this.userRepository.findById(id)),
    );
    const nameById = new Map(
      counterparties
        .filter((user): user is NonNullable<typeof user> => user !== null)
        .map((user) => [user.id, user.name ?? "Member"]),
    );

    return [
      ...deposits.map(
        (deposit): ActivityEntry => ({
          id: deposit.id,
          type: "DEPOSIT",
          poolId,
          poolName: pool.name,
          amountPaise: deposit.amountPaise,
          counterpartyName: nameById.get(deposit.userId) ?? "Member",
          createdAt: deposit.createdAt,
        }),
      ),
      ...refunds.map(
        (refund): ActivityEntry => ({
          id: refund.id,
          type: "REFUND",
          poolId,
          poolName: pool.name,
          amountPaise: refund.amountPaise,
          counterpartyName: nameById.get(refund.memberId) ?? "Member",
          createdAt: refund.createdAt,
        }),
      ),
    ];
  }
}
