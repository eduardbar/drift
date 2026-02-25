import * as vscode from 'vscode'
import type { FileReport } from '@eduardbar/drift'

export class DriftStatusBarItem {
  private item: vscode.StatusBarItem

  constructor() {
    this.item = vscode.window.createStatusBarItem(
      vscode.StatusBarAlignment.Right,
      100
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

    const icon = hasErrors ? '$(error)' : totalScore < 50 ? '$(warning)' : '$(check)'
    this.item.text = `${icon} drift ${totalScore}/100 · ${totalIssues} issues`

    if (hasErrors || totalScore < 30) {
      this.item.backgroundColor = new vscode.ThemeColor('statusBarItem.errorBackground')
    } else if (totalScore < 60) {
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
