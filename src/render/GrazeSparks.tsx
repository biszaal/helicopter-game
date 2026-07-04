import { Circle, RadialGradient, Rect, vec } from '@shopify/react-native-skia';
import { useDerivedValue, type SharedValue } from 'react-native-reanimated';
import { mulberry32 } from './shapes';
import { theme } from './theme';

/**
 * Graze feedback, CrashEffect-style: everything is a pure function of
 * wallClockMs − grazeAtMs (0 = no graze yet this run). No timers, no
 * allocation — sparks park off-screen between bursts.
 */

interface SparkSeed {
  /** Offset (rad) from straight-back within the fan. */
  angleOff: number;
  speed: number;
  size: number;
  flicker: number;
}

const SPARK_SEEDS: SparkSeed[] = (() => {
  const { count, spread, speedMin, speedMax, sizeMin, sizeMax } = theme.sparks;
  const rng = mulberry32(1234);
  return Array.from({ length: count }, () => ({
    angleOff: (rng() - 0.5) * 2 * spread,
    speed: speedMin + rng() * (speedMax - speedMin),
    size: sizeMin + rng() * (sizeMax - sizeMin),
    flicker: 0.7 + rng() * 0.3,
  }));
})();

interface GrazeSparksProps {
  /** Helicopter centre x (px) — the burst origin. */
  centerX: number;
  screenHeight: number;
  /** Helicopter centre y (shu) frozen at the bank moment. */
  grazeY: SharedValue<number>;
  /** 0..1 per-burst seed — twists the fan so bursts don't repeat. */
  grazeSeed: SharedValue<number>;
  grazeAtMs: SharedValue<number>;
  wallClockMs: SharedValue<number>;
}

function Spark({
  seed,
  centerX,
  screenHeight,
  grazeY,
  grazeSeed,
  grazeAtMs,
  wallClockMs,
}: GrazeSparksProps & { seed: SparkSeed }) {
  const { lifetime } = theme.sparks;
  const cx = useDerivedValue(() => {
    if (grazeAtMs.value === 0) return -2 * screenHeight;
    const t = (wallClockMs.value - grazeAtMs.value) / 1000;
    if (t < 0 || t > lifetime) return -2 * screenHeight;
    const angle = Math.PI + seed.angleOff + (grazeSeed.value - 0.5) * 0.6;
    return centerX + Math.cos(angle) * seed.speed * t * screenHeight;
  });
  const cy = useDerivedValue(() => {
    if (grazeAtMs.value === 0) return 0;
    const t = (wallClockMs.value - grazeAtMs.value) / 1000;
    if (t < 0 || t > lifetime) return 0;
    const angle = Math.PI + seed.angleOff + (grazeSeed.value - 0.5) * 0.6;
    return (
      grazeY.value * screenHeight +
      Math.sin(angle) * seed.speed * t * screenHeight
    );
  });
  const opacity = useDerivedValue(() => {
    if (grazeAtMs.value === 0) return 0;
    const t = (wallClockMs.value - grazeAtMs.value) / 1000;
    if (t < 0 || t > lifetime) return 0;
    return seed.flicker * (1 - t / lifetime);
  });
  return (
    <Circle
      cx={cx}
      cy={cy}
      r={seed.size * screenHeight}
      color={theme.colors.amber}
      opacity={opacity}
    />
  );
}

/** Amber spark fan streaking backward off the helicopter on a banked graze. */
export function GrazeSparks(props: GrazeSparksProps) {
  return (
    <>
      {SPARK_SEEDS.map((seed, i) => (
        <Spark key={i} seed={seed} {...props} />
      ))}
    </>
  );
}

interface GrazePulseProps {
  width: number;
  height: number;
  tierIndex: SharedValue<number>;
  grazeAtMs: SharedValue<number>;
  wallClockMs: SharedValue<number>;
}

/**
 * A screen-edge amber vignette that pulses on each bank once the multiplier
 * is high — the cave itself glows with the streak. Static gradient, only the
 * opacity animates.
 */
export function GrazePulse({
  width,
  height,
  tierIndex,
  grazeAtMs,
  wallClockMs,
}: GrazePulseProps) {
  const { minTierIndex, inSeconds, outSeconds, maxOpacity } = theme.grazePulse;
  const opacity = useDerivedValue(() => {
    if (tierIndex.value < minTierIndex || grazeAtMs.value === 0) return 0;
    const t = (wallClockMs.value - grazeAtMs.value) / 1000;
    if (t < 0 || t > inSeconds + outSeconds) return 0;
    return t < inSeconds
      ? (t / inSeconds) * maxOpacity
      : maxOpacity * (1 - (t - inSeconds) / outSeconds);
  });
  return (
    <Rect x={0} y={0} width={width} height={height} opacity={opacity}>
      <RadialGradient
        c={vec(width / 2, height / 2)}
        r={0.75 * Math.max(width, height)}
        colors={['rgba(255, 182, 72, 0)', 'rgba(255, 182, 72, 0.55)']}
        positions={[0.55, 1]}
      />
    </Rect>
  );
}
