import {createRequire} from 'node:module';
import {resolve} from 'node:path';

import {DemoBackground, FooterStats} from '../remotion/compositions/DriftReadmeDemoParts';

const runtimeRequire = createRequire(resolve(process.cwd(), 'package.json'));
const {createElement} = runtimeRequire('react') as typeof import('react');
const {renderToStaticMarkup} = runtimeRequire('react-dom/server') as typeof import('react-dom/server');

function render(component: Parameters<typeof createElement>[0], props: Record<string, unknown>) {
  return renderToStaticMarkup(createElement(component, props));
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
});
