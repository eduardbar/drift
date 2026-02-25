// drift-ignore-file
import * as fs from 'node:fs'
import * as path from 'node:path'
import type { SourceFile } from 'ts-morph'
import type { FileReport, DriftConfig, BlameAttribution, DriftBlameReport } from '../types.js'
import { assertGitRepo, execGit, analyzeFilePath } from './helpers.js'
import { buildReport } from '../reporter.js'
import { RULE_WEIGHTS } from '../analyzer.js'

interface GitBlameEntry {
  hash: string
  author: string
  email: string
  line: string
}

function parseGitBlame(blameOutput: string): GitBlameEntry[] {
  const entries: GitBlameEntry[] = []
  const lines = blameOutput.split('\n')
  let i = 0

  while (i < lines.length) {
    const headerLine = lines[i]
    if (!headerLine || headerLine.trim() === '') { i++; continue }

    // Porcelain blame format: first line is "<hash> <orig-line> <final-line> [<num-lines>]"
    const headerMatch = headerLine.match(/^([0-9a-f]{40})\s/)
    if (!headerMatch) { i++; continue }

    const hash = headerMatch[1]!
    let author = ''
    let email = ''
    let codeLine = ''
    i++

    while (i < lines.length && !lines[i]!.match(/^[0-9a-f]{40}\s/)) {
      const l = lines[i]!
      if (l.startsWith('author ')) author = l.slice(7).trim()
      else if (l.startsWith('author-mail ')) email = l.slice(12).replace(/[<>]/g, '').trim()
      else if (l.startsWith('\t')) codeLine = l.slice(1)
      i++
    }

    entries.push({ hash, author, email, line: codeLine })
  }

  return entries
}

export class BlameAnalyzer {
  private readonly projectPath: string
  private readonly config: DriftConfig | undefined
  private readonly analyzeProjectFn: (targetPath: string, config?: DriftConfig) => FileReport[]
  private readonly analyzeFileFn: (sf: SourceFile) => FileReport

  constructor(
    projectPath: string,
    analyzeProjectFn: (targetPath: string, config?: DriftConfig) => FileReport[],
    analyzeFileFn: (sf: SourceFile) => FileReport,
    config?: DriftConfig,
  ) {
    this.projectPath = projectPath
    this.analyzeProjectFn = analyzeProjectFn
    this.analyzeFileFn = analyzeFileFn
    this.config = config
  }

  /** Blame a single file: returns per-author attribution. */
  static async analyzeFileBlame(
    filePath: string,
    analyzeFileFn: (sf: SourceFile) => FileReport,
  ): Promise<BlameAttribution[]> {
    const dir = path.dirname(filePath)
    assertGitRepo(dir)

    const blameOutput = execGit(`git blame --porcelain "${filePath}"`, dir)
    const entries = parseGitBlame(blameOutput)

    // Analyse issues in the file
    const report = analyzeFilePath(filePath, analyzeFileFn)

    // Map line numbers of issues to authors
    const issuesByLine = new Map<number, number>()
    for (const issue of report.issues) {
      issuesByLine.set(issue.line, (issuesByLine.get(issue.line) ?? 0) + 1)
    }

    // Aggregate by author
    const byAuthor = new Map<string, BlameAttribution>()
    entries.forEach((entry, idx) => {
      const key = entry.email || entry.author
      if (!byAuthor.has(key)) {
        byAuthor.set(key, {
          author: entry.author,
          email: entry.email,
          commits: 0,
          linesChanged: 0,
          issuesIntroduced: 0,
          avgScoreImpact: 0,
        })
      }
      const attr = byAuthor.get(key)!
      attr.linesChanged++
      const lineNum = idx + 1
      if (issuesByLine.has(lineNum)) {
        attr.issuesIntroduced += issuesByLine.get(lineNum)!
      }
    })

    // Count unique commits per author
    const commitsByAuthor = new Map<string, Set<string>>()
    for (const entry of entries) {
      const key = entry.email || entry.author
      if (!commitsByAuthor.has(key)) commitsByAuthor.set(key, new Set())
      commitsByAuthor.get(key)!.add(entry.hash)
    }

    const total = entries.length || 1
    const results: BlameAttribution[] = []
    for (const [key, attr] of byAuthor) {
      attr.commits = commitsByAuthor.get(key)?.size ?? 0
      attr.avgScoreImpact = (attr.linesChanged / total) * report.score
      results.push(attr)
    }

    return results.sort((a, b) => b.issuesIntroduced - a.issuesIntroduced)
  }

