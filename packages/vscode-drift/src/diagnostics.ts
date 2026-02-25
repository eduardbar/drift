import * as vscode from 'vscode'
import type { FileReport } from '@eduardbar/drift'

const SEVERITY_MAP: Record<string, vscode.DiagnosticSeverity> = {
  error: vscode.DiagnosticSeverity.Error,
  warning: vscode.DiagnosticSeverity.Warning,
  info: vscode.DiagnosticSeverity.Information,
}

export class DriftDiagnosticsProvider {
  private collection: vscode.DiagnosticCollection

  constructor() {
    this.collection = vscode.languages.createDiagnosticCollection('drift')
  }

  update(report: FileReport): void {
    const uri = vscode.Uri.file(report.path)
    const config = vscode.workspace.getConfiguration('drift')
    const minSeverity = config.get<string>('minSeverity', 'info')

    const severityOrder = ['error', 'warning', 'info']
    const minIdx = severityOrder.indexOf(minSeverity)

    const diagnostics: vscode.Diagnostic[] = report.issues
      .filter(issue => severityOrder.indexOf(issue.severity) <= minIdx)
      .map(issue => {
        // line es 1-based en drift, VS Code usa 0-based
        const line = Math.max(0, issue.line - 1)
        const range = new vscode.Range(line, 0, line, Number.MAX_SAFE_INTEGER)
        const diagnostic = new vscode.Diagnostic(
          range,
          `[drift/${issue.rule}] ${issue.message}`,
          SEVERITY_MAP[issue.severity] ?? vscode.DiagnosticSeverity.Information
        )
        diagnostic.source = 'drift'
        diagnostic.code = issue.rule
        return diagnostic
      })

    this.collection.set(uri, diagnostics)
  }

  clear(uri?: vscode.Uri): void {
    if (uri) {
      this.collection.delete(uri)
    } else {
      this.collection.clear()
    }
  }

  dispose(): void {
    this.collection.dispose()
  }
}
