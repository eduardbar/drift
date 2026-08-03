import { createElement } from "../site/node_modules/react/index.js";
import { renderToStaticMarkup } from "../site/node_modules/react-dom/server.js";
import { HeaderHero } from "../site/src/components/HeaderHero.jsx";

function renderHero() {
  return renderToStaticMarkup(createElement(HeaderHero));
}

function renderedLinks(markup: string) {
  return [...markup.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/g)].map(([, attributes, content]) => ({
    attributes,
    content: content.replace(/<[^>]+>/g, "").trim(),
  }));
}

function attribute(attributes: string, name: string) {
  return attributes.match(new RegExp(`${name}="([^"]*)"`))?.[1];
}

describe("HeaderHero rendered contract", () => {
  test("keeps the npm links and section navigation usable", () => {
    const links = renderedLinks(renderHero());
    const npmLinks = links.filter(
      ({ attributes }) => attribute(attributes, "href") === "https://www.npmjs.com/package/@eduardbar/drift"
    );

    expect(npmLinks).toHaveLength(2);
    expect(npmLinks.every(({ attributes }) => attribute(attributes, "target") === "_blank")).toBe(true);
    expect(npmLinks.every(({ attributes }) => attribute(attributes, "rel") === "noreferrer")).toBe(true);
    expect(links.some(({ attributes, content }) => attribute(attributes, "href") === "#features" && content === "Features")).toBe(true);
    expect(links.some(({ attributes, content }) => attribute(attributes, "href") === "#commands" && content === "Commands")).toBe(true);
  });

  test("keeps the visible proof points and audit metrics", () => {
    const markup = renderHero();

    expect(markup).toContain("35 weighted rules");
    expect(markup).toContain("AST-based analysis");
    expect(markup).toContain("CI ready trust gate");
    expect(markup).toContain("drift scan src");
    expect(markup).toContain("drift guard src --budget 3");
    expect(markup).toContain("drift trust src");
    expect(markup).toContain("drift trust-gate trust.json");
    expect(markup).toContain("Rule IDs:</strong> 35");
    expect(markup).toContain("Trust:</strong> 84");
    expect(markup).toContain("Delta risk:</strong> +2");
  });
});
