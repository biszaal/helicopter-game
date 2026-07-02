import { useSharedValue, type SharedValue } from 'react-native-reanimated';
import { config } from '../config';

/**
 * One pooled obstacle: a stalactite (from the top) + stalagmite (from the
 * bottom) sharing an x position, leaving a flying gap between them.
 * Slots are reused — nothing is allocated while the game runs.
 */
export interface ObstacleSlot {
  /** 1 while this slot is live in the world. */
  active: SharedValue<number>;
  /** Centre of the rock column, world-space shu (scroll subtracts from it). */
  worldX: SharedValue<number>;
  /** Stalactite length, measured down from y = 0. */
  topLen: SharedValue<number>;
  /** Stalagmite length, measured up from y = 1. */
  botLen: SharedValue<number>;
  /** 1 once the helicopter has passed this column in the current run. */
  cleared: SharedValue<number>;
  /** 1 if the hitbox entered the stalactite's graze band while passing. */
  armedTop: SharedValue<number>;
  /** 1 if the hitbox entered the stalagmite's graze band while passing. */
  armedBottom: SharedValue<number>;
}

export function useObstaclePool(): ObstacleSlot[] {
  const slots: ObstacleSlot[] = [];
  // Hook-in-loop is safe here: poolSize is a compile-time config constant,
  // so the hook count is identical on every render.
  for (let i = 0; i < config.obstacles.poolSize; i++) {
    // eslint-disable-next-line react-hooks/rules-of-hooks
    slots.push({
      active: useSharedValue(0),
      worldX: useSharedValue(0),
      topLen: useSharedValue(0),
      botLen: useSharedValue(0),
      cleared: useSharedValue(0),
      armedTop: useSharedValue(0),
      armedBottom: useSharedValue(0),
    });
  }
  return slots;
}
