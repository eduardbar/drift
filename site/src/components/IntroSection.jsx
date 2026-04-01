export function IntroSection() {
  return (
    <section
      className="section shell section-surface section-accent-intro intro js-reveal"
      id="intro"
      aria-labelledby="intro-title"
    >
      <div className="section-divider" aria-hidden="true">
        <span className="js-divider-line" />
      </div>
      <div className="intro-layout">
        <div className="section-head intro-editorial js-reveal">
          <p className="eyebrow">What drift actually audits</p>
          <h2 id="intro-title">Architecture confidence, not superficial lint trophies.</h2>
          <p className="intro-lead">
            drift audits file boundaries, dependency direction, and structural risk that affects
            merge confidence long before incidents are visible in production.
          </p>
          <div className="section-chip-row" aria-hidden="true">
            <span className="section-chip">Architecture Signal</span>
            <span className="section-chip">Merge Confidence</span>
          </div>
        </div>
        <div className="intro-card-stack" aria-label="Drift audit outcomes">
          <article className="panel-card narrative-card js-reveal">
            <h3>Structural risk, not code style noise</h3>
            <p>
              drift looks at file boundaries, dependency direction, and structural patterns that
              create hidden merge risk. It is designed for teams that need a trustworthy signal
              before change reaches main.
            </p>
          </article>
          <article className="panel-card narrative-card js-reveal">
            <h3>Weighted trust scoring with trend context</h3>
            <p>
              Instead of binary pass or fail style checks, drift gives weighted structural scoring
              and trendable trust signals that engineering leads can actually use in planning and
              release gates.
            </p>
          </article>
        </div>
      </div>
    </section>
  );
}
