import { Group, Path } from '@shopify/react-native-skia';
import { useMemo } from 'react';
import {
  useDerivedValue,
  type DerivedValue,
  type SharedValue,
} from 'react-native-reanimated';
import {
  makeCityscapePaths,
  makeCrystalPaths,
  makeMountainPaths,
} from './shapes';
import { theme } from './theme';
import { useZoneLayerOpacity, type ZoneBlend } from './zonePalette';

type SceneryEntry = (typeof theme.scenery)[number];
type SceneryKind = Exclude<SceneryEntry, { kind: 'none' }>;

/** Parked x for invisible copies — off-canvas, so Skia culls them cheaply. */
const OFFSCREEN_X = -100000;

interface SceneryProps {
  width: number;
  height: number;
  renderScrollX: SharedValue<number>;
  wallClockMs: SharedValue<number>;
  /** Omitted on menu screens — only zone 0 ('none') is active there, so the
   * whole scenery tree stays parked. */
  zoneBlend?: ZoneBlend;
}

interface CopyProps {
  index: number;
  tileWidth: number;
  speed: number;
  screenHeight: number;
  mirrored: boolean;
  renderScrollX: SharedValue<number>;
  opacity: DerivedValue<number>;
  children: React.ReactNode;
}

/** One wrap-scrolling copy of a scenery tile — RidgeCopy's transform math,
 * plus off-screen parking whenever the zone's crossfade opacity is 0. */
function SceneryCopy({
  index,
  tileWidth,
  speed,
  screenHeight,
  mirrored,
  renderScrollX,
  opacity,
  children,
}: CopyProps) {
  const transform = useDerivedValue(() => {
    if (opacity.value <= 0) return [{ translateX: OFFSCREEN_X }];
    const scrollPx = renderScrollX.value * screenHeight * speed;
    const tx = index * tileWidth - (scrollPx % tileWidth);
    return mirrored
      ? [{ translateX: tx }, { translateY: screenHeight }, { scaleY: -1 }]
      : [{ translateX: tx }];
  });
  return (
    <Group transform={transform} opacity={opacity}>
      {children}
    </Group>
  );
}

/** The scenery tile content for one zone (paths built once at mount). */
function TileContent({
  spec,
  tileWidth,
  maxHeight,
  seed,
  wallClockMs,
}: {
  spec: SceneryKind;
  tileWidth: number;
  maxHeight: number;
  seed: number;
  wallClockMs: SharedValue<number>;
}) {
  const paths = useMemo(() => {
    switch (spec.kind) {
      case 'mountains':
        return { kind: 'mountains' as const, ...makeMountainPaths(tileWidth, maxHeight, seed) };
      case 'city':
        return { kind: 'city' as const, ...makeCityscapePaths(tileWidth, maxHeight, seed) };
      case 'crystals':
        return { kind: 'crystals' as const, ...makeCrystalPaths(tileWidth, maxHeight, seed) };
    }
  }, [spec, tileWidth, maxHeight, seed]);

  // Window flicker: one derived opacity per group, a slow sine off the wall
  // clock (subtle 0.55 ↔ 1.0 — city lights breathing, not blinking).
  const periods =
    spec.kind === 'city' ? spec.windows.flickerPeriodsMs : ([] as number[]);
  const flicker0 = useWindowFlicker(wallClockMs, periods[0] ?? 1000, 0);
  const flicker1 = useWindowFlicker(wallClockMs, periods[1] ?? 1000, 2.1);
  const flicker2 = useWindowFlicker(wallClockMs, periods[2] ?? 1000, 4.2);

  if (paths.kind === 'mountains' && spec.kind === 'mountains') {
    return (
      <>
        <Path path={paths.silhouette} color={spec.color} />
        <Path path={paths.caps} color={spec.capColor} />
      </>
    );
  }
  if (paths.kind === 'city' && spec.kind === 'city') {
    const flickers = [flicker0, flicker1, flicker2];
    return (
      <>
        <Path path={paths.silhouette} color={spec.color} />
        {paths.windowGroups.map((group, i) => (
          <Path
            key={i}
            path={group}
            color={spec.windows.color}
            opacity={flickers[i % flickers.length]}
          />
        ))}
      </>
    );
  }
  if (paths.kind === 'crystals' && spec.kind === 'crystals') {
    return (
      <>
        <Path path={paths.shards} color={spec.color} />
        <Path path={paths.glints} color={spec.glintColor} />
      </>
    );
  }
  return null;
}

function useWindowFlicker(
  wallClockMs: SharedValue<number>,
  periodMs: number,
  phase: number,
): DerivedValue<number> {
  return useDerivedValue(() => {
    const s = Math.sin((wallClockMs.value / periodMs) * Math.PI * 2 + phase);
    return 0.55 + 0.45 * (0.5 + 0.5 * s);
  });
}

/** One zone's scenery layer: all wrap copies, crossfaded by zone. */
function SceneryZone({
  zoneIdx,
  spec,
  width,
  height,
  renderScrollX,
  wallClockMs,
  zoneBlend,
}: SceneryProps & { zoneIdx: number; spec: SceneryKind }) {
  const opacity = useZoneLayerOpacity(zoneBlend, zoneIdx);
  const tileWidth = spec.tileWidth * height;
  const maxHeight = spec.maxHeight * height;
  const copies = Math.ceil(width / tileWidth) + 1;
  const sides =
    spec.anchor === 'both'
      ? ([false, true] as const)
      : ([spec.anchor === 'bottom'] as const);
  return (
    <>
      {sides.map((mirrored) =>
        Array.from({ length: copies }, (_, i) => (
          <SceneryCopy
            key={`${mirrored}-${i}`}
            index={i}
            tileWidth={tileWidth}
            speed={spec.speed}
            screenHeight={height}
            mirrored={mirrored}
            renderScrollX={renderScrollX}
            opacity={opacity}
          >
            <TileContent
              spec={spec}
              tileWidth={tileWidth}
              maxHeight={maxHeight}
              // Different seeds per side so ceiling and floor crystals differ.
              seed={300 + zoneIdx * 31 + (mirrored ? 7 : 0)}
              wallClockMs={wallClockMs}
            />
          </SceneryCopy>
        )),
      )}
    </>
  );
}

/**
 * Distance-based backdrop scenery: mountains in THE DRIFT, a dark lit-window
 * skyline in THE WALLS, crystal shards in THE DEEP. All zones stay mounted
 * for the whole run (zone changes happen on the UI thread); inactive layers
 * are parked off-screen at opacity 0 and crossfade in/out at boundaries
 * using the same clock as the palette.
 */
export function Scenery(props: SceneryProps) {
  return (
    <>
      {theme.scenery.map((spec, zoneIdx) =>
        spec.kind === 'none' ? null : (
          <SceneryZone key={zoneIdx} zoneIdx={zoneIdx} spec={spec} {...props} />
        ),
      )}
    </>
  );
}
