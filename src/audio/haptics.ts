import * as Haptics from 'expo-haptics';

/**
 * Haptic feedback, gated by a module-level flag synced from settings (same
 * pattern as sounds.ts) so UI-thread handlers can fire-and-forget.
 */

let hapticsOn = true;

export function setHapticsEnabled(on: boolean): void {
  hapticsOn = on;
}

/** Button presses. */
export function hapticSelect(): void {
  if (!hapticsOn) return;
  Haptics.selectionAsync().catch(() => {});
}

/** Multiplier tier-up: a light tick for shaving past a rock. */
export function hapticGraze(): void {
  if (!hapticsOn) return;
  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
}

/** Death. */
export function hapticCrash(): void {
  if (!hapticsOn) return;
  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy).catch(() => {});
}
