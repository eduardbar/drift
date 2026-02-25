// drift-ignore-file

import * as vscode from 'vscode'
import * as path from 'path'
import type { FileReport } from '@eduardbar/drift'

type TreeItemType = 'file' | 'issue'

export class DriftTreeItem extends vscode.TreeItem {
  constructor(
    public readonly label: string,
    public readonly collapsibleState: vscode.TreeItemCollapsibleState,
    public readonly itemType: TreeItemType,
    public readonly fileReport?: FileReport,
    public readonly issueIndex?: number
  ) {
    super(label, collapsibleState)

    if (itemType === 'file' && fileReport) {
      const score = fileReport.score
      const issueCount = fileReport.issues.length
      this.description = `score: ${score}  •  ${issueCount} issue${issueCount !== 1 ? 's' : ''}`
      this.tooltip = fileReport.path
      this.iconPath = score >= 70
        ? new vscode.ThemeIcon('check', new vscode.ThemeColor('testing.iconPassed'))
        : score >= 40
        ? new vscode.ThemeIcon('warning', new vscode.ThemeColor('problemsWarningIcon.foreground'))
        : new vscode.ThemeIcon('error', new vscode.ThemeColor('problemsErrorIcon.foreground'))
      this.contextValue = 'driftFile'
    }

    if (itemType === 'issue' && fileReport && issueIndex !== undefined) {
      const issue = fileReport.issues[issueIndex]
      this.description = `line ${issue.line}`
      this.tooltip = issue.message
      this.iconPath = issue.severity === 'error'
        ? new vscode.ThemeIcon('circle-filled', new vscode.ThemeColor('problemsErrorIcon.foreground'))
        : issue.severity === 'warning'
        ? new vscode.ThemeIcon('warning', new vscode.ThemeColor('problemsWarningIcon.foreground'))
        : new vscode.ThemeIcon('info', new vscode.ThemeColor('problemsInfoIcon.foreground'))

      // Click para ir a la línea
      this.command = {
        command: 'drift.goToIssue',
        title: 'Go to Issue',
        arguments: [fileReport.path, issue.line],
      }
      this.contextValue = 'driftIssue'
    }
  }
}

export class DriftTreeProvider implements vscode.TreeDataProvider<DriftTreeItem> {
  private _onDidChangeTreeData = new vscode.EventEmitter<DriftTreeItem | undefined | null | void>()
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event

  private reports = new Map<string, FileReport>()

  refresh(): void {
    this._onDidChangeTreeData.fire()
  }

  updateFile(report: FileReport): void {
    this.reports.set(report.path, report)
    this.refresh()
  }

  clearFile(filePath: string): void {
    this.reports.delete(filePath)
    this.refresh()
  }

  clearAll(): void {
    this.reports.clear()
    this.refresh()
  }

  getTreeItem(element: DriftTreeItem): vscode.TreeItem {
    return element
  }

  getChildren(element?: DriftTreeItem): DriftTreeItem[] {
    if (!element) {
      // Root: lista de archivos con issues, ordenados por score ascendente
      return Array.from(this.reports.values())
        .filter(r => r.issues.length > 0)
        .sort((a, b) => a.score - b.score)
        .map(r => new DriftTreeItem(
          path.basename(r.path),
          vscode.TreeItemCollapsibleState.Collapsed,
          'file',
          r
        ))
    }

    if (element.itemType === 'file' && element.fileReport) {
      return element.fileReport.issues.map((_, i) =>
        new DriftTreeItem(
          element.fileReport!.issues[i].rule,
          vscode.TreeItemCollapsibleState.None,
          'issue',
          element.fileReport,
          i
        )
      )
    }

    return []
  }
}
