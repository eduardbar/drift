import { SourceFile, SyntaxKind } from 'ts-morph'
import type { DriftIssue } from '../types.js'

export function detectPromiseStyleMix(file: SourceFile): DriftIssue[] {
  const text = file.getFullText()

  const hasThen = file.getDescendantsOfKind(SyntaxKind.PropertyAccessExpression).some((node) => {
    const name = node.getName()
    return name === 'then' || name === 'catch'
  })

  const hasAsync =
    file.getDescendantsOfKind(SyntaxKind.AsyncKeyword).length > 0 ||
    /\bawait\b/.test(text)

  if (hasThen && hasAsync) {
    return [
      {
        rule: 'promise-style-mix',
        severity: 'warning',
        message: `File mixes async/await with .then()/.catch(). AI generates both styles without picking one.`,
        line: 1,
        column: 1,
        snippet: `// mixed promise styles detected`,
      },
    ]
  }
  return []
}
