import {
  Group,
  LinearGradient,
  Path,
  vec,
} from '@shopify/react-native-skia';
import { useDerivedValue, type SharedValue } from 'react-native-reanimated';
import { type RockSlot } from '../engine/useRockPool';
import { makeRockPaths, ROCK_VARIANTS } from './shapes';

/** Built once at load — the renderer only ever picks from these. */
const ROCK_PATHS = makeRockPaths();

interface RockProps {
  slot: RockSlot;
  screenHeight: number;
  renderScrollX: SharedValue<number>;
  /** Zone-crossfaded [lit, dark] fill, derived once by GameScreen. */
  fill: SharedValue<string[]>;
}

/**
 * A free-floating rock: an irregular silhouette fitted to the slot's hitbox
 * rect. The outline is inscribed in the rect (never larger), so combined
 * with the helicopter's hitbox margin, collisions always look deserved.
 */
export function Rock({ slot, screenHeight, renderScrollX, fill }: RockProps) {
  const transform = useDerivedValue(() => {
    if (slot.active.value === 0) {
      return [{ translateX: -2 * screenHeight }];
    }
    const screenX = slot.worldX.value - renderScrollX.value;
    return [
      { translateX: (screenX - slot.halfW.value) * screenHeight },
      { translateY: (slot.centerY.value - slot.halfH.value) * screenHeight },
      { scaleX: 2 * slot.halfW.value * screenHeight },
      { scaleY: 2 * slot.halfH.value * screenHeight },
    ];
  });
  const path = useDerivedValue(() => {
    const variant = Math.min(
      ROCK_VARIANTS - 1,
      Math.floor(slot.seed.value * ROCK_VARIANTS),
    );
    return ROCK_PATHS[variant];
  });
  return (
    <Group transform={transform}>
      <Path path={path}>
        <LinearGradient
          start={vec(0.1, 0.05)}
          end={vec(0.9, 1)}
          colors={fill}
        />
      </Path>
    </Group>
  );
}
