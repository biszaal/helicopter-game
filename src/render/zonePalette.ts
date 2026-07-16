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

/**
 * Crossfaded visibility of one zone's scenery layer — same clock and window
 * as useZoneColor: the active zone's layer fades in over the transition,
 * the previous zone's fades out, everything else sits at 0. Without a blend
 * (menu screens) only zone 0 is visible.
 */
export function useZoneLayerOpacity(
  blend: ZoneBlend | undefined,
  zoneIdx: number,
): DerivedValue<number> {
  return useDerivedValue(() => {
    if (blend === undefined) return zoneIdx === 0 ? 1 : 0;
    const active = blend.zoneIndex.value;
    if (blend.zoneChangedAtMs.value === 0) return zoneIdx === active ? 1 : 0;
    const t = (blend.wallClockMs.value - blend.zoneChangedAtMs.value) / 1000;
    const p = Math.min(1, Math.max(0, t / theme.zoneTransitionSeconds));
    if (zoneIdx === active) return p;
    if (zoneIdx === blend.prevZoneIndex.value) return 1 - p;
    return 0;
  });
}
