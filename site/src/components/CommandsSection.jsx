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
    <section className="section shell js-reveal" id="commands">
      <div className="section-head">
        <p className="eyebrow">Command examples</p>
        <h2>Useful defaults with explicit intent.</h2>
      </div>
      <div className="code-grid">
        {commandBlocks.map((block, index) => (
          <pre key={String(index)} className="surface-card">
            <code>{block.join("\n")}</code>
          </pre>
        ))}
      </div>
    </section>
  );
}
