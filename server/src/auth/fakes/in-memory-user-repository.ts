import type { User, UserRepository } from "../types.js";

let nextId = 1;

export class InMemoryUserRepository implements UserRepository {
  private byPhoneNumber = new Map<string, User>();

  async findByPhoneNumber(phoneNumber: string): Promise<User | null> {
    return this.byPhoneNumber.get(phoneNumber) ?? null;
  }

  async create(phoneNumber: string): Promise<User> {
    const user: User = {
      id: `user_${nextId++}`,
      phoneNumber,
      createdAt: new Date(),
    };
    this.byPhoneNumber.set(phoneNumber, user);
    return user;
  }
}
