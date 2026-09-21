export function SiteFooter() {
  return (
    <footer className="footer shell">
      <p>@eduardbar/drift - static audit CLI for TypeScript and JavaScript</p>
      <nav className="footer-links" aria-label="Drift resources">
        <a href="https://www.npmjs.com/package/@eduardbar/drift" target="_blank" rel="noreferrer">npm CLI</a>
        <a href="https://github.com/eduardbar/drift" target="_blank" rel="noreferrer">GitHub</a>
        <a href="https://marketplace.visualstudio.com/items?itemName=eduardbar.vscode-drift" target="_blank" rel="noreferrer">VS Code</a>
        <a href="https://github.com/eduardbar/drift#github-action-contract-v2" target="_blank" rel="noreferrer">GitHub Actions</a>
        <a href="https://github.com/eduardbar/drift#drift-mcp-path" target="_blank" rel="noreferrer">MCP</a>
        <a href="https://github.com/eduardbar/drift/tree/main/docs" target="_blank" rel="noreferrer">Docs</a>
      </nav>
    </footer>
  );
}
