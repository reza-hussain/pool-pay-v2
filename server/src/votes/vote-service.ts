import { PoolClosedError, PoolNotFoundError } from "../memberships/types.js";
import type { MembershipRepository } from "../memberships/types.js";
import type { PoolRepository } from "../pools/types.js";
import type { ClosureResult, ClosureService } from "../closure/closure-service.js";
import {
  AlreadyVotedError,
  NotAPoolMemberError,
  OrganizerCannotVoteError,
  type RefundVote,
  type RefundVoteRepository,
  type VoteStatus,
} from "./types.js";

export interface CastVoteResult {
  vote: RefundVote;
  status: VoteStatus;
  // Set only when this vote was the one that reached a majority and
  // triggered an immediate Closure (ADR 0009).
  closure: ClosureResult | null;
}

export interface VoteServiceOptions {
  poolRepository: PoolRepository;
  membershipRepository: MembershipRepository;
  refundVoteRepository: RefundVoteRepository;
  closureService: ClosureService;
}

export class VoteService {
  private readonly poolRepository: PoolRepository;
  private readonly membershipRepository: MembershipRepository;
  private readonly refundVoteRepository: RefundVoteRepository;
  private readonly closureService: ClosureService;

  constructor(options: VoteServiceOptions) {
    this.poolRepository = options.poolRepository;
    this.membershipRepository = options.membershipRepository;
    this.refundVoteRepository = options.refundVoteRepository;
    this.closureService = options.closureService;
  }

  async castVote(poolId: string, userId: string): Promise<CastVoteResult> {
    const pool = await this.poolRepository.findById(poolId);
    if (!pool) {
      throw new PoolNotFoundError();
    }
    if (pool.state === "CLOSED") {
      throw new PoolClosedError();
    }

    const membership = await this.membershipRepository.find(poolId, userId);
    if (!membership) {
      throw new NotAPoolMemberError();
    }
    if (membership.role === "ORGANIZER") {
      throw new OrganizerCannotVoteError();
    }

    const existingVote = await this.refundVoteRepository.find(poolId, userId);
    if (existingVote) {
      throw new AlreadyVotedError();
    }

    const vote = await this.refundVoteRepository.create(poolId, userId);
    const tally = await this.tally(poolId);

    // Simple majority (>50%) of non-Organizer Members (ADR 0009) — one Member
    // one vote, never weighted by contribution size.
    let closure: ClosureResult | null = null;
    if (tally.eligibleVoterCount > 0 && tally.votesCast * 2 > tally.eligibleVoterCount) {
      closure = await this.closureService.closePoolViaVote(poolId);
    }

    return {
      vote,
      status: {
        poolState: closure ? "CLOSED" : tally.poolState,
        eligibleVoterCount: tally.eligibleVoterCount,
        votesCast: tally.votesCast,
        hasVoted: true,
      },
      closure,
    };
  }

  async getVoteStatus(poolId: string, userId: string): Promise<VoteStatus> {
    const pool = await this.poolRepository.findById(poolId);
    if (!pool) {
      throw new PoolNotFoundError();
    }
    const membership = await this.membershipRepository.find(poolId, userId);
    if (!membership) {
      throw new NotAPoolMemberError();
    }
    const tally = await this.tally(poolId);
    const existingVote = await this.refundVoteRepository.find(poolId, userId);

    return { ...tally, hasVoted: existingVote !== null };
  }

  private async tally(poolId: string): Promise<{
    poolState: string;
    eligibleVoterCount: number;
    votesCast: number;
  }> {
    const pool = await this.poolRepository.findById(poolId);
    if (!pool) {
      throw new PoolNotFoundError();
    }
    const [memberships, votes] = await Promise.all([
      this.membershipRepository.listByPool(poolId),
      this.refundVoteRepository.listByPool(poolId),
    ]);
    const eligibleVoterCount = memberships.filter((m) => m.role !== "ORGANIZER").length;

    return {
      poolState: pool.state,
      eligibleVoterCount,
      votesCast: votes.length,
    };
  }
}
