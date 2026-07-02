import { useMemo } from 'react';
import { Gesture } from 'react-native-gesture-handler';
import { useSharedValue } from 'react-native-reanimated';
import { config } from '../config';
import {
  MS_PER_SECOND,
  PHASE_DEAD,
  type GameLoop,
} from '../engine/useGameLoop';

/**
 * Drag-offset steering, worklet callbacks on the UI thread.
 *
 * Touch anywhere: the helicopter's current altitude is "grabbed"; vertical
 * finger travel moves the target altitude by the same screen fraction
 * (× steerSensitivity) and the helicopter spring-chases it. Release keeps
 * the target where it is — the helicopter settles and flies dead straight.
 * A tap while dead retries (after the lockout).
 */
export function useSteerGesture(loop: GameLoop, screenHeightPx: number) {
  const { targetY, posY, phase, wallClockMs, deathAtMs, resetRun } = loop;
  const grabPointerY = useSharedValue(0);
  const grabTargetY = useSharedValue(0);

  return useMemo(
    () =>
      Gesture.Pan()
        .minDistance(0)
        .maxPointers(1)
        .onBegin((event) => {
          if (phase.value === PHASE_DEAD) {
            const lockoutMs = config.ui.retryLockoutSeconds * MS_PER_SECOND;
            if (wallClockMs.value - deathAtMs.value >= lockoutMs) {
              resetRun();
            }
          }
          grabPointerY.value = event.absoluteY;
          grabTargetY.value = posY.value;
        })
        .onUpdate((event) => {
          const fingerTravel =
            (event.absoluteY - grabPointerY.value) / screenHeightPx;
          const raw =
            grabTargetY.value + fingerTravel * config.physics.steerSensitivity;
          // Keep the target inside the tunnel so a big drag can't park it
          // inside a wall — spring overshoot can still clip one, though.
          const half = config.helicopter.spriteSize.height / 2;
          const minTarget = config.world.wallThickness + half;
          const maxTarget = 1 - config.world.wallThickness - half;
          targetY.value =
            raw < minTarget ? minTarget : raw > maxTarget ? maxTarget : raw;
        }),
    [
      targetY,
      posY,
      phase,
      wallClockMs,
      deathAtMs,
      resetRun,
      grabPointerY,
      grabTargetY,
      screenHeightPx,
    ],
  );
}
