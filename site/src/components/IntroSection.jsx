export function IntroSection() {
  return (
    <section className="section shell section-border js-reveal" id="intro">
      <div className="section-head">
        <p className="eyebrow">What drift actually audits</p>
        <h2>Architecture confidence, not superficial lint trophies.</h2>
      </div>
      <p>
        drift looks at file boundaries, dependency direction, and structural patterns that
        create hidden merge risk. It is designed for teams that need a trustworthy signal
        before change reaches main.
      </p>
    </section>
  );
}
