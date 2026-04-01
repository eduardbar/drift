const points = [
  "Weighted rule scoring for file-level and project-level trust.",
  "Guardrails for diff regressions and baseline comparisons.",
  "Configurable architecture constraints for layered or modular repos.",
  "Outputs ready for CI gates, trend tracking, and review workflows."
];

export function WhySection() {
  return (
    <section
      className="section shell section-surface section-accent-why why-section js-reveal"
      id="why"
      aria-labelledby="why-title"
    >
      <div className="section-divider" aria-hidden="true">
        <span className="js-divider-line" />
      </div>
      <div className="split why-layout">
        <div className="section-head-tight">
          <p className="eyebrow">Why it is not another linter</p>
          <h2 id="why-title">Linters check syntax discipline. drift checks merge trust.</h2>
          <span className="section-chip">Trust &gt; syntax trophies</span>
        </div>
        <ul className="why-list">
          {points.map((point) => (
            <li key={point} className="panel-card js-reveal-left">
              {point}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
