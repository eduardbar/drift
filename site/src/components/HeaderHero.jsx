import resourceLinks from "../resource-links.json";

function HeroNavigation() {
  return (
    <nav className="top-nav js-hero-nav" aria-label="Primary">
      <p className="brand">@eduardbar/drift</p>
      <div className="nav-links" role="list" aria-label="Key sections">
        <a className="chip-link" href="#features" role="listitem">Features</a>
        <a className="chip-link" href="#commands" role="listitem">Commands</a>
        <a className="chip-link" href={resourceLinks.npm} target="_blank" rel="noreferrer" role="listitem">
          npm
        </a>
        <a className="chip-link" href={resourceLinks.github} target="_blank" rel="noreferrer" role="listitem">GitHub</a>
        <a className="chip-link" href={resourceLinks.marketplace} target="_blank" rel="noreferrer" role="listitem">VS Code</a>
        <a className="chip-link" href={resourceLinks.actions} target="_blank" rel="noreferrer" role="listitem">Actions</a>
        <a className="chip-link" href={resourceLinks.mcp} target="_blank" rel="noreferrer" role="listitem">MCP</a>
        <a className="chip-link" href={resourceLinks.docs} target="_blank" rel="noreferrer" role="listitem">Docs</a>
      </div>
    </nav>
  );
}

function HeroCopy() {
  return (
    <div className="hero-copy">
      <p className="eyebrow js-hero-kicker">Static trust audit for TS/JS repos</p>
      <h1>
        <span className="hero-title-line js-hero-title-line">Merge with evidence,</span>
        <span className="hero-title-line js-hero-title-line">not intuition.</span>
      </h1>
      <p className="hero-subtext js-hero-sub">
        drift parses your repo with ts-morph, scores structural debt across 35 weighted
        rules, and turns every PR into a measurable trust signal.
      </p>
      <ul className="hero-proof js-hero-proof" aria-label="Quick proof points">
        <li>35 weighted rules</li>
        <li>AST-based analysis</li>
        <li>CI ready trust gate</li>
      </ul>
      <div className="hero-actions js-hero-actions">
        <a className="btn btn-primary" href={resourceLinks.npm} target="_blank" rel="noreferrer">
          Install drift
        </a>
        <a className="btn btn-secondary" href="#commands">Review command flow</a>
      </div>
      <p className="hero-footnote js-hero-footnote">npm i -D @eduardbar/drift</p>
    </div>
  );
}

function AuditSnapshot() {
  return (
    <aside className="hero-panel js-hero-panel" aria-label="drift command preview">
      <p className="panel-title">Audit snapshot</p>
      <div className="terminal-lines">
        <p className="js-terminal-line"><span>$</span> drift scan src</p>
        <p className="js-terminal-line"><span>$</span> drift guard src --budget 3</p>
        <p className="js-terminal-line"><span>$</span> drift trust src</p>
        <p className="js-terminal-line"><span>$</span> drift trust-gate trust.json</p>
      </div>
      <div className="kpi-row" role="list" aria-label="Sample quality metrics">
        <p role="listitem" className="js-hero-kpi"><strong>Rule IDs:</strong> 35</p>
        <p role="listitem" className="js-hero-kpi"><strong>Trust:</strong> 84</p>
        <p role="listitem" className="js-hero-kpi"><strong>Delta risk:</strong> +2</p>
      </div>
    </aside>
  );
}

export function HeaderHero() {
  return (
    <header className="hero shell" id="top">
      <HeroNavigation />
      <div className="hero-grid">
        <HeroCopy />
        <AuditSnapshot />
      </div>
    </header>
  );
}
