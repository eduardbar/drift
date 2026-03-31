const points = [
  "Weighted rule scoring for file-level and project-level trust.",
  "Guardrails for diff regressions and baseline comparisons.",
  "Configurable architecture constraints for layered or modular repos.",
  "Outputs ready for CI gates, trend tracking, and review workflows."
];

export function WhySection() {
  return (
    <section className="section shell split js-reveal" id="why">
      <div>
        <p className="eyebrow">Why it is not another linter</p>
        <h2>Linters check syntax discipline. drift checks merge trust.</h2>
      </div>
      <ul>
        {points.map((point) => (
          <li key={point}>{point}</li>
        ))}
      </ul>
    </section>
  );
}
