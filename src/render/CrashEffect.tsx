import { BlurMask, Circle, Group, Rect } from '@shopify/react-native-skia';
import { useDerivedValue, type SharedValue } from 'react-native-reanimated';
import { mulberry32 } from './shapes';
import { theme } from './theme';

/**
 * Everything here is a pure function of crashT — the seconds elapsed since
 * death (negative while flying). The engine freezes the world at the fatal
 * physics step but keeps wallClockMs ticking, so the explosion plays out
 * over a frozen scene with no extra animation loop and no allocations.
 */

interface ShardSeed {
  angle: number;
  speed: number;
  size: number;
  spin: number;
  amber: boolean;
}

const SHARD_SEEDS: ShardSeed[] = (() => {
  const rng = mulberry32(777);
  return Array.from({ length: theme.crash.shardCount }, () => ({
    // Bias upward — debris blown into the air reads better than a flat burst.
    angle: rng() * Math.PI * 2 * 0.75 - Math.PI * 0.875,
    speed: 0.3 + rng() * 0.5,
    size: 0.008 + rng() * 0.014,
    spin: (rng() - 0.5) * 16,
    amber: rng() < 0.35,
  }));
})();

interface CrashEffectProps {
  /** Helicopter centre x (px) — the explosion origin. */
  centerX: number;
  screenHeight: number;
  /** Frozen at the death pose while the phase is dead. */
  renderY: SharedValue<number>;
  /** Seconds since death; negative while playing. */
  crashT: SharedValue<number>;
}

function Shard({
  seed,
  centerX,
  screenHeight,
  renderY,
  crashT,
}: CrashEffectProps & { seed: ShardSeed }) {
  const { shardLifetime, shardGravity } = theme.crash;
  const size = seed.size * screenHeight;
  const transform = useDerivedValue(() => {
    const t = crashT.value;
    if (t < 0 || t > shardLifetime) {
      return [{ translateX: -2 * screenHeight }];
    }
    const x = centerX + Math.cos(seed.angle) * seed.speed * t * screenHeight;
    const y =
      renderY.value * screenHeight +
      Math.sin(seed.angle) * seed.speed * t * screenHeight +
      0.5 * shardGravity * t * t * screenHeight;
    return [{ translateX: x }, { translateY: y }, { rotate: seed.spin * t }];
  });
  const opacity = useDerivedValue(() => {
    const t = crashT.value;
    if (t < 0 || t > shardLifetime) return 0;
    return 1 - t / shardLifetime;
  });
  return (
    <Group transform={transform} opacity={opacity}>
      <Rect
        x={-size / 2}
        y={-size / 2}
        width={size}
        height={size}
        color={seed.amber ? theme.colors.debrisAmber : theme.colors.debrisMetal}
      />
    </Group>
  );
}

function SmokePuff({
  index,
  centerX,
  screenHeight,
  renderY,
  crashT,
}: CrashEffectProps & { index: number }) {
  const delay = index * 0.09;
  const lifetime = 1.4;
  const cx = useDerivedValue(() => {
    const t = crashT.value - delay;
    if (t < 0) return -2 * screenHeight;
    return centerX - t * screenHeight * 0.02 * index;
  });
  const cy = useDerivedValue(() => {
    const t = crashT.value - delay;
    if (t < 0) return 0;
    return (
      renderY.value * screenHeight - t * screenHeight * 0.06 * (1 + 0.25 * index)
    );
  });
  const r = useDerivedValue(() => {
    const t = crashT.value - delay;
    if (t < 0) return 0;
    return screenHeight * (0.012 + t * 0.05 * (1 + 0.3 * index));
  });
  const opacity = useDerivedValue(() => {
    const t = crashT.value - delay;
    if (t < 0 || t > lifetime) return 0;
    return 0.32 * (1 - t / lifetime);
  });
  return (
    <Circle cx={cx} cy={cy} r={r} color={theme.colors.smoke} opacity={opacity}>
      <BlurMask blur={8} style="normal" />
    </Circle>
  );
}

/** Flash + debris shards + smoke at the crash site. */
export function CrashEffect(props: CrashEffectProps) {
  const { centerX, screenHeight, renderY, crashT } = props;
  const { flashDuration, flashGrowth, smokeCount } = theme.crash;

  const flashY = useDerivedValue(() => renderY.value * screenHeight);
  const flashR = useDerivedValue(() => {
    const t = crashT.value;
    if (t < 0 || t > flashDuration) return 0;
    return 6 + t * flashGrowth * screenHeight;
  });
  const flashOpacity = useDerivedValue(() => {
    const t = crashT.value;
    if (t < 0 || t > flashDuration) return 0;
    return 0.9 * (1 - t / flashDuration);
  });

  return (
    <>
      {Array.from({ length: smokeCount }, (_, i) => (
        <SmokePuff key={i} index={i} {...props} />
      ))}
      {SHARD_SEEDS.map((seed, i) => (
        <Shard key={i} seed={seed} {...props} />
      ))}
      <Circle
        cx={centerX}
        cy={flashY}
        r={flashR}
        color={theme.colors.flash}
        opacity={flashOpacity}
      >
        <BlurMask blur={12} style="solid" />
      </Circle>
    </>
  );
}

/**
 * Decaying-sinusoid screen shake, applied to the whole world group in the
 * first instants after a crash.
 */
export function useScreenShake(crashT: SharedValue<number>) {
  const { shakeDuration, shakeAmplitude, shakeFreqX, shakeFreqY, shakeDecay } =
    theme.crash;
  return useDerivedValue(() => {
    const t = crashT.value;
    if (t < 0 || t > shakeDuration) {
      return [{ translateX: 0 }, { translateY: 0 }];
    }
    const amp = shakeAmplitude * Math.exp(-t * shakeDecay);
    return [
      { translateX: Math.sin(t * shakeFreqX) * amp },
      { translateY: Math.cos(t * shakeFreqY) * amp * 0.7 },
    ];
  });
}
