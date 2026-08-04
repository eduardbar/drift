import type {CSSProperties} from 'react';

import {Easing, AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig} from 'remotion';

import {ACTIVE_STAGE_SCALE, CommandFlowPanel, DemoBackground, FooterStats, StagePanel} from './DriftReadmeDemoParts';

const palette = {
  bgA: '#050d1a',
  bgB: '#0a1930',
  bgC: '#0f2852',
  text: '#ecf6ff',
  muted: '#9eb6cb',
  blue: '#67a7ff',
  mint: '#46d9b0',
  violet: '#8a7dff',
  line: 'rgba(135, 179, 230, 0.22)',
};

const shellStyle: CSSProperties = {
  borderRadius: 30,
  border: `1px solid ${palette.line}`,
  background:
    'linear-gradient(165deg, rgba(255,255,255,0.09), rgba(255,255,255,0.03)), radial-gradient(circle at 90% 0%, rgba(103,167,255,0.22), transparent 48%)',
  boxShadow: '0 28px 60px rgba(0,0,0,0.32)',
  backdropFilter: 'blur(14px)',
};

const BODY_START_FRAME = 10;
const FOOTER_START_FRAME = 34;
const OUTRO_FADE_START_OFFSET_FRAMES = 14;
const SWEEP_START_FRAME = 12;
const SWEEP_EDGE_OFFSET_PX = 220;
const PULSE_PERIOD_FRAMES = 14;
const PULSE_MIN_SCALE = 0.95;
const PULSE_MAX_SCALE = 1.07;
const TITLE_INITIAL_OFFSET_PX = 36;
const BODY_INITIAL_OFFSET_PX = 28;

export const DriftReadmeDemo = () => {
  const frame = useCurrentFrame();
  const {fps, durationInFrames, width} = useVideoConfig();

  const intro = spring({
    fps,
    frame,
    config: {damping: 18, mass: 0.9},
  });

  const bodyIn = spring({
    fps,
    frame: frame - BODY_START_FRAME,
    config: {damping: 16, mass: 0.92},
  });

  const footerIn = spring({
    fps,
    frame: frame - FOOTER_START_FRAME,
    config: {damping: 18, mass: 0.95},
  });

  const outro = interpolate(frame, [durationInFrames - OUTRO_FADE_START_OFFSET_FRAMES, durationInFrames], [1, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: Easing.out(Easing.cubic),
  });

  const titleY = interpolate(intro, [0, 1], [TITLE_INITIAL_OFFSET_PX, 0]);
  const titleOpacity = interpolate(intro, [0, 1], [0, 1]);
  const bodyY = interpolate(bodyIn, [0, 1], [BODY_INITIAL_OFFSET_PX, 0]);
  const bodyOpacity = interpolate(bodyIn, [0, 1], [0, 1]);
  const footerOpacity = interpolate(footerIn, [0, 1], [0, 1]);

  const sweepX = interpolate(frame, [SWEEP_START_FRAME, durationInFrames], [-SWEEP_EDGE_OFFSET_PX, width + SWEEP_EDGE_OFFSET_PX], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  const pulse = interpolate(Math.sin(frame / PULSE_PERIOD_FRAMES), [-1, 1], [PULSE_MIN_SCALE, PULSE_MAX_SCALE]);
  return (
    <AbsoluteFill
      style={{
        opacity: outro,
        color: palette.text,
        fontFamily: 'Inter, system-ui, -apple-system, Segoe UI, sans-serif',
        background: [
          `radial-gradient(circle at 8% 4%, rgba(103,167,255,0.2), transparent 38%)`,
          `radial-gradient(circle at 92% 88%, rgba(70,217,176,0.16), transparent 46%)`,
          `linear-gradient(160deg, ${palette.bgA}, ${palette.bgB} 58%, ${palette.bgC})`,
        ].join(','),
        overflow: 'hidden',
      }}
    >
      <DemoBackground pulse={pulse} sweepX={sweepX} />

      <div
        style={{
          display: 'grid',
          gridTemplateRows: 'auto 1fr auto',
          height: '100%',
          padding: '42px 54px 36px',
          gap: 22,
        }}
      >
        <div
          style={{
            opacity: titleOpacity,
            transform: `translateY(${titleY}px)`,
            display: 'grid',
            gap: 10,
          }}
        >
          <div
            style={{
              width: 'fit-content',
              borderRadius: 999,
              border: `1px solid ${palette.line}`,
              background: 'rgba(9, 23, 46, 0.72)',
              padding: '6px 12px',
              fontFamily: 'IBM Plex Mono, ui-monospace, SFMono-Regular, Menlo, monospace',
              fontSize: 14,
              letterSpacing: 1.2,
              textTransform: 'uppercase',
              color: palette.blue,
            }}
          >
            drift | README demo
          </div>
          <div style={{fontSize: 48, lineHeight: 1.04, fontWeight: 700, maxWidth: 920}}>
            Static architecture trust signals before every merge.
          </div>
          <div style={{fontSize: 19, lineHeight: 1.4, color: palette.muted, maxWidth: 980}}>
            Analyze structure, compare drift, and gate risky pull requests with evidence your team can
            act on.
          </div>
        </div>

        <div
          style={{
            opacity: bodyOpacity,
            transform: `translateY(${bodyY}px)`,
            display: 'grid',
            gridTemplateColumns: '1.12fr 0.88fr',
            gap: 18,
            minHeight: 0,
          }}
        >
          <CommandFlowPanel frame={frame} lineColor={palette.line} mutedColor={palette.muted} shellStyle={shellStyle} />
          <StagePanel
            frame={frame}
            activeScale={ACTIVE_STAGE_SCALE}
            lineColor={palette.line}
            mutedColor={palette.muted}
            shellStyle={shellStyle}
          />
        </div>

        <FooterStats mutedColor={palette.muted} opacity={footerOpacity} shellStyle={shellStyle} />
      </div>
    </AbsoluteFill>
  );
};