  /** Blame for a specific rule across all files in targetPath. */
  static async analyzeRuleBlame(
    rule: string,
    targetPath: string,
    analyzeFileFn: (sf: SourceFile) => FileReport,
  ): Promise<BlameAttribution[]> {
    assertGitRepo(targetPath)

    const tsFiles = fs
      .readdirSync(targetPath, { recursive: true, encoding: 'utf8' })
      .filter((f): f is string => (f.endsWith('.ts') || f.endsWith('.tsx') || f.endsWith('.js') || f.endsWith('.jsx')) && !f.includes('node_modules') && !f.endsWith('.d.ts'))
      .map(f => path.join(targetPath, f))
      

    const combined = new Map<string, BlameAttribution>()
    const commitsByAuthor = new Map<string, Set<string>>()

    for (const file of tsFiles) {
      let blameEntries: GitBlameEntry[] = []
      try {
        const blameOutput = execGit(`git blame --porcelain "${file}"`, targetPath)
        blameEntries = parseGitBlame(blameOutput)
      } catch { continue }

      const report = analyzeFilePath(file, analyzeFileFn)
      const issuesByLine = new Map<number, number>()
      for (const issue of report.issues) {
        issuesByLine.set(issue.line, (issuesByLine.get(issue.line) ?? 0) + 1)
      }

      blameEntries.forEach((entry, idx) => {
        const key = entry.email || entry.author
        if (!combined.has(key)) {
          combined.set(key, {
            author: entry.author,
            email: entry.email,
            commits: 0,
            linesChanged: 0,
            issuesIntroduced: 0,
            avgScoreImpact: 0,
          })
          commitsByAuthor.set(key, new Set())
        }
        const attr = combined.get(key)!
        attr.linesChanged++
        commitsByAuthor.get(key)!.add(entry.hash)
        const lineNum = idx + 1
        if (issuesByLine.has(lineNum)) {
          attr.issuesIntroduced += issuesByLine.get(lineNum)!
          attr.avgScoreImpact += report.score * (1 / (blameEntries.length || 1))
        }
      })
    }

    for (const [key, attr] of combined) {
      attr.commits = commitsByAuthor.get(key)?.size ?? 0
    }

    return Array.from(combined.values()).sort((a, b) => b.issuesIntroduced - a.issuesIntroduced)
  }

  /** Overall blame across all files and rules. */
  static async analyzeOverallBlame(
    targetPath: string,
    analyzeFileFn: (sf: SourceFile) => FileReport,
  ): Promise<BlameAttribution[]> {
    assertGitRepo(targetPath)

    const tsFiles = fs
      .readdirSync(targetPath, { recursive: true, encoding: 'utf8' })
      .filter((f): f is string => (f.endsWith('.ts') || f.endsWith('.tsx') || f.endsWith('.js') || f.endsWith('.jsx')) && !f.includes('node_modules') && !f.endsWith('.d.ts'))
      .map(f => path.join(targetPath, f))

    const combined = new Map<string, BlameAttribution>()
    const commitsByAuthor = new Map<string, Set<string>>()

    for (const file of tsFiles) {
      let blameEntries: GitBlameEntry[] = []
      try {
        const blameOutput = execGit(`git blame --porcelain "${file}"`, targetPath)
        blameEntries = parseGitBlame(blameOutput)
      } catch { continue }

      const report = analyzeFilePath(file, analyzeFileFn)
      const issuesByLine = new Map<number, number>()
      for (const issue of report.issues) {
        issuesByLine.set(issue.line, (issuesByLine.get(issue.line) ?? 0) + 1)
      }

      blameEntries.forEach((entry, idx) => {
        const key = entry.email || entry.author
        if (!combined.has(key)) {
          combined.set(key, {
            author: entry.author,
            email: entry.email,
            commits: 0,
            linesChanged: 0,
            issuesIntroduced: 0,
            avgScoreImpact: 0,
          })
          commitsByAuthor.set(key, new Set())
        }
        const attr = combined.get(key)!
        attr.linesChanged++
        commitsByAuthor.get(key)!.add(entry.hash)
        const lineNum = idx + 1
        if (issuesByLine.has(lineNum)) {
          attr.issuesIntroduced += issuesByLine.get(lineNum)!
          attr.avgScoreImpact += report.score * (1 / (blameEntries.length || 1))
        }
      })
    }

    for (const [key, attr] of combined) {
      attr.commits = commitsByAuthor.get(key)?.size ?? 0
    }

    return Array.from(combined.values()).sort((a, b) => b.issuesIntroduced - a.issuesIntroduced)
  }

  // --- Instance method -------------------------------------------------------

  async analyzeBlame(options: {
    target?: 'file' | 'rule' | 'overall'
    top?: number
    filePath?: string
    rule?: string
  }): Promise<DriftBlameReport> {
    assertGitRepo(this.projectPath)

    let blame: BlameAttribution[] = []
    const mode = options.target ?? 'overall'

    if (mode === 'file' && options.filePath) {
      blame = await BlameAnalyzer.analyzeFileBlame(options.filePath, this.analyzeFileFn)
    } else if (mode === 'rule' && options.rule) {
      blame = await BlameAnalyzer.analyzeRuleBlame(options.rule, this.projectPath, this.analyzeFileFn)
    } else {
      blame = await BlameAnalyzer.analyzeOverallBlame(this.projectPath, this.analyzeFileFn)
    }

    if (options.top) {
      blame = blame.slice(0, options.top)
    }

    const currentFiles = this.analyzeProjectFn(this.projectPath, this.config)
    const baseReport = buildReport(this.projectPath, currentFiles)

    return { ...baseReport, blame }
  }
}
