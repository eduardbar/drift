// drift-ignore-file

import kleur from 'kleur'
import type { DriftIssue } from './types.js'

interface Grade {
  badge: string
  label: string
}

export function scoreToGrade(score: number): Grade {
  if (score === 0) return { badge: kleur.green('CLEAN'), label: 'clean' }
  if (score < 20) return { badge: kleur.green('LOW'), label: 'low' }
  if (score < 45) return { badge: kleur.yellow('MODERATE'), label: 'moderate' }
  if (score < 70) return { badge: kleur.red('HIGH'), label: 'high' }
  return { badge: kleur.bold().red('CRITICAL'), label: 'critical' }
}

export function scoreToGradeText(score: number): Grade {
  if (score === 0) return { badge: '✦ CLEAN', label: 'clean' }
  if (score < 20) return { badge: '◎ LOW', label: 'low' }
  if (score < 45) return { badge: '◈ MODERATE', label: 'moderate' }
  if (score < 70) return { badge: '◉ HIGH', label: 'high' }
  return { badge: '⬡ CRITICAL', label: 'critical' }
}

export function severityIcon(s: DriftIssue['severity']): string {
  if (s === 'error') return '✖'
  if (s === 'warning') return '▲'
  return '◦'
}

export function scoreBar(score: number, width = 20): string {
  const filled = Math.round((score / 100) * width)
  const empty = width - filled
  return '█'.repeat(filled) + '░'.repeat(empty)
}
