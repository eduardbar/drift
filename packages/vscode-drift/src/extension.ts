import * as vscode from 'vscode'
import { analyzeFilePath } from './analyzer'
import { DriftDiagnosticsProvider } from './diagnostics'
import { DriftTreeProvider } from './treeview'
import { DriftStatusBarItem } from './statusbar'
import type { FileReport } from '@eduardbar/drift'

const SUPPORTED_LANGUAGES = ['typescript', 'typescriptreact', 'javascript', 'javascriptreact']

export function activate(context: vscode.ExtensionContext): void {
  const diagnostics = new DriftDiagnosticsProvider()
  const treeProvider = new DriftTreeProvider()
  const statusBar = new DriftStatusBarItem()

  // Registrar TreeView
  const treeView = vscode.window.createTreeView('driftIssues', {
    treeDataProvider: treeProvider,
    showCollapseAll: true,
  })

  // Cache de reports para la status bar
  const reportCache = new Map<string, FileReport>()

  async function analyzeAndUpdate(document: vscode.TextDocument): Promise<void> {
    const config = vscode.workspace.getConfiguration('drift')
    if (!config.get<boolean>('enable', true)) return

    if (!SUPPORTED_LANGUAGES.includes(document.languageId)) return
    if (document.uri.scheme !== 'file') return

    const filePath = document.uri.fsPath

    const report = await analyzeFilePath(filePath)
    if (!report) return

    diagnostics.update(report)
    treeProvider.updateFile(report)
    reportCache.set(filePath, report)
    statusBar.update(Array.from(reportCache.values()))
  }

  // Trigger: al guardar
  const onSave = vscode.workspace.onDidSaveTextDocument(analyzeAndUpdate)

  // Comando: scan workspace
  const scanCmd = vscode.commands.registerCommand('drift.scanWorkspace', async () => {
    const files = await vscode.workspace.findFiles(
      '**/*.{ts,tsx,js,jsx}',
      '**/node_modules/**'
    )

    vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: 'drift: Scanning workspace...',
        cancellable: false,
      },
      async (progress) => {
        const total = files.length
        let done = 0

        for (const file of files) {
          const report = await analyzeFilePath(file.fsPath)
          if (report) {
            diagnostics.update(report)
            treeProvider.updateFile(report)
            reportCache.set(file.fsPath, report)
          }
          done++
          progress.report({ increment: (done / total) * 100 })
        }

        statusBar.update(Array.from(reportCache.values()))
        vscode.window.showInformationMessage(`drift: ${total} files scanned.`)
      }
    )
  })

  // Comando: clear
  const clearCmd = vscode.commands.registerCommand('drift.clearDiagnostics', () => {
    diagnostics.clear()
    treeProvider.clearAll()
    reportCache.clear()
    statusBar.update([])
  })

  // Comando: go to issue (desde TreeView click)
  const goToCmd = vscode.commands.registerCommand(
    'drift.goToIssue',
    async (filePath: string, line: number) => {
      const uri = vscode.Uri.file(filePath)
      const doc = await vscode.workspace.openTextDocument(uri)
      const editor = await vscode.window.showTextDocument(doc)
      const pos = new vscode.Position(Math.max(0, line - 1), 0)
      editor.selection = new vscode.Selection(pos, pos)
      editor.revealRange(new vscode.Range(pos, pos), vscode.TextEditorRevealType.InCenter)
    }
  )

  context.subscriptions.push(
    { dispose: () => diagnostics.dispose() },
    { dispose: () => statusBar.dispose() },
    treeView,
    onSave,
    scanCmd,
    clearCmd,
    goToCmd,
  )
}

export function deactivate(): void {}
