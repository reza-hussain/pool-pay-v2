export interface RefundVote {
  id: string;
  poolId: string;
  userId: string;
  createdAt: Date;
}

export interface RefundVoteRepository {
  create(poolId: string, userId: string): Promise<RefundVote>;
  find(poolId: string, userId: string): Promise<RefundVote | null>;
  listByPool(poolId: string): Promise<RefundVote[]>;
}

export interface VoteStatus {
  poolState: string;
  eligibleVoterCount: number;
  votesCast: number;
  hasVoted: boolean;
}

export class OrganizerCannotVoteError extends Error {
  constructor() {
    super("The Organizer cannot vote to force a refund");
    this.name = "OrganizerCannotVoteError";
  }
}

export class NotAPoolMemberError extends Error {
  constructor() {
    super("You must be a Member of this Pool to vote");
    this.name = "NotAPoolMemberError";
  }
}

export class AlreadyVotedError extends Error {
  constructor() {
    super("You've already voted to refund this Pool");
    this.name = "AlreadyVotedError";
  }
}
