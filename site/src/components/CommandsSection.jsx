const commandBlocks = [
  [
    "drift init",
    "drift scan src",
    "drift diff origin/main",
    "drift guard src --base origin/main --budget 3"
  ],
  [
    "drift trust src",
    "drift trust-gate trust.json",
    "drift report src",
    "drift trend 30d"
  ]
];

export function CommandsSection() {
  return (
    <section
      className="section shell section-surface section-accent-commands commands-section js-reveal"
      id="commands"
      aria-labelledby="commands-title"
    >
      <div className="section-divider" aria-hidden="true">
        <span className="js-divider-line" />
      </div>
      <div className="section-head">
        <p className="eyebrow">Command examples</p>
        <h2 id="commands-title">Useful defaults with explicit intent.</h2>
        <div className="section-chip-row" aria-hidden="true">
          <span className="section-chip">Bootstrap</span>
          <span className="section-chip">Guard</span>
          <span className="section-chip">Trust</span>
        </div>
      </div>
      <div className="code-grid">
        {commandBlocks.map((block, index) => (
          <pre key={String(index)} className="panel-card command-panel js-reveal-scale">
            <code>{block.join("\n")}</code>
          </pre>
        ))}
      </div>
    </section>
  );
}
