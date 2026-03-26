export interface AccessPolicyInput {
  score: number
  isInternal: boolean
  isTrial: boolean
  hasPaymentIssue: boolean
}

export function computeTrustTier(input: AccessPolicyInput): 'low' | 'medium' | 'high' {
  if (input.hasPaymentIssue) return 'low'
  if (input.score >= 80 && input.isInternal) return 'high'
  if (input.score >= 60 && !input.isTrial) return 'medium'
  return 'low'
}

export function canRunExpensiveChecks(input: AccessPolicyInput): boolean {
  const tier = computeTrustTier(input)
  return tier === 'high' || (tier === 'medium' && input.score >= 70)
}

export function shouldNotifyOps(input: AccessPolicyInput): boolean {
  return input.hasPaymentIssue || (!input.isInternal && input.score < 45)
}
