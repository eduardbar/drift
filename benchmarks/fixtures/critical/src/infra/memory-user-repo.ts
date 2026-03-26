import type { User } from '../domain/entities.js'
import type { UserRepository } from '../app/user-service.js'

export class MemoryUserRepository implements UserRepository {
  private readonly users = new Map<string, User>()

  async findByEmail(email: string): Promise<User | undefined> {
    return this.users.get(email)
  }

  async save(user: User): Promise<void> {
    this.users.set(user.email, user)
  }
}
