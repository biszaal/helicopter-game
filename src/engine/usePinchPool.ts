import { useSharedValue, type SharedValue } from 'react-native-reanimated';
import { config } from '../config';

/**
 * One pooled pinch: a stretch of tunnel where both walls bulge inward,
 * leaving a corridor. Geometrically a wide stalactite shelf (top spur) plus
 * a wide stalagmite shelf (bottom spur) sharing an x span.
 */
export interface PinchSlot {
  /** 1 while this slot is live in the world. */
  active: SharedValue<number>;
  /** Left edge of the pinch span, world-space shu. */
  worldX: SharedValue<number>;
  /** Horizontal length of the span (shu). */
  length: SharedValue<number>;
  /** Top spur length, measured down from y = 0. */
  topLen: SharedValue<number>;
  /** Bottom spur length, measured up from y = 1. */
  botLen: SharedValue<number>;
  /** 1 once the helicopter has passed this pinch in the current run. */
  cleared: SharedValue<number>;
  /** Graze candidates for each spur while passing through. */
  armedTop: SharedValue<number>;
  armedBottom: SharedValue<number>;
}

export function usePinchPool(): PinchSlot[] {
  const slots: PinchSlot[] = [];
  // Hook-in-loop is safe here: poolSize is a compile-time config constant.
  for (let i = 0; i < config.pinch.poolSize; i++) {
    // eslint-disable-next-line react-hooks/rules-of-hooks
    slots.push({
      active: useSharedValue(0),
      worldX: useSharedValue(0),
      length: useSharedValue(0),
      topLen: useSharedValue(0),
      botLen: useSharedValue(0),
      cleared: useSharedValue(0),
      armedTop: useSharedValue(0),
      armedBottom: useSharedValue(0),
    });
  }
  return slots;
}
