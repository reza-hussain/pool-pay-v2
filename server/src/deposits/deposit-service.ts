import { PoolNotFoundError } from "../memberships/types.js";
import type { MembershipRepository, MembershipRole } from "../memberships/types.js";
import { getPoolBalance } from "../pools/pool-balance.js";
import type { Pool, PoolRepository } from "../pools/types.js";
import type { DepositIntent, PaymentProvider } from "../payments/types.js";
import type { SpendRepository } from "../spends/types.js";
import type { ReimbursementRepository } from "../reimbursements/types.js";
import type { RefundRepository } from "../closure/types.js";
import { UserNotFoundError, type UserRepository } from "../auth/types.js";
import { formatRupees } from "../lib/format-money.js";
import type { NotificationService } from "../notifications/notification-service.js";
import {
  InvitationAmountMismatchError,
  InvitationNotFoundError,
  type Invitation,
  type InvitationRepository,
} from "../invitations/types.js";
import {
  InvalidDepositAmountError,
  NotAMemberError,
  OpenPoolDepositsRetiredError,
  PoolNotAcceptingDepositsError,
  UnknownDepositReferenceError,
  type ContributionSummary,
  type Deposit,
  type DepositRepository,
  type PendingDepositRepository,
} from "./types.js";

export interface DepositServiceOptions {
  poolRepository: PoolRepository;
  membershipRepository: MembershipRepository;
  depositRepository: DepositRepository;
  pendingDepositRepository: PendingDepositRepository;
  // Needed so getPoolBalance reflects money spent/transferred out, not just
  // deposited — "Pool balance" is one concept even though Deposits, Spends,
  // Reimbursements, and Refunds are recorded by separate services/repositories.
  spendRepository: SpendRepository;
  reimbursementRepository: ReimbursementRepository;
  refundRepository: RefundRepository;
  paymentProvider: PaymentProvider;
  // Needed to look up the requesting Member's phone number for
  // paymentProvider.createDepositIntent — Cashfree's Orders API requires a
  // real customer phone per order.
  userRepository: UserRepository;
  notificationService: NotificationService;
  // Custom Split Pools (ADR 0016) source the fixed deposit amount from the
  // caller's own pending Invitation rather than Pool.perPersonAmountPaise,
  // and confirming that deposit is what creates their Membership.
  invitationRepository: InvitationRepository;
}

export class DepositService {
  private readonly poolRepository: PoolRepository;
  private readonly membershipRepository: MembershipRepository;
  private readonly depositRepository: DepositRepository;
  private readonly pendingDepositRepository: PendingDepositRepository;
  private readonly spendRepository: SpendRepository;
  private readonly reimbursementRepository: ReimbursementRepository;
  private readonly refundRepository: RefundRepository;
  private readonly paymentProvider: PaymentProvider;
  private readonly userRepository: UserRepository;
  private readonly notificationService: NotificationService;
  private readonly invitationRepository: InvitationRepository;

  constructor(options: DepositServiceOptions) {
    this.poolRepository = options.poolRepository;
    this.membershipRepository = options.membershipRepository;
    this.depositRepository = options.depositRepository;
    this.pendingDepositRepository = options.pendingDepositRepository;
    this.spendRepository = options.spendRepository;
    this.reimbursementRepository = options.reimbursementRepository;
    this.refundRepository = options.refundRepository;
    this.paymentProvider = options.paymentProvider;
    this.userRepository = options.userRepository;
    this.notificationService = options.notificationService;
    this.invitationRepository = options.invitationRepository;
  }

  async createDepositIntent(poolId: string, userId: string): Promise<DepositIntent> {
    const pool = await this.poolRepository.findById(poolId);
    if (!pool) {
      throw new PoolNotFoundError();
    }
    if (pool.type === "OPEN") {
      throw new OpenPoolDepositsRetiredError();
    }

    let fixedAmountPaise: number | null;
    if (pool.type === "EQUAL_SPLIT") {
      fixedAmountPaise = pool.perPersonAmountPaise;
    } else {
      // CUSTOM_SPLIT — the fixed amount comes from the caller's own
      // Invitation, not the Pool — Pool.perPersonAmountPaise stays null for
      // CUSTOM_SPLIT (ADR 0016).
      const invitation = await this.invitationRepository.findPendingByPoolAndInvitee(poolId, userId);
      if (!invitation) {
        throw new InvitationNotFoundError();
      }
      fixedAmountPaise = invitation.assignedAmountPaise;
    }

    const user = await this.userRepository.findById(userId);
    if (!user) {
      throw new UserNotFoundError();
    }
    const intent = await this.paymentProvider.createDepositIntent(pool.id, fixedAmountPaise, user.phoneNumber);
    // Recorded before any money moves, so a later confirmation — self-report
    // or webhook, whichever arrives first (see confirmDeposit) — can be
    // attributed back to this Member without trusting the confirming party.
    await this.pendingDepositRepository.create(intent.id, poolId, userId);
    return intent;
  }

