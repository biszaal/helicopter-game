import { Canvas, Fill, Rect } from '@shopify/react-native-skia';
import { StyleSheet, useWindowDimensions } from 'react-native';
import { GestureDetector } from 'react-native-gesture-handler';
import { useDerivedValue, type SharedValue } from 'react-native-reanimated';
import { config } from '../config';
import { useGameLoop } from '../engine/useGameLoop';
import { useThrustGesture } from '../input/useThrustGesture';

// Cosmetic only — everything gameplay-relevant lives in config.ts.
const COLORS = {
  background: '#20242b',
  stripe: '#2a303a',
  helicopter: '#a7b0bb',
};

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

export function GameScreen() {
  const { width, height } = useWindowDimensions();
  const { renderY, renderScrollX, thrusting } = useGameLoop();
  const gesture = useThrustGesture(thrusting);

  const spriteWidth = height * config.helicopter.spriteSize.width;
  const spriteHeight = height * config.helicopter.spriteSize.height;
  const heliX = width * config.helicopter.fixedXRatio - spriteWidth / 2;
  const heliY = useDerivedValue(
    () => renderY.value * height - spriteHeight / 2,
  );

  const tileWidth = height * config.world.backgroundTileRatio;
  const stripeCount = Math.ceil(width / (2 * tileWidth)) + 1;

  return (
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
        <Rect
          x={heliX}
          y={heliY}
          width={spriteWidth}
          height={spriteHeight}
          color={COLORS.helicopter}
        />
      </Canvas>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  canvas: {
    flex: 1,
  },
});
