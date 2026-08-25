import type { DepositRepository } from "../deposits/types.js";
import type { MembershipRepository } from "../memberships/types.js";
import { PoolNotFoundError } from "../memberships/types.js";
import type { PoolRepository } from "../pools/types.js";
import { getPoolBalance } from "../pools/pool-balance.js";
import type { SpendRepository } from "../spends/types.js";
import type { ReimbursementRepository } from "../reimbursements/types.js";
import type { RefundRepository } from "../closure/types.js";
import {
  NotAPoolMemberError,
  type LedgerEntry,
  type LedgerPage,
  type LedgerQuery,
} from "./types.js";

export interface LedgerServiceOptions {
  poolRepository: PoolRepository;
  membershipRepository: MembershipRepository;
  depositRepository: DepositRepository;
  spendRepository: SpendRepository;
  reimbursementRepository: ReimbursementRepository;
  refundRepository: RefundRepository;
}

const DEFAULT_LEDGER_LIMIT = 20;

// The "···1234" phone-suffix identity scheme (ADR-0018) used everywhere a
// Member is shown without a real name/profile system — search matches
// against this same suffix, not the full userId.
const PHONE_SUFFIX_LENGTH = 4;

interface LedgerCursorPosition {
  createdAt: Date;
  id: string;
}

export class LedgerService {
  private readonly poolRepository: PoolRepository;
  private readonly membershipRepository: MembershipRepository;
  private readonly depositRepository: DepositRepository;
  private readonly spendRepository: SpendRepository;
  private readonly reimbursementRepository: ReimbursementRepository;
  private readonly refundRepository: RefundRepository;

  constructor(options: LedgerServiceOptions) {
    this.poolRepository = options.poolRepository;
    this.membershipRepository = options.membershipRepository;
    this.depositRepository = options.depositRepository;
    this.spendRepository = options.spendRepository;
    this.reimbursementRepository = options.reimbursementRepository;
    this.refundRepository = options.refundRepository;
  }

  async getLedger(poolId: string, userId: string, query: LedgerQuery = {}): Promise<LedgerPage> {
    const pool = await this.poolRepository.findById(poolId);
    if (!pool) {
      throw new PoolNotFoundError();
    }

    const membership = await this.membershipRepository.find(poolId, userId);
    if (!membership) {
      throw new NotAPoolMemberError();
    }

    const [deposits, spends, reimbursements, refunds] = await Promise.all([
      this.depositRepository.listByPool(poolId),
      this.spendRepository.listByPool(poolId),
      this.reimbursementRepository.listByPool(poolId),
      this.refundRepository.listByPool(poolId),
    ]);

    const entries: LedgerEntry[] = [
      ...deposits.map(
        (deposit): LedgerEntry => ({
          id: deposit.id,
          type: "DEPOSIT",
          poolId,
          amountPaise: deposit.amountPaise,
          counterparty: deposit.userId,
          createdAt: deposit.createdAt,
        }),
      ),
      ...spends.map(
        (spend): LedgerEntry => ({
          id: spend.id,
          type: "SPEND",
          poolId,
          amountPaise: spend.amountPaise,
          feePaise: spend.feePaise,
          counterparty: spend.merchantRef,
          spendActorUserId: spend.userId,
          createdAt: spend.createdAt,
        }),
      ),
      ...reimbursements.map(
        (reimbursement): LedgerEntry => ({
          id: reimbursement.id,
          type: "REIMBURSEMENT",
          poolId,
          amountPaise: reimbursement.amountPaise,
          counterparty: reimbursement.memberId,
          createdAt: reimbursement.createdAt,
        }),
      ),
      ...refunds.map(
        (refund): LedgerEntry => ({
          id: refund.id,
          type: "REFUND",
          poolId,
          amountPaise: refund.amountPaise,
          counterparty: refund.memberId,
          createdAt: refund.createdAt,
        }),
      ),
    ];

    entries.sort(compareEntriesDesc);

    const filtered = entries.filter((entry) => matchesQuery(entry, query));

    const limit = query.limit && query.limit > 0 ? query.limit : DEFAULT_LEDGER_LIMIT;
    const startIndex = startIndexFor(filtered, query.cursor);

    const page = filtered.slice(startIndex, startIndex + limit);
    const hasMore = startIndex + limit < filtered.length;
    const nextCursor = hasMore ? encodeLedgerCursor(page[page.length - 1]) : null;

    return { entries: page, nextCursor };
  }

  // Backs Pool Detail's Total Balance card (ADR-0018) — same membership check
  // as getLedger above, since balance visibility follows the same full-ledger
  // transparency rule (ADR-0008).
  async getPoolBalance(poolId: string, userId: string): Promise<number> {
    const pool = await this.poolRepository.findById(poolId);
    if (!pool) {
      throw new PoolNotFoundError();
    }

    const membership = await this.membershipRepository.find(poolId, userId);
    if (!membership) {
      throw new NotAPoolMemberError();
    }

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
}

function phoneSuffix(userId: string): string {
  return userId.slice(-PHONE_SUFFIX_LENGTH);
}

function matchesQuery(entry: LedgerEntry, query: LedgerQuery): boolean {
  if (query.from && entry.createdAt < query.from) {
    return false;
  }
  if (query.to && entry.createdAt > query.to) {
    return false;
  }
  if (query.types && query.types.length > 0 && !query.types.includes(entry.type)) {
    return false;
  }
  // `counterparty` is a Member userId; for SPEND it holds a merchant
  // reference instead, so a SPEND entry never matches this filter (ADR-0018:
  // a Spend isn't attributable to one Member via counterparty).
  if (query.counterparty && entry.counterparty !== query.counterparty) {
    return false;
  }
  if (query.search && query.search.trim().length > 0) {
    const needle = query.search.trim().toLowerCase();
    const matchesCounterpartySuffix = phoneSuffix(entry.counterparty).toLowerCase().includes(needle);
    const matchesMerchantRef = entry.type === "SPEND" && entry.counterparty.toLowerCase().includes(needle);
    if (!matchesCounterpartySuffix && !matchesMerchantRef) {
      return false;
    }
  }
  return true;
}

// Newest first; ties (identical createdAt) broken by id so ordering — and
// therefore cursor pagination — is stable across repeated calls.
function compareEntriesDesc(a: LedgerCursorPosition, b: LedgerCursorPosition): number {
  const dateDiff = b.createdAt.getTime() - a.createdAt.getTime();
  if (dateDiff !== 0) {
    return dateDiff;
  }
  if (a.id === b.id) {
    return 0;
  }
  return a.id < b.id ? 1 : -1;
}

function startIndexFor(entries: LedgerEntry[], cursor: string | undefined): number {
  if (!cursor) {
    return 0;
  }

  const position = decodeLedgerCursor(cursor);
  if (!position) {
    return 0;
  }

  const index = entries.findIndex((entry) => compareEntriesDesc(entry, position) > 0);
  return index === -1 ? entries.length : index;
}

function encodeLedgerCursor(entry: LedgerCursorPosition): string {
  const payload = { createdAt: entry.createdAt.toISOString(), id: entry.id };
  return Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
}

function decodeLedgerCursor(cursor: string): LedgerCursorPosition | null {
  try {
    const payload = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8")) as {
      createdAt: string;
      id: string;
    };
    const createdAt = new Date(payload.createdAt);
    if (Number.isNaN(createdAt.getTime()) || typeof payload.id !== "string") {
      return null;
    }
    return { createdAt, id: payload.id };
  } catch {
    return null;
  }
}
