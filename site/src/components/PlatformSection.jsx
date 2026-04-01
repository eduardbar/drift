const pillars = [
  {
    title: "Trust",
    text: "Turn raw findings into trust scores teams can discuss and trend over releases."
  },
  {
    title: "CI",
    text: "Wire drift commands into workflows and fail fast when risk exceeds policy."
  },
  {
    title: "Guardrails",
    text: "Set budget thresholds, compare against baseline, and enforce severity boundaries."
  },
  {
    title: "Reporting",
    text: "Produce machine-readable and human-readable artifacts for engineering review."
  }
];

export function PlatformSection() {
  return (
    <section
      className="section shell section-surface section-accent-platform platform-section js-reveal"
      id="platform"
      aria-labelledby="platform-title"
    >
      <div className="section-divider" aria-hidden="true">
        <span className="js-divider-line" />
      </div>
      <div className="section-head">
        <p className="eyebrow">Trust, CI, guardrails, reporting</p>
        <h2 id="platform-title">Everything needed to operationalize structural quality.</h2>
        <span className="section-chip">Operational surface</span>
      </div>
      <div className="pillars">
        {pillars.map((pillar) => (
          <article key={pillar.title} className="panel-card pillar-card js-reveal-scale">
            <h3>{pillar.title}</h3>
            <p>{pillar.text}</p>
          </article>
        ))}
      </div>
    </section>
  );
}