  // The one path that actually credits a Deposit — called by both the
  // client's self-report and the Payment Provider's webhook (ticket #15),
  // keyed by providerRef (DepositIntent.id) so whichever confirms first
  // wins and a repeat confirmation is a no-op rather than a double-credit.
  // `expected` lets the self-report router scope a confirmation to the
  // caller's own pool/session; the webhook (server-to-server, already
  // trusted) omits it.
  async confirmDeposit(
    providerRef: string,
    amountPaise: number,
    expected?: { poolId?: string; userId?: string },
  ): Promise<Deposit> {
    if (!Number.isInteger(amountPaise) || amountPaise <= 0) {
      throw new InvalidDepositAmountError();
    }

    const pending = await this.pendingDepositRepository.findByProviderRef(providerRef);
    if (
      !pending ||
      (expected?.poolId && pending.poolId !== expected.poolId) ||
      (expected?.userId && pending.userId !== expected.userId)
    ) {
      throw new UnknownDepositReferenceError();
    }

    if (pending.consumedAt) {
      const existing = await this.depositRepository.findById(pending.resultingDepositId!);
      if (existing) {
        return existing;
      }
    }

    const pool = await this.poolRepository.findById(pending.poolId);
    if (!pool) {
      throw new PoolNotFoundError();
    }
    if (pool.state !== "ACTIVE") {
      throw new PoolNotAcceptingDepositsError();
    }

    // For CUSTOM_SPLIT, this confirmation is what creates the Membership
    // (ADR 0016) — there's deliberately no existing-Membership precondition
    // to check going in, unlike every other Pool type.
    let newMemberRole: MembershipRole | null = null;
    let invitationToMarkPaid: Invitation | null = null;
    if (pool.type === "CUSTOM_SPLIT") {
      const invitation = await this.invitationRepository.findPendingByPoolAndInvitee(
        pending.poolId,
        pending.userId,
      );
      if (!invitation) {
        throw new InvitationNotFoundError();
      }
      // Exact match only — a shortfall or overage is rejected outright, not
      // recorded (unlike Equal Split's unenforced amount).
      if (amountPaise !== invitation.assignedAmountPaise) {
        throw new InvitationAmountMismatchError();
      }
      newMemberRole = pending.userId === pool.organizerId ? "ORGANIZER" : "MEMBER";
      invitationToMarkPaid = invitation;
    } else {
      const membership = await this.membershipRepository.find(pending.poolId, pending.userId);
      if (!membership) {
        throw new NotAMemberError();
      }
    }

    const deposit = await this.depositRepository.create(pending.poolId, pending.userId, amountPaise);
    await this.pendingDepositRepository.markConsumed(providerRef, deposit.id);

    if (newMemberRole) {
      await this.membershipRepository.create(pending.poolId, pending.userId, newMemberRole);
      await this.invitationRepository.markPaid(invitationToMarkPaid!.id);
    }

    await this.notifyDeposit(pool, deposit);
    return deposit;
  }

  private async notifyDeposit(pool: Pool, deposit: Deposit): Promise<void> {
    const [members, depositor] = await Promise.all([
      this.membershipRepository.listByPool(pool.id),
      this.userRepository.findById(deposit.userId),
    ]);
    const otherMemberIds = members
      .map((member) => member.userId)
      .filter((userId) => userId !== deposit.userId);
    if (otherMemberIds.length === 0) {
      return;
    }

    const depositorName = depositor?.name ?? "Member";
    await this.notificationService.notify({
      recipientUserIds: otherMemberIds,
      poolId: pool.id,
      type: "DEPOSIT_RECEIVED",
      message: `${depositorName} deposited ${formatRupees(deposit.amountPaise)} into ${pool.name}`,
    });

    if (pool.type === "EQUAL_SPLIT" && pool.perPersonAmountPaise) {
      const targetPaise = pool.perPersonAmountPaise * members.length;
      const balanceAfterPaise = await this.getPoolBalance(pool.id);
      const balanceBeforePaise = balanceAfterPaise - deposit.amountPaise;
      const justCrossedTarget = balanceBeforePaise < targetPaise && balanceAfterPaise >= targetPaise;
      if (justCrossedTarget) {
        await this.notificationService.notify({
          recipientUserIds: otherMemberIds,
          poolId: pool.id,
          type: "POOL_FULLY_FUNDED",
          message: `${pool.name} is fully funded`,
        });
      }
    }
  }

  async getPoolBalance(poolId: string): Promise<number> {
    return getPoolBalance(
      {
        depositRepository: this.depositRepository,
        spendRepository: this.spendRepository,
        reimbursementRepository: this.reimbursementRepository,
        refundRepository: this.refundRepository,
      },
      poolId,
    );
  }

  async getContributionSummary(poolId: string, userId: string): Promise<ContributionSummary> {
    const pool = await this.poolRepository.findById(poolId);
    if (!pool) {
      throw new PoolNotFoundError();
    }

    const contributedPaise = await this.depositRepository.sumByPoolAndUser(poolId, userId);
    const expectedPaise = pool.type === "EQUAL_SPLIT" ? pool.perPersonAmountPaise : null;

    return {
      contributedPaise,
      expectedPaise,
      shortfallPaise: expectedPaise !== null ? expectedPaise - contributedPaise : null,
    };
  }
}
