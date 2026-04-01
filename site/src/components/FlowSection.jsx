const flow = [
  {
    phase: "Stage 01",
    title: "Scan",
    lead: "Parse structure and surface hard signals.",
    text: "drift inspects TypeScript AST, resolves imports, and scores architectural risk per file.",
    chip: "AST Signal",
    tone: "scan"
  },
  {
    phase: "Stage 02",
    title: "Evaluate",
    lead: "Quantify drift delta before merge pressure.",
    text: "diff and guard compare the branch against baseline budgets, severity thresholds, and trend context.",
    chip: "Risk Delta",
    tone: "evaluate"
  },
  {
    phase: "Stage 03",
    title: "Gate",
    lead: "Enforce explicit merge confidence policy.",
    text: "trust and trust-gate turn debt signals into deterministic CI merge conditions.",
    chip: "Merge Policy",
    tone: "gate"
  }
];

export function FlowSection() {
  return (
    <section className="section shell flow-section js-reveal" id="flow" aria-labelledby="flow-title">
      <div className="section-divider" aria-hidden="true">
        <span className="js-divider-line" />
      </div>
      <div className="section-head">
        <p className="eyebrow">How it works</p>
        <h2 id="flow-title">Three execution stages from structural scan to merge trust.</h2>
      </div>
      <div className="flow-layout">
        <div className="flow-copy">
          <p>
            One stage extracts architecture truth, one stage measures delta under pressure,
            one stage gates merge confidence. Scroll to advance the chain in order.
          </p>
          <div className="flow-pillars" aria-hidden="true">
            <span className="flow-pill flow-pill-scan">AST Signal</span>
            <span className="flow-pill flow-pill-evaluate">Risk Delta</span>
            <span className="flow-pill flow-pill-gate">Merge Policy</span>
          </div>
        </div>
        <div className="flow-frame surface-card">
          <div className="flow-glow js-flow-glow" aria-hidden="true" />
          <div className="flow-meter" aria-hidden="true">
            <span className="js-flow-meter" />
          </div>
          <div className="flow-stages" role="list" aria-label="drift workflow phases">
            {flow.map((step, index) => (
              <article
                className={`flow-stage flow-stage-${step.tone} js-flow-stage${index === 0 ? " is-active" : ""}`}
                data-stage={step.tone}
                key={step.title}
                role="listitem"
                tabIndex={0}
              >
                <div className="flow-stage-top">
                  <p className="flow-phase">{step.phase}</p>
                  <p className="flow-index">{step.title}</p>
                </div>
                <h3>{step.lead}</h3>
                <p>{step.text}</p>
                <span className="flow-stage-chip" aria-hidden="true">
                  {step.chip}
                </span>
              </article>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
