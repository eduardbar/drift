import { UserService } from './app/user-service.js'
import { MemoryUserRepository } from './infra/memory-user-repo.js'

const service = new UserService(new MemoryUserRepository())

export async function runFixtureFlow(): Promise<boolean> {
  return service.canAccessFeature('Demo.User@example.com')
}

void runFixtureFlow()
