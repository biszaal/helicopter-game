import { useSharedValue, type SharedValue } from 'react-native-reanimated';
import { config } from '../config';

/**
 * One pooled free-floating rock. Slots are reused — nothing is allocated
 * while the game runs.
 */
export interface RockSlot {
  /** 1 while this slot is live in the world. */
  active: SharedValue<number>;
  /** Rock centre x, world-space shu (scroll subtracts from it). */
  worldX: SharedValue<number>;
  /** Rock centre y (shu from the top). */
  centerY: SharedValue<number>;
  /** Half extents (shu) — per-rock random size, grows over a run. */
  halfW: SharedValue<number>;
  halfH: SharedValue<number>;
  /** 1 once the helicopter has passed this rock in the current run. */
  cleared: SharedValue<number>;
  /** 1 if the hitbox entered this rock's graze band while passing. */
  armed: SharedValue<number>;
}

export function useRockPool(): RockSlot[] {
  const slots: RockSlot[] = [];
  // Hook-in-loop is safe here: poolSize is a compile-time config constant,
  // so the hook count is identical on every render.
  for (let i = 0; i < config.obstacles.poolSize; i++) {
    // eslint-disable-next-line react-hooks/rules-of-hooks
    slots.push({
      active: useSharedValue(0),
      worldX: useSharedValue(0),
      centerY: useSharedValue(0),
      halfW: useSharedValue(0),
      halfH: useSharedValue(0),
      cleared: useSharedValue(0),
      armed: useSharedValue(0),
    });
  }
  return slots;
}
