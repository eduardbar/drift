import { SourceFile } from 'ts-morph'
import type { DriftIssue } from '../types.js'
import { hasIgnoreComment } from './shared.js'

const TRIVIAL_COMMENT_PATTERNS = [
  { comment: /\/\/\s*return\b/i, code: /^\s*return\b/ },
  { comment: /\/\/\s*(increment|increase|add\s+1|plus\s+1)\b/i, code: /\+\+|(\+= ?1)\b/ },
  { comment: /\/\/\s*(decrement|decrease|subtract\s+1|minus\s+1)\b/i, code: /--|(-= ?1)\b/ },
  { comment: /\/\/\s*log\b/i, code: /console\.(log|warn|error)/ },
  { comment: /\/\/\s*(set|assign)\b/i, code: /^\s*\w[\w.[\]]*\s*=(?!=)/ },
  { comment: /\/\/\s*call\b/i, code: /^\s*\w[\w.]*\(/ },
  { comment: /\/\/\s*(declare|define|create|initialize)\b/i, code: /^\s*(const|let|var)\b/ },
  { comment: /\/\/\s*check\s+if\b/i, code: /^\s*if\s*\(/ },
  { comment: /\/\/\s*(loop|iterate|for each|foreach)\b/i, code: /^\s*(for|while)\b/ },
  { comment: /\/\/\s*import\b/i, code: /^\s*import\b/ },
]

const SNIPPET_TRUNCATE = 60

function checkLineForContradiction(
  commentLine: string,
  nextLine: string,
  lineNumber: number,
  file: SourceFile,
): DriftIssue | null {
  for (const { comment, code } of TRIVIAL_COMMENT_PATTERNS) {
    if (comment.test(commentLine) && code.test(nextLine)) {
      if (hasIgnoreComment(file, lineNumber)) return null
      return {
        rule: 'comment-contradiction',
        severity: 'warning',
        message: `Comment restates what the code already says. AI documents the obvious instead of the why.`,
        line: lineNumber,
        column: 1,
        snippet: `${commentLine.slice(0, SNIPPET_TRUNCATE)}\n${nextLine.trim().slice(0, SNIPPET_TRUNCATE)}`,
      }
    }
  }
  return null
}

export function detectCommentContradiction(file: SourceFile): DriftIssue[] {
  const issues: DriftIssue[] = []
  const lines = file.getFullText().split('\n')

  for (let i = 0; i < lines.length - 1; i++) {
    const commentLine = lines[i].trim()
    const nextLine = lines[i + 1]
    const issue = checkLineForContradiction(commentLine, nextLine, i + 1, file)
    if (issue) {
      issues.push(issue)
    }
  }

  return issues
}
