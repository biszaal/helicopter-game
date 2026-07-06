import { Circle, Group } from '@shopify/react-native-skia';
import { useDerivedValue, type SharedValue } from 'react-native-reanimated';
import { config } from '../config';
import { type CoinSlot } from '../engine/useCoinPool';
import { theme } from './theme';

interface CoinProps {
  slot: CoinSlot;
  screenHeight: number;
  renderScrollX: SharedValue<number>;
  wallClockMs: SharedValue<number>;
}

/**
 * One pooled coin: gold disc with a glint highlight (bigger and amber when
 * it's a risk coin), scaling up and fading when collected — a pure function
 * of wallClockMs − collectedAtMs, retired by the engine's pop window.
 * Parked off-screen while its slot is inactive.
 */
export function Coin({
  slot,
  screenHeight,
  renderScrollX,
  wallClockMs,
}: CoinProps) {
  const rPx = config.coins.radius * screenHeight;
  const popSeconds = config.events.coinPopSeconds;

  const transform = useDerivedValue(() => {
    if (slot.active.value === 0) {
      return [{ translateX: -2 * screenHeight }];
    }
    const sizeScale = slot.value.value > 1 ? theme.coins.riskSizeScale : 1;
    let pop = 1;
    if (slot.collectedAtMs.value !== 0) {
      const t =
        (wallClockMs.value - slot.collectedAtMs.value) / 1000 / popSeconds;
      pop = 1 + (theme.coins.popScale - 1) * Math.min(1, Math.max(0, t));
    }
    return [
      { translateX: (slot.worldX.value - renderScrollX.value) * screenHeight },
      { translateY: slot.centerY.value * screenHeight },
      { scale: sizeScale * pop },
    ];
  });
  const opacity = useDerivedValue(() => {
    if (slot.active.value === 0) return 0;
    if (slot.collectedAtMs.value === 0) return 1;
    const t =
      (wallClockMs.value - slot.collectedAtMs.value) / 1000 / popSeconds;
    return Math.max(0, 1 - t);
  });
  const color = useDerivedValue(() =>
    slot.value.value > 1 ? theme.colors.amber : theme.coins.gold,
  );

  return (
    <Group transform={transform} opacity={opacity}>
      <Circle cx={0} cy={0} r={rPx} color={color} />
      <Circle
        cx={-rPx * 0.3}
        cy={-rPx * 0.3}
        r={rPx * 0.35}
        color={theme.coins.highlight}
      />
    </Group>
  );
}
