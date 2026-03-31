const features = [
  {
    title: "Rule-weight scoring",
    description:
      "35 rule IDs with weighted impact and score caps so one noisy file does not dominate the result."
  },
  {
    title: "Diff and baseline guard",
    description:
      "Quantify what changed in a branch and fail early when regression exceeds your budget."
  },
  {
    title: "Trust pipeline",
    description:
      "Generate trust artifacts and enforce trust-gate policies directly in CI workflows."
  },
  {
    title: "Reporting stack",
    description:
      "Use report, badge, trend, and blame outputs to keep structural quality visible over time."
  }
];

export function FeaturesSection() {
  return (
    <section className="section shell js-reveal" id="features">
      <div className="section-head">
        <p className="eyebrow">Core features</p>
        <h2>Technical signal your team can gate on.</h2>
      </div>
      <div className="feature-grid">
        {features.map((feature) => (
          <article key={feature.title} className="surface-card feature-card js-stagger">
            <h3>{feature.title}</h3>
            <p>{feature.description}</p>
          </article>
        ))}
      </div>
    </section>
  );
}
