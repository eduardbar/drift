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
    <section className="section shell faq js-reveal" id="faq">
      <div className="section-head">
        <p className="eyebrow">FAQ</p>
        <h2>Short answers. No marketing fog.</h2>
      </div>
      <div className="faq-list">
        {faqs.map((item) => (
          <details key={item.question} className="surface-card">
            <summary>{item.question}</summary>
            <p>{item.answer}</p>
          </details>
        ))}
      </div>
    </section>
  );
}
