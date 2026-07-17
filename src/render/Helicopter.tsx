import {
  BlurMask,
  Circle,
  Group,
  LinearGradient,
  Path,
  vec,
} from '@shopify/react-native-skia';
import { useMemo } from 'react';
import { useDerivedValue, type SharedValue } from 'react-native-reanimated';
import { config } from '../config';
import { PHASE_DEAD } from '../engine/useGameLoop';
import { makeHelicopterPaths } from './shapes';
import { theme, type SkinColors } from './theme';

interface HelicopterProps {
  /** Fixed x of the helicopter centre (px). */
  centerX: number;
  screenHeight: number;
  renderY: SharedValue<number>;
  velY: SharedValue<number>;
  phase: SharedValue<number>;
  wallClockMs: SharedValue<number>;
  /** Equipped skin palette; defaults to the classic look. */
  skin?: SkinColors;
}

/**
 * The vector helicopter. Pitches nose-down when diving and nose-up when
 * climbing (driven by the spring velocity), spins its rotors off the wall
 * clock, blinks a nav light, and throws a searchlight cone ahead. Hidden
 * the instant the run ends — the crash effect takes over.
 */
export function Helicopter({
  centerX,
  screenHeight,
  renderY,
  velY,
  phase,
  wallClockMs,
  skin = theme.heliSkins.classic,
}: HelicopterProps) {
  const w = screenHeight * config.helicopter.spriteSize.width;
  const h = screenHeight * config.helicopter.spriteSize.height;
  const paths = useMemo(() => makeHelicopterPaths(w, h), [w, h]);

  const { tiltPerVelocity, tiltMax, forwardLean } = theme.helicopter;
  const transform = useDerivedValue(() => {
    const pitch = velY.value * tiltPerVelocity;
    const clamped = Math.min(tiltMax, Math.max(-tiltMax, pitch));
    return [
      { translateX: centerX },
      { translateY: renderY.value * screenHeight },
      { rotate: clamped + forwardLean },
    ];
  });
  const opacity = useDerivedValue(() =>
    phase.value === PHASE_DEAD ? 0 : 1,
  );

  const rotorTransform = useDerivedValue(() => [
    { translateX: paths.rotorHub.x },
    { translateY: paths.rotorHub.y },
    { scaleX: Math.cos(wallClockMs.value * theme.helicopter.rotorSpeed) },
  ]);
  const tailRotorTransform = useDerivedValue(() => [
    { translateX: paths.tailHub.x },
    { translateY: paths.tailHub.y },
    { rotate: wallClockMs.value * theme.helicopter.tailRotorSpeed },
  ]);
  const navOpacity = useDerivedValue(() => {
    const { blinkPeriodMs, blinkOnFraction } = theme.helicopter;
    return wallClockMs.value % blinkPeriodMs < blinkPeriodMs * blinkOnFraction
      ? 1
      : 0.15;
  });

  return (
    <Group transform={transform} opacity={opacity}>
      <Path path={paths.searchlight}>
        <LinearGradient
          start={vec(0.42 * w, 0)}
          end={vec(2.9 * w, 0)}
          colors={[skin.searchlight, 'transparent']}
        />
      </Path>
      <Path
        path={paths.skids}
        style="stroke"
        strokeWidth={Math.max(1.5, 0.08 * h)}
        strokeCap="round"
        color={skin.heliBodyBottom}
      />
      <Path path={paths.mast} color={skin.heliBodyBottom} />
      <Path path={paths.body}>
        <LinearGradient
          start={vec(0, -0.5 * h)}
          end={vec(0, 0.5 * h)}
          colors={[skin.heliBodyTop, skin.heliBodyBottom]}
        />
      </Path>
      <Path path={paths.canopy} color={skin.canopyGlow} opacity={0.9}>
        <BlurMask blur={3} style="solid" />
      </Path>
      <Group
        transform={[
          { translateX: paths.rotorHub.x },
          { translateY: paths.rotorHub.y },
        ]}
      >
        <Path
          path={paths.rotorDisc}
          color={skin.heliRotor}
          opacity={0.12}
        />
      </Group>
      <Group transform={rotorTransform}>
        <Path
          path={paths.rotorBlade}
          color={skin.heliRotor}
          opacity={0.85}
        />
      </Group>
      <Group transform={tailRotorTransform}>
        <Path
          path={paths.tailRotorBlade}
          color={skin.heliRotor}
          opacity={0.8}
        />
      </Group>
      <Circle
        cx={paths.navLight.x}
        cy={paths.navLight.y}
        r={Math.max(1.5, 0.06 * h)}
        color={skin.navLight}
        opacity={navOpacity}
      >
        <BlurMask blur={3} style="solid" />
      </Circle>
    </Group>
  );
}
