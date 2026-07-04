import {
  Group,
  LinearGradient,
  Path,
  Rect,
  vec,
  type SkPath,
} from '@shopify/react-native-skia';
import { useMemo } from 'react';
import { useDerivedValue, type SharedValue } from 'react-native-reanimated';
import { config } from '../config';
import { makeToothEdgePath } from './shapes';
import { theme } from './theme';

interface CaveWallsProps {
  width: number;
  height: number;
  renderScrollX: SharedValue<number>;
  /** Zone-crossfaded colors, derived once by GameScreen. */
  topGradient: SharedValue<string[]>;
  bottomGradient: SharedValue<string[]>;
  teethColor: SharedValue<string>;
}

interface TeethCopyProps {
  path: SkPath;
  index: number;
  tileWidth: number;
  /** y of the collision line the teeth hang off. */
  edgeY: number;
  mirrored: boolean;
  renderScrollX: SharedValue<number>;
  screenHeight: number;
  color: SharedValue<string>;
}

/** One wrap-scrolling tile of teeth along a wall's collision edge. */
function TeethCopy({
  path,
  index,
  tileWidth,
  edgeY,
  mirrored,
  renderScrollX,
  screenHeight,
  color,
}: TeethCopyProps) {
  const transform = useDerivedValue(() => {
    const scrollPx = renderScrollX.value * screenHeight;
    const tx = index * tileWidth - (scrollPx % tileWidth);
    return mirrored
      ? [{ translateX: tx }, { translateY: edgeY }, { scaleY: -1 }]
      : [{ translateX: tx }, { translateY: edgeY }];
  });
  return (
    <Group transform={transform}>
      <Path path={path} color={color} />
    </Group>
  );
}

/**
 * The top/bottom cave walls. The solid body covers exactly the collision
 * band (config.world.wallThickness); the jagged teeth protrude PAST the
 * collision line into the playfield and are purely cosmetic — brushing a
 * tooth tip is a survivable close call, never an invisible death.
 */
export function CaveWalls({
  width,
  height,
  renderScrollX,
  topGradient,
  bottomGradient,
  teethColor,
}: CaveWallsProps) {
  const wallPx = height * config.world.wallThickness;
  const toothDepth = theme.walls.toothDepth * height;
  const tileWidth = theme.walls.tileWidth * height;
  const copies = Math.ceil(width / tileWidth) + 1;

  const topTeeth = useMemo(
    () => makeToothEdgePath(tileWidth, toothDepth, 7),
    [tileWidth, toothDepth],
  );
  const bottomTeeth = useMemo(
    () => makeToothEdgePath(tileWidth, toothDepth, 31),
    [tileWidth, toothDepth],
  );

  return (
    <>
      <Rect x={0} y={0} width={width} height={wallPx}>
        <LinearGradient
          start={vec(0, 0)}
          end={vec(0, wallPx)}
          colors={topGradient}
        />
      </Rect>
      <Rect x={0} y={height - wallPx} width={width} height={wallPx}>
        <LinearGradient
          start={vec(0, height - wallPx)}
          end={vec(0, height)}
          colors={bottomGradient}
        />
      </Rect>
      {Array.from({ length: copies }, (_, i) => (
        <Group key={i}>
          <TeethCopy
            path={topTeeth}
            index={i}
            tileWidth={tileWidth}
            edgeY={wallPx}
            mirrored={false}
            renderScrollX={renderScrollX}
            screenHeight={height}
            color={teethColor}
          />
          <TeethCopy
            path={bottomTeeth}
            index={i}
            tileWidth={tileWidth}
            edgeY={height - wallPx}
            mirrored
            renderScrollX={renderScrollX}
            screenHeight={height}
            color={teethColor}
          />
        </Group>
      ))}
    </>
  );
}
