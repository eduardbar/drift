import {createRequire} from 'node:module';
import {resolve} from 'node:path';

import {
  CommandFlowPanel,
  DemoBackground,
  FooterStats,
  StagePanel,
} from '../remotion/compositions/DriftReadmeDemoParts';

const runtimeRequire = createRequire(resolve(process.cwd(), 'package.json'));
const {createElement} = runtimeRequire('react') as typeof import('react');
const {renderToStaticMarkup} = runtimeRequire('react-dom/server') as typeof import('react-dom/server');

function render(component: Parameters<typeof createElement>[0], props: Record<string, unknown>) {
  return renderToStaticMarkup(createElement(component, props));
}

function commandRowStyle(markup: string, command: string) {
  const renderedCommand = command.replace('>', '&gt;');
  const escapedCommand = renderedCommand.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return markup.match(new RegExp(`<div style="([^"]+)">${escapedCommand}</div>`))?.[1] ?? '';
}

describe('Remotion README demo extracted parts', () => {
  test('renders background layers and applies animation inputs to their styles', () => {
    const markup = render(DemoBackground, {pulse: 1.05, sweepX: 321});

    expect((markup.match(/<div\b/g) ?? [])).toHaveLength(3);
    expect(markup).toContain('inset:-120px');
    expect(markup).toContain('background-size:64px 64px');
    expect(markup).toContain('transform:scale(1.05)');
    expect(markup).toContain('left:321px');
    expect(markup).toContain('rotate(-14deg)');
  });

  test('renders all footer stats with the supplied opacity and shell styles', () => {
    const markup = render(FooterStats, {
      mutedColor: '#9eb6cb',
      opacity: 0.4,
      shellStyle: {borderRadius: 30, background: 'rgb(1, 2, 3)'},
    });

    expect(markup).toContain('Rule IDs: 35');
    expect(markup).toContain('Trust score: 84');
    expect(markup).toContain('Merge risk delta: +2');
    expect(markup).toContain('opacity:0.4');
    expect(markup).toContain('border-radius:30px');
    expect(markup).toContain('grid-template-columns:repeat(3, minmax(0, 1fr))');
    expect(markup).toContain('color:#9eb6cb');
  });

  test.each([
    [0, '$ npx @eduardbar/drift scan .'],
    [1, '$ drift guard src --budget 3'],
    [2, '$ drift trust src --json > trust.json'],
  ])('reveals command row %i at every reveal boundary', (index, command) => {
    const start = 18 + index * 10;
    const renderAt = (frame: number) =>
      render(CommandFlowPanel, {
        frame,
        lineColor: 'rgba(135, 179, 230, 0.22)',
        mutedColor: '#9eb6cb',
        shellStyle: {borderRadius: 30},
      });

    const beforeReveal = renderAt(start - 1);
    const atReveal = renderAt(start);
    const afterReveal = renderAt(start + 8);

    expect(commandRowStyle(beforeReveal, command)).toContain('opacity:0');
    expect(commandRowStyle(beforeReveal, command)).toContain('translateY(10px)');
    expect(commandRowStyle(atReveal, command)).toContain('opacity:0');
    expect(commandRowStyle(atReveal, command)).toContain('translateY(10px)');
    expect(commandRowStyle(afterReveal, command)).toContain('opacity:1');
    expect(commandRowStyle(afterReveal, command)).toContain('translateY(0px)');
  });

  test.each([0, 71, 72, 107, 108])('keeps the correct stage active at frame %i boundary', (frame) => {
    const markup = render(StagePanel, {
      frame,
      activeScale: 1.02,
      lineColor: 'rgba(135, 179, 230, 0.22)',
      mutedColor: '#9eb6cb',
      shellStyle: {borderRadius: 30},
    });

    const expectedActiveIndex = frame < 72 ? 0 : frame < 108 ? 1 : 2;
    const transforms = [...markup.matchAll(/transform:translateY\((-2|0)px\) scale\((1\.02|1)\)/g)].map(
      ([, offset, scale]) => `${offset}:${scale}`,
    );

    expect(markup).toContain('Stage 01');
    expect(markup).toContain('Stage 02');
    expect(markup).toContain('Stage 03');
    expect(transforms).toHaveLength(3);
    expect(transforms[expectedActiveIndex]).toBe('-2:1.02');
    expect(transforms.filter((transform) => transform === '0:1')).toHaveLength(2);

    const accents = ['#67a7ff', '#46d9b0', '#8a7dff'];
    const activeAccent = accents[expectedActiveIndex];
    expect(markup).toContain(`border:1px solid ${activeAccent}`);
    expect(markup).toContain(
      `background:linear-gradient(145deg, rgba(255,255,255,0.16), rgba(255,255,255,0.06)), radial-gradient(circle at 100% 0%, ${activeAccent}33, transparent 60%)`,
    );
    expect(markup).toContain(`box-shadow:0 12px 24px ${activeAccent}22`);
    expect(markup.match(/border:1px solid rgba\(135, 179, 230, 0\.22\)/g) ?? []).toHaveLength(2);
    expect(markup.match(/background:rgba\(7, 19, 38, 0\.64\)/g) ?? []).toHaveLength(2);
    expect(markup.match(/box-shadow:none/g) ?? []).toHaveLength(2);
  });
});
