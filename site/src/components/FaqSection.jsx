const faqs = [
  {
    question: "Does drift replace ESLint?",
    answer:
      "No. ESLint handles style and syntax rules. drift focuses on architecture debt and merge risk signals."
  },
  {
    question: "Can we run it incrementally on pull requests?",
    answer:
      "Yes. diff and guard compare branch changes against a base ref or a baseline file."
  },
  {
    question: "Does it only work for monorepos?",
    answer:
      "No. It works for regular repos and monorepos, with module boundary config when needed."
  }
];

export function FaqSection() {
  return (
    <section
      className="section shell section-surface section-accent-faq faq js-reveal"
      id="faq"
      aria-labelledby="faq-title"
    >
      <div className="section-divider" aria-hidden="true">
        <span className="js-divider-line" />
      </div>
      <div className="section-head">
        <p className="eyebrow">FAQ</p>
        <h2 id="faq-title">Short answers. No marketing fog.</h2>
        <span className="section-chip">Direct answers</span>
      </div>
      <div className="faq-list">
        {faqs.map((item) => (
          <details key={item.question} className="panel-card faq-item js-reveal-scale">
            <summary>{item.question}</summary>
            <p>{item.answer}</p>
          </details>
        ))}
      </div>
    </section>
  );
}
