import { useSharedValue, type SharedValue } from 'react-native-reanimated';
import { config } from '../config';

/**
 * One pooled coin. Slots are reused — nothing is allocated while the game
 * runs.
 */
export interface CoinSlot {
  /** 1 while this slot is live in the world (including during the pop). */
  active: SharedValue<number>;
  /** Coin centre x, world-space shu (scroll subtracts from it). */
  worldX: SharedValue<number>;
  /** Coin centre y (shu from the top). */
  centerY: SharedValue<number>;
  /** Wallet value (1 trail, 5 risk) — also picks the risk look. */
  value: SharedValue<number>;
  /** Wall clock (ms) when collected; 0 while collectable. Drives the pop;
   * the engine retires the slot after config.events.coinPopSeconds. */
  collectedAtMs: SharedValue<number>;
  /** Cosmetic random seed (0..1) set at spawn. Never read by gameplay. */
  seed: SharedValue<number>;
}

export function useCoinPool(): CoinSlot[] {
  const slots: CoinSlot[] = [];
  // Hook-in-loop is safe here: poolSize is a compile-time config constant,
  // so the hook count is identical on every render.
  for (let i = 0; i < config.coins.poolSize; i++) {
    // eslint-disable-next-line react-hooks/rules-of-hooks
    slots.push({
      active: useSharedValue(0),
      worldX: useSharedValue(0),
      centerY: useSharedValue(0),
      value: useSharedValue(1),
      collectedAtMs: useSharedValue(0),
      seed: useSharedValue(0),
    });
  }
  return slots;
}
