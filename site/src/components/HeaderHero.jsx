export function HeaderHero() {
  return (
    <header className="hero shell" id="top">
      <nav className="top-nav" aria-label="Primary">
        <p className="brand">drift</p>
        <a
          className="chip-link"
          href="https://www.npmjs.com/package/@eduardbar/drift"
          target="_blank"
          rel="noreferrer"
        >
          npm
        </a>
      </nav>

      <div className="hero-grid">
        <div className="hero-copy js-hero-copy">
          <p className="eyebrow">Static trust audit for TS/JS repos</p>
          <h1>Catch structural drift before your PR lands in main.</h1>
          <p className="hero-subtext">
            drift parses your codebase with ts-morph, scores structural debt with weighted
            rules, and gives merge confidence signals instead of style-only noise.
          </p>
          <div className="hero-actions">
            <a
              className="btn btn-primary"
              href="https://www.npmjs.com/package/@eduardbar/drift"
              target="_blank"
              rel="noreferrer"
            >
              Install and try
            </a>
            <a className="btn btn-secondary" href="#commands">
              See commands
            </a>
          </div>
          <p className="hero-footnote">npm i -D @eduardbar/drift</p>
        </div>

        <aside className="hero-panel js-hero-panel js-scrub" aria-label="drift command preview">
          <p className="panel-title">Terminal snapshot</p>
          <div className="terminal-lines">
            <p className="js-terminal-line">
              <span>$</span> drift scan src
            </p>
            <p className="js-terminal-line">
              <span>$</span> drift guard src --budget 3
            </p>
            <p className="js-terminal-line">
              <span>$</span> drift trust src
            </p>
            <p className="js-terminal-line">
              <span>$</span> drift trust-gate trust.json
            </p>
          </div>
          <div className="kpi-row" role="list" aria-label="Sample quality metrics">
            <p role="listitem">
              <strong>Rule IDs:</strong> 35
            </p>
            <p role="listitem">
              <strong>Trust:</strong> 84
            </p>
            <p role="listitem">
              <strong>Delta risk:</strong> +2
            </p>
          </div>
        </aside>
      </div>
    </header>
  );
}
