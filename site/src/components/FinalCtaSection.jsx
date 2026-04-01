export function FinalCtaSection() {
  return (
    <section
      className="section shell section-surface section-accent-cta final-cta-section js-reveal"
      id="cta"
      aria-labelledby="cta-title"
    >
      <div className="section-divider" aria-hidden="true">
        <span className="js-divider-line" />
      </div>
      <div className="panel-card final-cta">
        <span className="section-chip">Ready to gate merges</span>
        <h2 id="cta-title">Stop shipping silent architecture debt.</h2>
        <p>
          Install drift, run a first scan in minutes, and make trust an explicit merge
          requirement.
        </p>
        <div className="hero-actions">
          <a
            className="btn btn-primary"
            href="https://www.npmjs.com/package/@eduardbar/drift"
            target="_blank"
            rel="noreferrer"
          >
            Install now
          </a>
          <a
            className="btn btn-secondary"
            href="https://github.com/eduardbar/drift"
            target="_blank"
            rel="noreferrer"
          >
            Read docs on GitHub
          </a>
        </div>
      </div>
    </section>
  );
}
