import type {CSSProperties} from 'react';

import {
  AbsoluteFill,
  Easing,
  interpolate,
  Sequence,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from 'remotion';

const palette = {
  bg: '#07111f',
  panel: 'rgba(9, 25, 47, 0.8)',
  panelBorder: 'rgba(143, 224, 255, 0.22)',
  cyan: '#8fe0ff',
  mint: '#89f2c7',
  coral: '#ff8b7b',
  text: '#f4fbff',
  textMuted: '#9cb6c8',
};

const containerStyle: CSSProperties = {
  background: [
    'radial-gradient(circle at top left, rgba(137, 242, 199, 0.18), transparent 30%)',
    'radial-gradient(circle at bottom right, rgba(255, 139, 123, 0.22), transparent 34%)',
    'linear-gradient(145deg, #07111f 0%, #09192f 55%, #0d2340 100%)',
  ].join(', '),
  color: palette.text,
  fontFamily: 'Georgia, Times New Roman, serif',
  overflow: 'hidden',
};

const gridStyle: CSSProperties = {
  backgroundImage:
    'linear-gradient(rgba(143, 224, 255, 0.08) 1px, transparent 1px), linear-gradient(90deg, rgba(143, 224, 255, 0.08) 1px, transparent 1px)',
  backgroundSize: '72px 72px',
  inset: -120,
  opacity: 0.4,
};

const rowStyle: CSSProperties = {
  display: 'flex',
  gap: 24,
  alignItems: 'center',
};

const statCardStyle: CSSProperties = {
  flex: 1,
  minHeight: 206,
  padding: '34px 32px',
  borderRadius: 28,
  border: `1px solid ${palette.panelBorder}`,
  background: palette.panel,
  boxShadow: '0 26px 60px rgba(0, 0, 0, 0.26)',
  backdropFilter: 'blur(20px)',
};

type SignalBarProps = {
  color: string;
  delay: number;
  frame: number;
};

const SignalBar = ({color, delay, frame}: SignalBarProps) => {
  const entrance = spring({
    fps: 30,
    frame: frame - delay,
    config: {
      damping: 14,
      mass: 0.8,
    },
  });

  const height = interpolate(entrance, [0, 1], [38, 210], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  return (
    <div
      style={{
        width: 44,
        height,
        borderRadius: 999,
        background: color,
        boxShadow: `0 0 40px ${color}`,
      }}
    />
  );
};

export const DriftMarketingPulse = () => {
  const frame = useCurrentFrame();
  const {fps, durationInFrames} = useVideoConfig();

  const intro = spring({
    fps,
    frame,
    config: {
      damping: 18,
      mass: 0.85,
    },
  });

  const cardReveal = spring({
    fps,
    frame: frame - 18,
    config: {
      damping: 16,
      mass: 0.9,
    },
  });

  const outro = interpolate(frame, [durationInFrames - 28, durationInFrames], [1, 0], {
    easing: Easing.out(Easing.cubic),
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  const titleTranslate = interpolate(intro, [0, 1], [60, 0]);
  const titleOpacity = interpolate(intro, [0, 1], [0, 1]);
  const cardOpacity = interpolate(cardReveal, [0, 1], [0, 1]);
  const cardTranslate = interpolate(cardReveal, [0, 1], [48, 0]);
  const pulseScale = interpolate(Math.sin(frame / 12), [-1, 1], [0.94, 1.08]);

  return (
    <AbsoluteFill style={{...containerStyle, opacity: outro}}>
      <AbsoluteFill style={gridStyle} />

      <AbsoluteFill
        style={{
          top: -180,
          left: -120,
          width: 420,
          height: 420,
          borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(137, 242, 199, 0.28), transparent 70%)',
          transform: `scale(${pulseScale})`,
        }}
      />

      <AbsoluteFill
        style={{
          top: 700,
          left: 720,
          width: 460,
          height: 460,
          borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(255, 139, 123, 0.18), transparent 70%)',
          transform: `scale(${2 - pulseScale})`,
        }}
      />

      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          padding: '92px 84px 80px',
          gap: 36,
        }}
      >
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 14,
            opacity: titleOpacity,
            transform: `translateY(${titleTranslate}px)`,
          }}
        >
          <div
            style={{
              alignSelf: 'flex-start',
              padding: '10px 18px',
              borderRadius: 999,
              border: `1px solid ${palette.panelBorder}`,
              color: palette.mint,
              fontFamily: 'Arial, sans-serif',
              fontSize: 24,
              letterSpacing: 2.4,
              textTransform: 'uppercase',
              background: 'rgba(7, 17, 31, 0.55)',
            }}
          >
            Drift marketing videos
          </div>

          <div style={{fontSize: 88, lineHeight: 0.95, fontWeight: 700, maxWidth: 760}}>
            Ship the story behind every audit.
          </div>

          <div
            style={{
              fontFamily: 'Arial, sans-serif',
              fontSize: 30,
              lineHeight: 1.45,
              maxWidth: 760,
              color: palette.textMuted,
            }}
          >
            Turn technical debt findings into product launches, social clips and polished release visuals.
          </div>
        </div>

        <div
          style={{
            ...rowStyle,
            opacity: cardOpacity,
            transform: `translateY(${cardTranslate}px)`,
          }}
        >
          <div style={statCardStyle}>
            <div style={{fontFamily: 'Arial, sans-serif', fontSize: 24, color: palette.textMuted}}>
              Confidence signal
            </div>
            <div style={{marginTop: 18, fontSize: 74, lineHeight: 1, color: palette.cyan}}>97%</div>
            <div
              style={{
                marginTop: 18,
                fontFamily: 'Arial, sans-serif',
                fontSize: 28,
                lineHeight: 1.35,
                color: palette.textMuted,
              }}
            >
              Translate repo insights into message-ready visuals for launch week.
            </div>
          </div>

          <div style={{...statCardStyle, display: 'flex', flexDirection: 'column', justifyContent: 'space-between'}}>
            <div style={{fontFamily: 'Arial, sans-serif', fontSize: 24, color: palette.textMuted}}>
              Motion system
            </div>

            <div style={{display: 'flex', alignItems: 'flex-end', gap: 16, height: 240}}>
              <SignalBar color={palette.coral} delay={0} frame={frame} />
              <SignalBar color={palette.mint} delay={6} frame={frame} />
              <SignalBar color={palette.cyan} delay={12} frame={frame} />
              <SignalBar color={palette.mint} delay={18} frame={frame} />
              <SignalBar color={palette.coral} delay={24} frame={frame} />
            </div>
          </div>
        </div>

        <Sequence from={72}>
          <div
            style={{
              marginTop: 'auto',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              gap: 24,
              padding: '28px 34px',
              borderRadius: 26,
              border: `1px solid ${palette.panelBorder}`,
              background: 'rgba(6, 16, 29, 0.7)',
              fontFamily: 'Arial, sans-serif',
            }}
          >
            <div style={{fontSize: 28, color: palette.textMuted}}>Preview in Studio. Render when the story is ready.</div>
            <div style={{fontSize: 32, color: palette.text}}>npm run video:studio</div>
          </div>
        </Sequence>
      </div>
    </AbsoluteFill>
  );
};
