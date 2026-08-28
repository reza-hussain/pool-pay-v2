import { NotPoolOrganizerError, type Pool, type PoolRepository } from "../pools/types.js";
import { expireIfLapsed } from "../pools/pool-expiry.js";
import { getPoolBalance } from "../pools/pool-balance.js";
import { getMemberBalance } from "../ledger/member-balance.js";
import type { InvitationRepository } from "../invitations/types.js";
import type { DepositRepository } from "../deposits/types.js";
import type { SpendAttributionRepository, SpendRepository } from "../spends/types.js";
import type { ReimbursementRepository } from "../reimbursements/types.js";
import type { PaymentProvider } from "../payments/types.js";
import type { UserRepository } from "../auth/types.js";
import { MemberHasNoRegisteredUpiIdError } from "../reimbursements/types.js";
import { type Refund, type RefundRepository } from "../closure/types.js";
import {
  CannotRemoveOrganizerError,
  InvalidJoinCodeError,
  MemberNotFoundError,
  PoolAwaitingPaymentError,
  PoolClosedError,
  PoolNotFoundError,
  TargetAlreadyOrganizerError,
  type Membership,
  type MembershipRepository,
} from "./types.js";

export interface MembershipServiceOptions {
  poolRepository: PoolRepository;
  membershipRepository: MembershipRepository;
  invitationRepository: InvitationRepository;
  depositRepository: DepositRepository;
  spendRepository: SpendRepository;
  spendAttributionRepository: SpendAttributionRepository;
  reimbursementRepository: ReimbursementRepository;
  refundRepository: RefundRepository;
  userRepository: UserRepository;
  paymentProvider: PaymentProvider;
}

export class MembershipService {
  private readonly poolRepository: PoolRepository;
  private readonly membershipRepository: MembershipRepository;
  private readonly invitationRepository: InvitationRepository;
  private readonly depositRepository: DepositRepository;
  private readonly spendRepository: SpendRepository;
  private readonly spendAttributionRepository: SpendAttributionRepository;
  private readonly reimbursementRepository: ReimbursementRepository;
  private readonly refundRepository: RefundRepository;
  private readonly userRepository: UserRepository;
  private readonly paymentProvider: PaymentProvider;

  constructor(options: MembershipServiceOptions) {
    this.poolRepository = options.poolRepository;
    this.membershipRepository = options.membershipRepository;
    this.invitationRepository = options.invitationRepository;
    this.depositRepository = options.depositRepository;
    this.spendRepository = options.spendRepository;
    this.spendAttributionRepository = options.spendAttributionRepository;
    this.reimbursementRepository = options.reimbursementRepository;
    this.refundRepository = options.refundRepository;
    this.userRepository = options.userRepository;
    this.paymentProvider = options.paymentProvider;
  }

  async joinByPoolId(userId: string, poolId: string): Promise<Membership> {
    const pool = await this.poolRepository.findById(poolId);
    if (!pool) {
      throw new PoolNotFoundError();
    }
    return this.join(userId, pool);
  }

  async joinByCode(userId: string, joinCode: string): Promise<Membership> {
    const pool = await this.poolRepository.findByJoinCode(joinCode);
    if (!pool) {
      throw new InvalidJoinCodeError();
    }
    return this.join(userId, pool);
  }

  async listMembers(poolId: string): Promise<Membership[]> {
    return this.membershipRepository.listByPool(poolId);
  }

  // Self-leave (ADR-0022/0023): any active, non-Organizer Member can remove
  // themselves, paid out at the computed default with no adjustment — a
  // departing Member adjusting their own refund would be a conflict of
  // interest, so unlike removeMember there's no adjustedAmountPaise here.
  async leaveSelf(poolId: string, userId: string): Promise<Refund | null> {
    const pool = await this.requireOpenPool(poolId);
    if (userId === pool.organizerId) {
      throw new CannotRemoveOrganizerError();
    }

    const membership = await this.membershipRepository.find(poolId, userId);
    if (!membership) {
      throw new MemberNotFoundError();
    }

    return this.payDepartureAndRemove(pool, userId, undefined);
  }

  // Mirrors ClosureService's previewClosure/closePool split: shows the
  // Organizer the computed default refund before it pays out, with no side
  // effects, so they get a chance to adjust it via removeMember's
  // adjustedAmountPaise before confirming.
  async previewDeparture(
    poolId: string,
    organizerUserId: string,
    memberId: string,
  ): Promise<{ amountPaise: number }> {
    const pool = await this.requireOrganizerOfOpenPool(poolId, organizerUserId);
    await this.requireActiveNonOrganizerMember(pool, memberId);

    const amountPaise = await this.computeDepartureDefault(poolId, memberId);
    return { amountPaise };
  }

  async removeMember(
    poolId: string,
    organizerUserId: string,
    memberId: string,
    adjustedAmountPaise?: number,
  ): Promise<Refund | null> {
    const pool = await this.requireOrganizerOfOpenPool(poolId, organizerUserId);
    await this.requireActiveNonOrganizerMember(pool, memberId);

    return this.payDepartureAndRemove(pool, memberId, adjustedAmountPaise);
  }

