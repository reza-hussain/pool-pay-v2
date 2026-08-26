import type { DepositRepository } from "../deposits/types.js";
import type { MembershipRepository } from "../memberships/types.js";
import { PoolNotFoundError } from "../memberships/types.js";
import type { PoolRepository } from "../pools/types.js";
import type { SpendRepository } from "../spends/types.js";
import type { ReimbursementRepository } from "../reimbursements/types.js";
import type { RefundRepository } from "../closure/types.js";
import {
  InvalidLedgerCursorError,
  NotAPoolMemberError,
  type LedgerEntry,
  type LedgerPage,
  type LedgerQueryOptions,
} from "./types.js";

export interface LedgerServiceOptions {
  poolRepository: PoolRepository;
  membershipRepository: MembershipRepository;
  depositRepository: DepositRepository;
  spendRepository: SpendRepository;
  reimbursementRepository: ReimbursementRepository;
  refundRepository: RefundRepository;
}

// Descending by createdAt, then descending by id as a deterministic
// tie-breaker — needed so cursor pagination has a stable total order even
// when several entries share the same createdAt.
function compareEntries(a: LedgerEntry, b: LedgerEntry): number {
  const byDate = b.createdAt.getTime() - a.createdAt.getTime();
  if (byDate !== 0) {
    return byDate;
  }
  if (a.id === b.id) {
    return 0;
  }
  return a.id > b.id ? -1 : 1;
}

interface LedgerCursor {
  createdAtMs: number;
  id: string;
}

function encodeCursor(entry: LedgerEntry): string {
  const cursor: LedgerCursor = { createdAtMs: entry.createdAt.getTime(), id: entry.id };
  return Buffer.from(JSON.stringify(cursor), "utf8").toString("base64url");
}

function decodeCursor(cursor: string): LedgerCursor {
  try {
    const parsed = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8")) as unknown;
    if (
      typeof parsed !== "object" ||
      parsed === null ||
      typeof (parsed as LedgerCursor).createdAtMs !== "number" ||
      typeof (parsed as LedgerCursor).id !== "string"
    ) {
      throw new Error("malformed cursor payload");
    }
    return parsed as LedgerCursor;
  } catch {
    throw new InvalidLedgerCursorError();
  }
}

// `entry.counterparty` doubles as the "phone-suffix" identity used
// throughout the app (userId's last 4 characters — see MembersScreen,
// ReimburseScreen). For SPEND it already holds the merchant reference
// rather than a userId, so it has no meaningful suffix — search falls back
// to matching the full merchantRef there instead.
function matchesSearch(entry: LedgerEntry, term: string): boolean {
  const suffix = entry.counterparty.slice(-4).toLowerCase();
  if (suffix.includes(term)) {
    return true;
  }
  return entry.type === "SPEND" && entry.counterparty.toLowerCase().includes(term);
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

  async getLedger(poolId: string, userId: string, options: LedgerQueryOptions = {}): Promise<LedgerPage> {
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
          actor: spend.userId,
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

    const searchTerm = options.search?.trim().toLowerCase();
    const filtered = entries.filter((entry) => {
      if (options.from && entry.createdAt.getTime() < options.from.getTime()) {
        return false;
      }
      if (options.to && entry.createdAt.getTime() > options.to.getTime()) {
        return false;
      }
      if (options.types && options.types.length > 0 && !options.types.includes(entry.type)) {
        return false;
      }
      if (options.counterparty && entry.counterparty !== options.counterparty) {
        return false;
      }
      if (searchTerm && !matchesSearch(entry, searchTerm)) {
        return false;
      }
      return true;
    });

    filtered.sort(compareEntries);

    let page = filtered;
    if (options.cursor) {
      const cursor = decodeCursor(options.cursor);
      const cursorIndex = filtered.findIndex(
        (entry) => entry.id === cursor.id && entry.createdAt.getTime() === cursor.createdAtMs,
      );
      page = cursorIndex === -1 ? [] : filtered.slice(cursorIndex + 1);
    }

    if (options.limit === undefined) {
      return { entries: page, nextCursor: null };
    }

    const pageEntries = page.slice(0, options.limit);
    const hasMore = page.length > options.limit;
    return {
      entries: pageEntries,
      nextCursor: hasMore ? encodeCursor(pageEntries[pageEntries.length - 1]) : null,
    };
  }
}
