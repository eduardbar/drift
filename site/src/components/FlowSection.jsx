const flow = [
  {
    title: "Scan",
    text: "Parse source files and compute weighted structural risk per file."
  },
  {
    title: "Evaluate",
    text: "Compare trust against baseline or branch diff to expose drift introduced by change."
  },
  {
    title: "Gate",
    text: "Run trust-gate in CI and block merges that violate policy thresholds."
  }
];

export function FlowSection() {
  return (
    <section className="section shell js-reveal" id="flow">
      <div className="section-head">
        <p className="eyebrow">How it works</p>
        <h2>From local scan to merge decision in three steps.</h2>
      </div>
      <ol className="flow-list">
        {flow.map((step) => (
          <li key={step.title}>
            <strong>{step.title}:</strong> {step.text}
          </li>
        ))}
      </ol>
    </section>
  );
}
