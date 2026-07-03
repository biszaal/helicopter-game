import {
  Circle,
  Group,
  LinearGradient,
  Path,
  Rect,
  vec,
  type SkPath,
} from '@shopify/react-native-skia';
import { useMemo } from 'react';
import { useDerivedValue, type SharedValue } from 'react-native-reanimated';
import { makeRidgePath } from './shapes';
import { theme } from './theme';
import { useZoneColor, type ZoneBlend } from './zonePalette';

interface BackgroundProps {
  width: number;
  height: number;
  renderScrollX: SharedValue<number>;
  wallClockMs: SharedValue<number>;
  /** Omitted on menu screens — the backdrop stays in the first zone. */
  zoneBlend?: ZoneBlend;
}

interface RidgeCopyProps {
  path: SkPath;
  index: number;
  tileWidth: number;
  speed: number;
  color: SharedValue<string> | string;
  height: number;
  mirrored: boolean;
  renderScrollX: SharedValue<number>;
  screenHeight: number;
}

/** One wrap-scrolling copy of a ridge silhouette tile. */
function RidgeCopy({
  path,
  index,
  tileWidth,
  speed,
  color,
  height,
  mirrored,
  renderScrollX,
  screenHeight,
}: RidgeCopyProps) {
  const transform = useDerivedValue(() => {
    const scrollPx = renderScrollX.value * screenHeight * speed;
    const tx = index * tileWidth - (scrollPx % tileWidth);
    return mirrored
      ? [{ translateX: tx }, { translateY: height }, { scaleY: -1 }]
      : [{ translateX: tx }];
  });
  return (
    <Group transform={transform}>
      <Path path={path} color={color} />
    </Group>
  );
}

interface DustMote {
  x: number;
  y: number;
  r: number;
  phase: number;
  freq: number;
}

function Mote({
  mote,
  width,
  height,
  renderScrollX,
  wallClockMs,
}: {
  mote: DustMote;
  width: number;
  height: number;
  renderScrollX: SharedValue<number>;
  wallClockMs: SharedValue<number>;
}) {
  const margin = 24;
  const span = width + 2 * margin;
  const cx = useDerivedValue(() => {
    const scrollPx =
      renderScrollX.value * height * theme.background.dustScrollFactor;
    const raw = (mote.x * span - scrollPx) % span;
    return ((raw + span) % span) - margin;
  });
  const cy = useDerivedValue(
    () =>
      mote.y * height +
      Math.sin((wallClockMs.value / 1000) * mote.freq + mote.phase) * 14,
  );
  return <Circle cx={cx} cy={cy} r={mote.r} color={theme.colors.dust} />;
}

/** Deep-cave backdrop: gradient, two parallax ridge layers, drifting dust. */
export function Background({
  width,
  height,
  renderScrollX,
  wallClockMs,
  zoneBlend,
}: BackgroundProps) {
  const bgTop = useZoneColor(zoneBlend, 'backgroundTop');
  const bgBottom = useZoneColor(zoneBlend, 'backgroundBottom');
  const bgColors = useDerivedValue(() => [bgTop.value, bgBottom.value]);
  const ridgeFar = useZoneColor(zoneBlend, 'ridgeFar');
  const ridgeNear = useZoneColor(zoneBlend, 'ridgeNear');

  const layers = useMemo(
    () =>
      theme.background.layers.map((layer, li) => {
        const tileWidth = layer.tileWidth * height;
        const maxHeight = layer.maxHeight * height;
        return {
          ...layer,
          tileWidth,
          copies: Math.ceil(width / tileWidth) + 1,
          topPath: makeRidgePath(tileWidth, maxHeight, 40 + li * 17),
          bottomPath: makeRidgePath(tileWidth, maxHeight, 90 + li * 23),
        };
      }),
    [width, height],
  );

  const motes = useMemo<DustMote[]>(
    () =>
      Array.from({ length: theme.background.dustCount }, () => ({
        x: Math.random(),
        y: 0.1 + Math.random() * 0.8,
        r: 1 + Math.random() * 2,
        phase: Math.random() * Math.PI * 2,
        freq: 0.25 + Math.random() * 0.4,
      })),
    [],
  );

  return (
    <>
      <Rect x={0} y={0} width={width} height={height}>
        <LinearGradient start={vec(0, 0)} end={vec(0, height)} colors={bgColors} />
      </Rect>
      {layers.map((layer, li) =>
        Array.from({ length: layer.copies }, (_, i) => (
          <Group key={`${li}-${i}`}>
            <RidgeCopy
              path={layer.topPath}
              index={i}
              tileWidth={layer.tileWidth}
              speed={layer.speed}
              color={li === 0 ? ridgeFar : ridgeNear}
              height={height}
              mirrored={false}
              renderScrollX={renderScrollX}
              screenHeight={height}
            />
            <RidgeCopy
              path={layer.bottomPath}
              index={i}
              tileWidth={layer.tileWidth}
              speed={layer.speed}
              color={li === 0 ? ridgeFar : ridgeNear}
              height={height}
              mirrored
              renderScrollX={renderScrollX}
              screenHeight={height}
            />
          </Group>
        )),
      )}
      {motes.map((mote, i) => (
        <Mote
          key={i}
          mote={mote}
          width={width}
          height={height}
          renderScrollX={renderScrollX}
          wallClockMs={wallClockMs}
        />
      ))}
    </>
  );
}
