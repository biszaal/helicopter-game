import { Group, Path, Rect } from '@shopify/react-native-skia';
import { useMemo } from 'react';
import { useDerivedValue, type SharedValue } from 'react-native-reanimated';
import { config } from '../config';
import { type PinchSlot } from '../engine/usePinchPool';
import { makeToothEdgePath } from './shapes';
import { theme } from './theme';

interface PinchProps {
  slot: PinchSlot;
  /** Stable slot index — picks which tooth-edge variant this pinch uses. */
  index: number;
  screenHeight: number;
  renderScrollX: SharedValue<number>;
}

/**
 * A pinch: top + bottom wall shelves squeezing the tunnel. The solid rects
 * cover exactly the colliding spans; jagged teeth hang past the corridor
 * boundary and are cosmetic only (safe side — visually narrower than lethal
 * is never allowed, visually scarier is).
 */
export function Pinch({ slot, index, screenHeight, renderScrollX }: PinchProps) {
  const lengthPx = config.pinch.lengthShu * screenHeight;
  const toothDepth = theme.walls.toothDepth * screenHeight;
  const teeth = useMemo(
    () => makeToothEdgePath(lengthPx, toothDepth, 101 + (index % 2) * 57),
    [lengthPx, toothDepth, index],
  );

  const x = useDerivedValue(() => {
    if (slot.active.value === 0) return -2 * screenHeight;
    return (slot.worldX.value - renderScrollX.value) * screenHeight;
  });
  const w = useDerivedValue(() => slot.length.value * screenHeight);
  const topH = useDerivedValue(() => slot.topLen.value * screenHeight);
  const botY = useDerivedValue(
    () => (1 - slot.botLen.value) * screenHeight,
  );
  const botH = useDerivedValue(() => slot.botLen.value * screenHeight);

  const topTeethTransform = useDerivedValue(() => [
    { translateX: x.value },
    { translateY: topH.value },
  ]);
  const bottomTeethTransform = useDerivedValue(() => [
    { translateX: x.value },
    { translateY: botY.value },
    { scaleY: -1 },
  ]);

  return (
    <>
      <Rect x={x} y={0} width={w} height={topH} color={theme.colors.wallInner} />
      <Rect x={x} y={botY} width={w} height={botH} color={theme.colors.wallInner} />
      <Group transform={topTeethTransform}>
        <Path path={teeth} color={theme.colors.wallInner} />
      </Group>
      <Group transform={bottomTeethTransform}>
        <Path path={teeth} color={theme.colors.wallInner} />
      </Group>
    </>
  );
}
