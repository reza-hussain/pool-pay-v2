import type { CompleteProfileInput, User, UserRepository } from "../types.js";

let nextId = 1;

export class InMemoryUserRepository implements UserRepository {
  private byPhoneNumber = new Map<string, User>();
  private byId = new Map<string, User>();

  async findByPhoneNumber(phoneNumber: string): Promise<User | null> {
    return this.byPhoneNumber.get(phoneNumber) ?? null;
  }

  async findById(id: string): Promise<User | null> {
    return this.byId.get(id) ?? null;
  }

  async create(phoneNumber: string): Promise<User> {
    const user: User = {
      id: `user_${nextId++}`,
      phoneNumber,
      createdAt: new Date(),
      isVerified: false,
      isSubscribed: false,
      name: null,
      email: null,
      dateOfBirth: null,
      upiId: null,
      avatarUrl: null,
      isOnboarded: false,
    };
    this.byPhoneNumber.set(phoneNumber, user);
    this.byId.set(user.id, user);
    return user;
  }

  async markFullyVerified(id: string): Promise<User> {
    const user = this.byId.get(id);
    if (!user) {
      throw new Error(`User ${id} not found`);
    }
    user.isVerified = true;
    return user;
  }

  async subscribe(id: string): Promise<User> {
    const user = this.byId.get(id);
    if (!user) {
      throw new Error(`User ${id} not found`);
    }
    user.isSubscribed = true;
    return user;
  }

  async completeProfile(id: string, profile: CompleteProfileInput): Promise<User> {
    const user = this.byId.get(id);
    if (!user) {
      throw new Error(`User ${id} not found`);
    }
    Object.assign(user, profile, { isOnboarded: true });
    return user;
  }

  // Test-only: most tests authenticate with a fabricated bearer token (an
  // arbitrary userId, no real signup) rather than going through OTP verify.
  // Lets those tests seed a verified User at that exact id so
  // PoolService.createPool's verification check has something to find.
  // `overrides` lets tests seed a Registered UPI ID directly (e.g. for
  // ClosureService/ReimbursementService tests) without a full Onboarding pass.
  seedVerifiedUser(
    id: string,
    phoneNumber = `+91${id}`,
    overrides?: Partial<Pick<User, "name" | "email" | "dateOfBirth" | "upiId" | "isOnboarded">>,
  ): User {
    const user: User = {
      id,
      phoneNumber,
      createdAt: new Date(),
      isVerified: true,
      isSubscribed: false,
      name: null,
      email: null,
      dateOfBirth: null,
      upiId: null,
      avatarUrl: null,
      isOnboarded: false,
      ...overrides,
    };
    this.byId.set(id, user);
    this.byPhoneNumber.set(phoneNumber, user);
    return user;
  }
}