  // Organizer Transfer (ADR-0023): unilateral, no vote — the current
  // Organizer names another active Member as the new Organizer. Updates
  // Pool.organizerId and both Memberships' roles; the outgoing Organizer
  // becomes an ordinary Member rather than being removed.
  async transferOrganizer(
    poolId: string,
    currentOrganizerUserId: string,
    newOrganizerUserId: string,
  ): Promise<Pool> {
    const pool = await this.requireOrganizerOfOpenPool(poolId, currentOrganizerUserId);
    if (newOrganizerUserId === pool.organizerId) {
      throw new TargetAlreadyOrganizerError();
    }

    const targetMembership = await this.membershipRepository.find(poolId, newOrganizerUserId);
    if (!targetMembership) {
      throw new MemberNotFoundError();
    }

    await this.membershipRepository.updateRole(poolId, currentOrganizerUserId, "MEMBER");
    await this.membershipRepository.updateRole(poolId, newOrganizerUserId, "ORGANIZER");
    return this.poolRepository.updateOrganizer(poolId, newOrganizerUserId);
  }

  private async join(userId: string, pool: Pool): Promise<Membership> {
    if (pool.state === "CLOSED") {
      throw new PoolClosedError();
    }
    // Locked only stops deposits (see CONTEXT.md / ADR 0006) — joining a
    // Locked Pool is still allowed, only Closed is end-of-life.

    const existing = await this.membershipRepository.find(pool.id, userId);
    if (existing) {
      return existing;
    }

    pool = await expireIfLapsed(
      {
        poolRepository: this.poolRepository,
        invitationRepository: this.invitationRepository,
        membershipRepository: this.membershipRepository,
      },
      pool,
    );
    // "Does the Organizer have a Membership yet" is the single source of
    // truth for whether the Dashboard — and joining — is unlocked (ADR-0016,
    // ADR-0017). Covers both an unpaid-but-still-pending Pool and one that's
    // since lapsed to EXPIRED, since neither Organizer has a Membership.
    const organizerMembership = await this.membershipRepository.find(pool.id, pool.organizerId);
    if (!organizerMembership) {
      throw new PoolAwaitingPaymentError();
    }

    return this.membershipRepository.create(pool.id, userId, "MEMBER");
  }

  private async requireOpenPool(poolId: string): Promise<Pool> {
    const pool = await this.poolRepository.findById(poolId);
    if (!pool) {
      throw new PoolNotFoundError();
    }
    if (pool.state === "CLOSED") {
      throw new PoolClosedError();
    }
    return pool;
  }

  private async requireOrganizerOfOpenPool(poolId: string, userId: string): Promise<Pool> {
    const pool = await this.requireOpenPool(poolId);
    if (pool.organizerId !== userId) {
      throw new NotPoolOrganizerError();
    }
    return pool;
  }

  private async requireActiveNonOrganizerMember(pool: Pool, memberId: string): Promise<Membership> {
    if (memberId === pool.organizerId) {
      throw new CannotRemoveOrganizerError();
    }
    const membership = await this.membershipRepository.find(pool.id, memberId);
    if (!membership) {
      throw new MemberNotFoundError();
    }
    return membership;
  }

  // Your Remaining Balance (ADR-0022) at the moment of Departure, floored at
  // zero — a Member who has overspent their own Deposits (via Spend
  // Approval, e.g.) doesn't owe the Pool money on the way out, they just get
  // nothing back, the same way computeRefunds (ClosureService) filters out
  // non-positive balances entirely.
  private async computeDepartureDefault(poolId: string, memberId: string): Promise<number> {
    const balance = await getMemberBalance(
      { depositRepository: this.depositRepository, spendAttributionRepository: this.spendAttributionRepository },
      poolId,
      memberId,
    );
    return Math.max(0, balance);
  }

  // Shared by leaveSelf and removeMember: pays out the departing Member's
  // refund (computed default, or the Organizer's adjustedAmountPaise) and
  // removes their Membership. Capped at the Pool's actual cash on hand, the
  // same cash-shortfall guard Phase 1 applies at Closure — a manually
  // adjusted amount can't pay out more than the Pool actually holds. Skips
  // the transfer (and the Registered UPI ID check) entirely when there's
  // nothing to pay out, since a brand-new Member who never deposited
  // shouldn't be blocked from leaving just because a refund isn't possible.
  private async payDepartureAndRemove(
    pool: Pool,
    memberId: string,
    adjustedAmountPaise: number | undefined,
  ): Promise<Refund | null> {
    const [computedDefault, actualCashPaise] = await Promise.all([
      this.computeDepartureDefault(pool.id, memberId),
      getPoolBalance(
        {
          depositRepository: this.depositRepository,
          spendRepository: this.spendRepository,
          reimbursementRepository: this.reimbursementRepository,
          refundRepository: this.refundRepository,
        },
        pool.id,
      ),
    ]);

    const requestedAmountPaise = adjustedAmountPaise ?? computedDefault;
    const amountPaise = Math.max(0, Math.min(requestedAmountPaise, actualCashPaise));

    if (amountPaise <= 0) {
      await this.membershipRepository.remove(pool.id, memberId);
      return null;
    }

    const recipient = await this.userRepository.findById(memberId);
    if (!recipient?.upiId) {
      throw new MemberHasNoRegisteredUpiIdError();
    }

    await this.paymentProvider.initiateTransfer(pool.id, recipient.upiId, amountPaise);
    const refund = await this.refundRepository.create(pool.id, memberId, recipient.upiId, amountPaise);
    await this.membershipRepository.remove(pool.id, memberId);
    return refund;
  }
}
