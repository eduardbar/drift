import { canAccessBilling, normalizeEmail, type User } from '../domain/entities.js'

export interface UserRepository {
  findByEmail(email: string): Promise<User | undefined>
  save(user: User): Promise<void>
}

export class UserService {
  constructor(private readonly repo: UserRepository) {}

  async ensureUser(email: string): Promise<User> {
    const normalizedEmail = normalizeEmail(email)
    const existing = await this.repo.findByEmail(normalizedEmail)
    if (existing) return existing

    const created: User = {
      id: `u-${normalizedEmail}`,
      email: normalizedEmail,
      active: true,
    }

    await this.repo.save(created)
    return created
  }

  async canAccessFeature(email: string): Promise<boolean> {
    const user = await this.ensureUser(email)
    return canAccessBilling(user)
  }
}
