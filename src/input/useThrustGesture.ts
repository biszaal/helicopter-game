import { useMemo } from 'react';
import { Gesture } from 'react-native-gesture-handler';
import { config } from '../config';
import {
  MS_PER_SECOND,
  PHASE_DEAD,
  type GameLoop,
} from '../engine/useGameLoop';

/**
 * Full-screen touch → thrust, and tap → retry once dead. A Manual gesture so
 * the callbacks run as worklets on the UI thread — no JS-thread hop between
 * thumb and physics. Tap and hold to ascend, release to fall.
 */
export function useThrustGesture(loop: GameLoop) {
  const { thrusting, phase, wallClockMs, deathAtMs, resetRun } = loop;
  return useMemo(
    () =>
      Gesture.Manual()
        .onTouchesDown((_event, manager) => {
          if (phase.value === PHASE_DEAD) {
            const lockoutMs = config.ui.retryLockoutSeconds * MS_PER_SECOND;
            if (wallClockMs.value - deathAtMs.value >= lockoutMs) {
              resetRun();
              thrusting.value = true; // holding through the retry tap flies
            }
          } else {
            thrusting.value = true;
          }
          manager.activate();
        })
        .onTouchesUp((_event, manager) => {
          thrusting.value = false;
          manager.end();
        })
        .onTouchesCancelled((_event, manager) => {
          thrusting.value = false;
          manager.fail();
        }),
    [thrusting, phase, wallClockMs, deathAtMs, resetRun],
  );
}
