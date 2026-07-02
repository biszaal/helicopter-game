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
import { type ObstacleSlot } from '../engine/useObstaclePool';
import { useThrustGesture } from '../input/useThrustGesture';

// Cosmetic only — everything gameplay-relevant lives in config.ts.
const COLORS = {
  background: '#20242b',
  stripe: '#2a303a',
  rock: '#454e5c',
  helicopter: '#a7b0bb',
  hud: '#dce3ec',
};

const fontFamily = Platform.select({ ios: 'Helvetica', default: 'sans-serif' });
const hudFont = matchFont({ fontFamily, fontSize: 22, fontWeight: 'bold' });

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

interface ObstacleProps {
  slot: ObstacleSlot;
  screenHeight: number;
  renderScrollX: SharedValue<number>;
}

/** A stalactite/stalagmite pair. Inactive slots park offscreen. */
function Obstacle({ slot, screenHeight, renderScrollX }: ObstacleProps) {
  const widthPx = config.obstacles.width * screenHeight;
  const x = useDerivedValue(() => {
    if (slot.active.value === 0) return -2 * widthPx;
    const screenX = slot.worldX.value - renderScrollX.value;
    return screenX * screenHeight - widthPx / 2;
  });
  const topHeight = useDerivedValue(() => slot.topLen.value * screenHeight);
  const botY = useDerivedValue(() => (1 - slot.botLen.value) * screenHeight);
  const botHeight = useDerivedValue(() => slot.botLen.value * screenHeight);
  return (
    <>
      <Rect x={x} y={0} width={widthPx} height={topHeight} color={COLORS.rock} />
      <Rect x={x} y={botY} width={widthPx} height={botHeight} color={COLORS.rock} />
    </>
  );
}

export function GameScreen() {
  const { width, height } = useWindowDimensions();
  const loop = useGameLoop(width / height);
  const gesture = useThrustGesture(loop);
  const { renderY, renderScrollX, scrollX, phase, slots } = loop;

  const [gameOver, setGameOver] = useState<{ distance: number } | null>(null);

  useAnimatedReaction(
    () => phase.value,
    (current, previous) => {
      if (current === PHASE_DEAD && previous !== PHASE_DEAD) {
        runOnJS(setGameOver)({
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
          {slots.map((slot, i) => (
            <Obstacle
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
            x={width * 0.06}
            y={height * 0.09}
            text={distanceText}
            font={hudFont}
            color={COLORS.hud}
          />
        </Canvas>
      </GestureDetector>
      {gameOver !== null && (
        <View style={styles.overlay} pointerEvents="none">
          <Text style={styles.overlayTitle}>GAME OVER</Text>
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
  overlayDistance: {
    color: '#ffb648',
    fontSize: 52,
    fontWeight: '800',
    marginTop: 12,
  },
  overlayHint: {
    color: '#8a94a3',
    fontSize: 15,
    fontWeight: '600',
    letterSpacing: 3,
    marginTop: 28,
  },
});
