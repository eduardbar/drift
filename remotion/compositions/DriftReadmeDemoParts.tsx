import type {CSSProperties, ReactNode} from 'react';

import {AbsoluteFill, interpolate} from 'remotion';

const COMMAND_REVEAL_START_FRAME = 18;
const COMMAND_REVEAL_STAGGER_FRAMES = 10;
const COMMAND_REVEAL_DURATION_FRAMES = 8;
const COMMAND_REVEAL_OFFSET_PX = 10;
const EVALUATE_STAGE_START_FRAME = 72;
const GATE_STAGE_START_FRAME = 108;
export const ACTIVE_STAGE_SCALE = 1.02;

const commandRows = [
  '$ npx @eduardbar/drift scan .',
  '$ drift guard src --budget 3',
  '$ drift trust src --json > trust.json',
];

const stages = [
  {
    phase: 'Stage 01',
    name: 'Scan',
    text: 'Parse boundaries and dependencies with AST-level context.',
    accent: '#67a7ff',
  },
  {
    phase: 'Stage 02',
    name: 'Evaluate',
    text: 'Compare delta risk against baseline trust and budget.',
    accent: '#46d9b0',
  },
  {
    phase: 'Stage 03',
    name: 'Gate',
    text: 'Enforce merge policy with deterministic trust checks.',
    accent: '#8a7dff',
  },
];

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

type CommandFlowPanelProps = {
  frame: number;
  lineColor: string;
  mutedColor: string;
  shellStyle: CSSProperties;
};

export const CommandFlowPanel = ({frame, lineColor, mutedColor, shellStyle}: CommandFlowPanelProps): ReactNode => {
  return (
    <div
      style={{
        ...shellStyle,
        padding: '20px 22px',
        display: 'grid',
        alignContent: 'start',
        gap: 12,
      }}
    >
      <div
        style={{
          fontFamily: 'IBM Plex Mono, ui-monospace, SFMono-Regular, Menlo, monospace',
          fontSize: 13,
          letterSpacing: 1,
          textTransform: 'uppercase',
          color: mutedColor,
        }}
      >
        Typical PR check flow
      </div>
      {commandRows.map((line, index) => {
        const start = COMMAND_REVEAL_START_FRAME + index * COMMAND_REVEAL_STAGGER_FRAMES;
        const reveal = interpolate(frame, [start, start + COMMAND_REVEAL_DURATION_FRAMES], [0, 1], {
          extrapolateLeft: 'clamp',
          extrapolateRight: 'clamp',
        });
        return (
          <div
            key={line}
            style={{
              borderRadius: 14,
              border: `1px solid ${lineColor}`,
              background: 'rgba(8, 20, 40, 0.72)',
              padding: '12px 14px',
              opacity: reveal,
              transform: `translateY(${(1 - reveal) * COMMAND_REVEAL_OFFSET_PX}px)`,
              fontFamily: 'IBM Plex Mono, ui-monospace, SFMono-Regular, Menlo, monospace',
              fontSize: 15,
              color: '#d7eaff',
            }}
          >
            {line}
          </div>
        );
      })}
    </div>
  );
};

type StagePanelProps = {
  frame: number;
  activeScale: number;
  lineColor: string;
  mutedColor: string;
  shellStyle: CSSProperties;
};

export const StagePanel = ({frame, activeScale, lineColor, mutedColor, shellStyle}: StagePanelProps): ReactNode => {
  const activeStage = frame < EVALUATE_STAGE_START_FRAME ? 0 : frame < GATE_STAGE_START_FRAME ? 1 : 2;

  return (
    <div
      style={{
        ...shellStyle,
        padding: '16px 16px 14px',
        display: 'grid',
        alignContent: 'start',
        gap: 10,
      }}
    >
      {stages.map((stage, index) => {
        const isActive = index === activeStage;
        return (
          <div
            key={stage.name}
            style={{
              borderRadius: 16,
              border: `1px solid ${isActive ? stage.accent : lineColor}`,
              background: isActive
                ? `linear-gradient(145deg, rgba(255,255,255,0.16), rgba(255,255,255,0.06)), radial-gradient(circle at 100% 0%, ${stage.accent}33, transparent 60%)`
                : 'rgba(7, 19, 38, 0.64)',
              padding: '10px 12px',
              boxShadow: isActive ? `0 12px 24px ${stage.accent}22` : 'none',
              transform: `translateY(${isActive ? -2 : 0}px) scale(${isActive ? activeScale : 1})`,
            }}
          >
            <div
              style={{
                fontFamily: 'IBM Plex Mono, ui-monospace, SFMono-Regular, Menlo, monospace',
                fontSize: 11,
                letterSpacing: 1,
                textTransform: 'uppercase',
                color: stage.accent,
              }}
            >
              {stage.phase}
            </div>
            <div style={{marginTop: 3, fontSize: 23, fontWeight: 700}}>{stage.name}</div>
            <div style={{marginTop: 3, fontSize: 14, lineHeight: 1.35, color: mutedColor}}>{stage.text}</div>
          </div>
        );
      })}
    </div>
  );
};
