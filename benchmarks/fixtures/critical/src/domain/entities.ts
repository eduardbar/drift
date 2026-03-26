export type UserId = string

export interface User {
  id: UserId
  email: string
  active: boolean
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase()
}

export function isCompanyEmail(email: string): boolean {
  return normalizeEmail(email).endsWith('@example.com')
}

export function canAccessBilling(user: User): boolean {
  return user.active && isCompanyEmail(user.email)
}
