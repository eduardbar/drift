import * as vscode from 'vscode'

function buildRemoveLineEdit(document: vscode.TextDocument, line: number): vscode.WorkspaceEdit {
  const edit = new vscode.WorkspaceEdit()
  const targetLine = document.lineAt(line)
  const start = targetLine.range.start
  const end = line < document.lineCount - 1
    ? document.lineAt(line + 1).range.start
    : targetLine.range.end
  edit.delete(document.uri, new vscode.Range(start, end))
  return edit
}

function buildCatchTodoEdit(document: vscode.TextDocument, line: number): vscode.WorkspaceEdit {
  const edit = new vscode.WorkspaceEdit()
  const targetLine = document.lineAt(line)
  const baseIndent = targetLine.text.match(/^\s*/)?.[0] ?? ''
  const indent = `${baseIndent}  `
  edit.insert(document.uri, new vscode.Position(line + 1, 0), `${indent}// TODO: handle error\n`)
  return edit
}

export class DriftCodeActionProvider implements vscode.CodeActionProvider {
  provideCodeActions(
    document: vscode.TextDocument,
    _range: vscode.Range,
    context: vscode.CodeActionContext,
  ): vscode.CodeAction[] {
    const actions: vscode.CodeAction[] = []

    for (const diagnostic of context.diagnostics) {
      if (diagnostic.source !== 'drift') continue
      const rule = String(diagnostic.code ?? '')
      const line = diagnostic.range.start.line

      if (rule === 'debug-leftover') {
        const quickFix = new vscode.CodeAction('drift: remove debug leftover line', vscode.CodeActionKind.QuickFix)
        quickFix.diagnostics = [diagnostic]
        quickFix.edit = buildRemoveLineEdit(document, line)
        actions.push(quickFix)
      }

      if (rule === 'catch-swallow') {
        const quickFix = new vscode.CodeAction('drift: add TODO in empty catch', vscode.CodeActionKind.QuickFix)
        quickFix.diagnostics = [diagnostic]
        quickFix.edit = buildCatchTodoEdit(document, line)
        actions.push(quickFix)
      }
    }

    return actions
  }
}
