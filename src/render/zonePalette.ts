import {
  interpolateColor,
  useDerivedValue,
  type DerivedValue,
  type SharedValue,
} from 'react-native-reanimated';
import { theme } from './theme';

/** Everything a component needs to crossfade palettes at a zone boundary. */
export interface ZoneBlend {
  zoneIndex: SharedValue<number>;
  prevZoneIndex: SharedValue<number>;
  zoneChangedAtMs: SharedValue<number>;
  wallClockMs: SharedValue<number>;
}

export type ZonePaletteKey = keyof (typeof theme.zones)[number];

/**
 * Crossfaded palette color — a pure function of wallClock − zoneChangedAt
 * (CrashEffect philosophy: no timers, no extra loops). Without a blend
 * (menu screens) it returns the first zone's color, statically.
 */
export function useZoneColor(
  blend: ZoneBlend | undefined,
  key: ZonePaletteKey,
): DerivedValue<string> {
  return useDerivedValue(() => {
    if (blend === undefined) return theme.zones[0][key];
    const from = theme.zones[blend.prevZoneIndex.value][key];
    const to = theme.zones[blend.zoneIndex.value][key];
    if (blend.zoneChangedAtMs.value === 0 || from === to) return to;
    const t = (blend.wallClockMs.value - blend.zoneChangedAtMs.value) / 1000;
    const p = t / theme.zoneTransitionSeconds;
    if (p >= 1) return to;
    return interpolateColor(Math.max(0, p), [0, 1], [from, to]);
  });
}
