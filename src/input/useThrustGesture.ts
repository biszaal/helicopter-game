import { useMemo } from 'react';
import { Gesture } from 'react-native-gesture-handler';
import type { SharedValue } from 'react-native-reanimated';

/**
 * Full-screen touch → thrust. A Manual gesture so the callbacks run as
 * worklets on the UI thread — no JS-thread hop between thumb and physics.
 * Tap and hold to ascend, release to fall.
 */
export function useThrustGesture(thrusting: SharedValue<boolean>) {
  return useMemo(
    () =>
      Gesture.Manual()
        .onTouchesDown((_event, manager) => {
          thrusting.value = true;
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
    [thrusting],
  );
}
