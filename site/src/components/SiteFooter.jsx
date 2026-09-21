import resourceLinks from "../resource-links.json";

export function SiteFooter() {
  return (
    <footer className="footer shell">
      <p>@eduardbar/drift - static audit CLI for TypeScript and JavaScript</p>
      <nav className="footer-links" aria-label="Drift resources">
        <a href={resourceLinks.npm} target="_blank" rel="noreferrer">npm CLI</a>
        <a href={resourceLinks.github} target="_blank" rel="noreferrer">GitHub</a>
        <a href={resourceLinks.marketplace} target="_blank" rel="noreferrer">VS Code</a>
        <a href={resourceLinks.actions} target="_blank" rel="noreferrer">GitHub Actions</a>
        <a href={resourceLinks.mcp} target="_blank" rel="noreferrer">MCP</a>
        <a href={resourceLinks.docs} target="_blank" rel="noreferrer">Docs</a>
      </nav>
    </footer>
  );
}
