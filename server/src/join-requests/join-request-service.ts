import type { Pool, PoolRepository } from "../pools/types.js";
import { NotPoolOrganizerError } from "../pools/types.js";
import { PoolNotFoundError, type MembershipRepository } from "../memberships/types.js";
import type { UserRepository } from "../auth/types.js";
import type { NotificationService } from "../notifications/notification-service.js";
import {
  JoinRequestAlreadyDeclinedError,
  JoinRequestNotFoundError,
  JoinRequestNotPendingError,
  type JoinRequest,
  type JoinRequestRepository,
} from "./types.js";

export interface JoinRequestServiceOptions {
  joinRequestRepository: JoinRequestRepository;
  membershipRepository: MembershipRepository;
  poolRepository: PoolRepository;
  userRepository: UserRepository;
  notificationService: NotificationService;
}

// One JoinRequest enriched with the requester's identity — the Organizer's
// Pending requests view, same shape as InvitationService's SentInvitation.
export interface JoinRequestForOrganizer {
  joinRequest: JoinRequest;
  requesterName: string | null;
  requesterPhoneNumber: string;
}

export class JoinRequestService {
  private readonly joinRequestRepository: JoinRequestRepository;
  private readonly membershipRepository: MembershipRepository;
  private readonly poolRepository: PoolRepository;
  private readonly userRepository: UserRepository;
  private readonly notificationService: NotificationService;

  constructor(options: JoinRequestServiceOptions) {
    this.joinRequestRepository = options.joinRequestRepository;
    this.membershipRepository = options.membershipRepository;
    this.poolRepository = options.poolRepository;
    this.userRepository = options.userRepository;
    this.notificationService = options.notificationService;
  }

  // Called by MembershipService in place of creating a Membership directly,
  // whenever an Equal Split Pool is joined via Pool Code or Invite Link.
  async requestToJoin(pool: Pool, requesterUserId: string): Promise<JoinRequest> {
    const latest = await this.joinRequestRepository.findLatestByPoolAndRequester(pool.id, requesterUserId);
    // Re-submitting the same code/link while one is still outstanding is
    // idempotent — returns the existing request rather than creating a
    // second one.
    if (latest?.state === "PENDING") {
      return latest;
    }
    // A prior decline blocks an immediate re-request (ticket #86 AC) — no
    // path back to a fresh request exists yet.
    if (latest?.state === "REJECTED") {
      throw new JoinRequestAlreadyDeclinedError();
    }

    const joinRequest = await this.joinRequestRepository.create({
      poolId: pool.id,
      requesterUserId,
    });

    const requester = await this.userRepository.findById(requesterUserId);
    const requesterName = requester?.name ?? "Someone";
    await this.notificationService.notify({
      recipientUserIds: [pool.organizerId],
      poolId: pool.id,
      type: "JOIN_REQUEST_RECEIVED",
      message: `${requesterName} wants to join ${pool.name}`,
    });

    return joinRequest;
  }

  // The Organizer's "Pending requests" section on All Members.
  async listPendingRequests(organizerId: string, poolId: string): Promise<JoinRequestForOrganizer[]> {
    const pool = await this.poolRepository.findById(poolId);
    if (!pool) {
      throw new PoolNotFoundError();
    }
    if (pool.organizerId !== organizerId) {
      throw new NotPoolOrganizerError();
    }

    const pending = await this.joinRequestRepository.listPendingByPool(poolId);
    return Promise.all(
      pending.map(async (joinRequest) => {
        const requester = await this.userRepository.findById(joinRequest.requesterUserId);
        return {
          joinRequest,
          requesterName: requester?.name ?? null,
          requesterPhoneNumber: requester?.phoneNumber ?? "",
        };
      }),
    );
  }

  // Approving atomically creates the Membership before marking the request
  // decided — same ordering as DepositService.confirmDeposit's
  // Invitation->Membership conversion, so a crash between the two steps
  // leaves the request still PENDING (safe to retry) rather than losing the
  // Membership silently.
  async approve(organizerId: string, poolId: string, joinRequestId: string): Promise<JoinRequest> {
    const pool = await this.findPoolForOrganizer(organizerId, poolId);
    const joinRequest = await this.findPendingRequest(poolId, joinRequestId);

    await this.membershipRepository.create(poolId, joinRequest.requesterUserId, "MEMBER");
    const approved = await this.joinRequestRepository.approve(joinRequestId);

    await this.notificationService.notify({
      recipientUserIds: [joinRequest.requesterUserId],
      poolId,
      type: "JOIN_REQUEST_APPROVED",
      message: `Your request to join ${pool.name} was approved`,
    });

    return approved;
  }

  // No Membership, and no notification is sent (ticket #86 AC) — the
  // requester simply never hears back.
  async decline(organizerId: string, poolId: string, joinRequestId: string): Promise<JoinRequest> {
    await this.findPoolForOrganizer(organizerId, poolId);
    const joinRequest = await this.findPendingRequest(poolId, joinRequestId);

    return this.joinRequestRepository.reject(joinRequest.id);
  }

  private async findPoolForOrganizer(organizerId: string, poolId: string): Promise<Pool> {
    const pool = await this.poolRepository.findById(poolId);
    if (!pool) {
      throw new PoolNotFoundError();
    }
    if (pool.organizerId !== organizerId) {
      throw new NotPoolOrganizerError();
    }
    return pool;
  }

  private async findPendingRequest(poolId: string, joinRequestId: string): Promise<JoinRequest> {
    const joinRequest = await this.joinRequestRepository.findById(joinRequestId);
    if (!joinRequest || joinRequest.poolId !== poolId) {
      throw new JoinRequestNotFoundError();
    }
    if (joinRequest.state !== "PENDING") {
      throw new JoinRequestNotPendingError();
    }
    return joinRequest;
  }
}
