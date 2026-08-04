import type {CSSProperties, ReactNode} from 'react';

import {AbsoluteFill} from 'remotion';

const GRID_INSET_PX = 120;
const GLOW_TOP_OFFSET_PX = 120;
const GLOW_LEFT_OFFSET_PX = 140;
const GLOW_SIZE_PX = 360;

type DemoBackgroundProps = {
  pulse: number;
  sweepX: number;
};

export const DemoBackground = ({pulse, sweepX}: DemoBackgroundProps): ReactNode => {
  return (
    <>
      <AbsoluteFill
        style={{
          inset: -GRID_INSET_PX,
          opacity: 0.32,
          backgroundImage:
            'linear-gradient(rgba(120,163,214,0.16) 1px, transparent 1px), linear-gradient(90deg, rgba(120,163,214,0.16) 1px, transparent 1px)',
          backgroundSize: '64px 64px',
        }}
      />

      <AbsoluteFill
        style={{
          top: -GLOW_TOP_OFFSET_PX,
          left: -GLOW_LEFT_OFFSET_PX,
          width: GLOW_SIZE_PX,
          height: GLOW_SIZE_PX,
          borderRadius: 999,
          transform: `scale(${pulse})`,
          background: 'radial-gradient(circle, rgba(103,167,255,0.42), rgba(103,167,255,0))',
          filter: 'blur(8px)',
        }}
      />

      <AbsoluteFill
        style={{
          top: 330,
          left: sweepX,
          width: 220,
          height: 420,
          transform: 'rotate(-14deg)',
          background:
            'linear-gradient(180deg, rgba(103,167,255,0), rgba(103,167,255,0.24), rgba(103,167,255,0))',
        }}
      />
    </>
  );
};

type FooterStatsProps = {
  mutedColor: string;
  opacity: number;
  shellStyle: CSSProperties;
};

export const FooterStats = ({mutedColor, opacity, shellStyle}: FooterStatsProps): ReactNode => {
  return (
    <div
      style={{
        ...shellStyle,
        opacity,
        display: 'grid',
        gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
        gap: 10,
        padding: '12px 14px',
        alignItems: 'center',
        fontFamily: 'IBM Plex Mono, ui-monospace, SFMono-Regular, Menlo, monospace',
      }}
    >
      <div style={{fontSize: 13, color: mutedColor}}>Rule IDs: 35</div>
      <div style={{fontSize: 13, color: mutedColor}}>Trust score: 84</div>
      <div style={{fontSize: 13, color: mutedColor}}>Merge risk delta: +2</div>
    </div>
  );
};
