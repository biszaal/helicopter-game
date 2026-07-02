import {
  Canvas,
  Fill,
  matchFont,
  Rect,
  Text as SkiaText,
} from '@shopify/react-native-skia';
import { useState } from 'react';
import {
  Platform,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { GestureDetector } from 'react-native-gesture-handler';
import {
  runOnJS,
  useAnimatedReaction,
  useDerivedValue,
  type SharedValue,
} from 'react-native-reanimated';
import { config } from '../config';
import {
  PHASE_DEAD,
  PHASE_PLAYING,
  useGameLoop,
} from '../engine/useGameLoop';
import { type PinchSlot } from '../engine/usePinchPool';
import { type RockSlot } from '../engine/useRockPool';
import { useSteerGesture } from '../input/useSteerGesture';

// Cosmetic only — everything gameplay-relevant lives in config.ts.
const COLORS = {
  background: '#20242b',
  stripe: '#2a303a',
  rock: '#454e5c',
  helicopter: '#a7b0bb',
  hud: '#dce3ec',
};

const fontFamily = Platform.select({ ios: 'Helvetica', default: 'sans-serif' });
const scoreFont = matchFont({ fontFamily, fontSize: 34, fontWeight: 'bold' });
const multiplierFont = matchFont({ fontFamily, fontSize: 24, fontWeight: 'bold' });
const distanceFont = matchFont({ fontFamily, fontSize: 15, fontWeight: 'bold' });
const AMBER = '#ffb648';

interface StripeProps {
  index: number;
  tileWidth: number;
  screenHeight: number;
  renderScrollX: SharedValue<number>;
}

/**
 * One background stripe. Stripes sit on every other tile, so the repeating
 * pattern is two tiles wide and the scroll offset wraps at 2 × tileWidth.
 */
function Stripe({ index, tileWidth, screenHeight, renderScrollX }: StripeProps) {
  const patternWidth = 2 * tileWidth;
  const x = useDerivedValue(() => {
    const scrollPx = renderScrollX.value * screenHeight;
    return index * patternWidth - (scrollPx % patternWidth);
  });
  return (
    <Rect
      x={x}
      y={0}
      width={tileWidth}
      height={screenHeight}
      color={COLORS.stripe}
    />
  );
}

interface RockProps {
  slot: RockSlot;
  screenHeight: number;
  renderScrollX: SharedValue<number>;
}

/** A free-floating rock. Inactive slots park offscreen. */
function Rock({ slot, screenHeight, renderScrollX }: RockProps) {
  const x = useDerivedValue(() => {
    if (slot.active.value === 0) return -screenHeight;
    const screenX = slot.worldX.value - renderScrollX.value;
    return (screenX - slot.halfW.value) * screenHeight;
  });
  const y = useDerivedValue(
    () => (slot.centerY.value - slot.halfH.value) * screenHeight,
  );
  const w = useDerivedValue(() => 2 * slot.halfW.value * screenHeight);
  const h = useDerivedValue(() => 2 * slot.halfH.value * screenHeight);
  return <Rect x={x} y={y} width={w} height={h} color={COLORS.rock} />;
}

interface PinchProps {
  slot: PinchSlot;
  screenHeight: number;
  renderScrollX: SharedValue<number>;
}

/** A narrow stretch of tunnel: top + bottom wall shelves with a corridor. */
function Pinch({ slot, screenHeight, renderScrollX }: PinchProps) {
  const x = useDerivedValue(() => {
    if (slot.active.value === 0) return -screenHeight;
    return (slot.worldX.value - renderScrollX.value) * screenHeight;
  });
  const w = useDerivedValue(() => slot.length.value * screenHeight);
  const topH = useDerivedValue(() => slot.topLen.value * screenHeight);
  const botY = useDerivedValue(
    () => (1 - slot.botLen.value) * screenHeight,
  );
  const botH = useDerivedValue(() => slot.botLen.value * screenHeight);
  return (
    <>
      <Rect x={x} y={0} width={w} height={topH} color={COLORS.rock} />
      <Rect x={x} y={botY} width={w} height={botH} color={COLORS.rock} />
    </>
  );
}

export function GameScreen() {
  const { width, height } = useWindowDimensions();
  const loop = useGameLoop(width / height);
  const gesture = useSteerGesture(loop, height);
  const {
    renderY,
    renderScrollX,
    scrollX,
    phase,
    score,
    tierIndex,
    decayTimer,
    decayThreshold,
    rocks,
    pinches,
  } = loop;

  const [gameOver, setGameOver] = useState<{
    score: number;
    distance: number;
  } | null>(null);

  useAnimatedReaction(
    () => phase.value,
    (current, previous) => {
      if (current === PHASE_DEAD && previous !== PHASE_DEAD) {
        runOnJS(setGameOver)({
          score: Math.floor(score.value),
          distance: Math.floor(scrollX.value * config.scoring.metersPerShu),
        });
      } else if (current === PHASE_PLAYING && previous === PHASE_DEAD) {
        runOnJS(setGameOver)(null);
      }
    },
  );

  const spriteWidth = height * config.helicopter.spriteSize.width;
  const spriteHeight = height * config.helicopter.spriteSize.height;
  const heliX = width * config.helicopter.fixedXRatio - spriteWidth / 2;
  const heliY = useDerivedValue(
    () => renderY.value * height - spriteHeight / 2,
  );

  const tileWidth = height * config.world.backgroundTileRatio;
  const stripeCount = Math.ceil(width / (2 * tileWidth)) + 1;
  const wallPx = height * config.world.wallThickness;

  // HUD layout (cosmetic) — a left-aligned column under the top wall.
  const hudX = width * 0.06;
  const hudTop = height * 0.09;
  const barMaxWidth = width * 0.24;
  const barY = hudTop + 44;
  const barHeight = 5;

  const scoreText = useDerivedValue(() => `${Math.floor(score.value)}`);
  const multiplierText = useDerivedValue(
    () => `×${config.graze.multiplierTiers[tierIndex.value]}`,
  );
  // Cooling bar: time left before the multiplier steps down one tier.
  const barWidth = useDerivedValue(() => {
    if (tierIndex.value === 0) return 0;
    const remaining = 1 - decayTimer.value / decayThreshold.value;
    return Math.max(0, remaining) * barMaxWidth;
  });
  const distanceText = useDerivedValue(
    () => `${Math.floor(renderScrollX.value * config.scoring.metersPerShu)} m`,
  );

  return (
    <View style={styles.root}>
      <GestureDetector gesture={gesture}>
        <Canvas style={styles.canvas}>
          <Fill color={COLORS.background} />
          {Array.from({ length: stripeCount }, (_, i) => (
            <Stripe
              key={i}
              index={i}
              tileWidth={tileWidth}
              screenHeight={height}
              renderScrollX={renderScrollX}
            />
          ))}
          {rocks.map((slot, i) => (
            <Rock
              key={i}
              slot={slot}
              screenHeight={height}
              renderScrollX={renderScrollX}
            />
          ))}
          {pinches.map((slot, i) => (
            <Pinch
              key={i}
              slot={slot}
              screenHeight={height}
              renderScrollX={renderScrollX}
            />
          ))}
          <Rect x={0} y={0} width={width} height={wallPx} color={COLORS.rock} />
          <Rect
            x={0}
            y={height - wallPx}
            width={width}
            height={wallPx}
            color={COLORS.rock}
          />
          <Rect
            x={heliX}
            y={heliY}
            width={spriteWidth}
            height={spriteHeight}
            color={COLORS.helicopter}
          />
          <SkiaText
            x={hudX}
            y={hudTop}
            text={scoreText}
            font={scoreFont}
            color={COLORS.hud}
          />
          <SkiaText
            x={hudX}
            y={hudTop + 32}
            text={multiplierText}
            font={multiplierFont}
            color={AMBER}
          />
          <Rect
            x={hudX}
            y={barY}
            width={barMaxWidth}
            height={barHeight}
            color={COLORS.stripe}
          />
          <Rect
            x={hudX}
            y={barY}
            width={barWidth}
            height={barHeight}
            color={AMBER}
          />
          <SkiaText
            x={hudX}
            y={barY + 26}
            text={distanceText}
            font={distanceFont}
            color={COLORS.hud}
          />
        </Canvas>
      </GestureDetector>
      {gameOver !== null && (
        <View style={styles.overlay} pointerEvents="none">
          <Text style={styles.overlayTitle}>GAME OVER</Text>
          <Text style={styles.overlayScore}>{gameOver.score}</Text>
          <Text style={styles.overlayDistance}>{gameOver.distance} m</Text>
          <Text style={styles.overlayHint}>TAP TO RETRY</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  canvas: {
    flex: 1,
  },
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(13, 17, 23, 0.72)',
  },
  overlayTitle: {
    color: '#dce3ec',
    fontSize: 30,
    fontWeight: '800',
    letterSpacing: 6,
  },
  overlayScore: {
    color: '#ffb648',
    fontSize: 56,
    fontWeight: '800',
    marginTop: 12,
  },
  overlayDistance: {
    color: '#8a94a3',
    fontSize: 18,
    fontWeight: '600',
    marginTop: 4,
  },
  overlayHint: {
    color: '#8a94a3',
    fontSize: 15,
    fontWeight: '600',
    letterSpacing: 3,
    marginTop: 28,
  },
});
