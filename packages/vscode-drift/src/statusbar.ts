import * as vscode from 'vscode'
import type { FileReport } from '@eduardbar/drift'

const STATUSBAR_PRIORITY = 100

const SCORE_THRESHOLDS = {
  WARNING: 50,
  ERROR: 30,
  WARNING_BG: 60,
}

export class DriftStatusBarItem {
  private item: vscode.StatusBarItem

  constructor() {
    this.item = vscode.createStatusBarItem(
      vscode.StatusBarAlignment.Right,
      STATUSBAR_PRIORITY
    )
    this.item.command = 'drift.scanWorkspace'
    this.item.tooltip = 'Click to scan workspace'
  }

  update(reports: FileReport[]): void {
    if (reports.length === 0) {
      this.item.text = '$(check) drift'
      this.item.backgroundColor = undefined
      this.item.show()
      return
    }

    const totalScore = Math.round(
      reports.reduce((sum, r) => sum + r.score, 0) / reports.length
    )
    const totalIssues = reports.reduce((sum, r) => sum + r.issues.length, 0)
    const hasErrors = reports.some(r => r.issues.some(i => i.severity === 'error'))

    const icon = hasErrors ? '$(error)' : totalScore < SCORE_THRESHOLDS.WARNING ? '$(warning)' : '$(check)'
    this.item.text = `${icon} drift ${totalScore}/100 · ${totalIssues} issues`

    if (hasErrors || totalScore < SCORE_THRESHOLDS.ERROR) {
      this.item.backgroundColor = new vscode.ThemeColor('statusBarItem.errorBackground')
    } else if (totalScore < SCORE_THRESHOLDS.WARNING_BG) {
      this.item.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground')
    } else {
      this.item.backgroundColor = undefined
    }

    this.item.show()
  }

  dispose(): void {
    this.item.dispose()
  }
}
