import {
  Canvas,
  Group,
  matchFont,
  Rect,
  Text as SkiaText,
} from '@shopify/react-native-skia';
import { useEffect, useMemo, useState } from 'react';
import {
  Platform,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  FadeIn,
  runOnJS,
  useAnimatedReaction,
  useAnimatedStyle,
  useDerivedValue,
} from 'react-native-reanimated';
import { hapticCrash, hapticGraze, hapticZone } from '../audio/haptics';
import {
  playCrash,
  playZoneChime,
  startRotor,
  stopRotor,
} from '../audio/sounds';
import { config } from '../config';
import {
  PHASE_DEAD,
  PHASE_PLAYING,
  useGameLoop,
} from '../engine/useGameLoop';
import { useSteerGesture } from '../input/useSteerGesture';
import { useSettings } from '../state/settings';
import { Background } from './Background';
import { GameButton } from './GameButton';
import { CaveWalls } from './CaveWalls';
import { CrashEffect, useScreenShake } from './CrashEffect';
import { Helicopter } from './Helicopter';
import { Pinch } from './Pinches';
import { Rock } from './Rocks';
import { theme } from './theme';

const fontFamily = Platform.select({ ios: 'Helvetica', default: 'sans-serif' });
const scoreFont = matchFont({ fontFamily, fontSize: 34, fontWeight: 'bold' });
const multiplierFont = matchFont({ fontFamily, fontSize: 24, fontWeight: 'bold' });
const distanceFont = matchFont({ fontFamily, fontSize: 15, fontWeight: 'bold' });

interface GameScreenProps {
  onExitToMenu: () => void;
}

export function GameScreen({ onExitToMenu }: GameScreenProps) {
  const { width, height } = useWindowDimensions();
  const { recordRun } = useSettings();
  const loop = useGameLoop(width / height);
  const gesture = useSteerGesture(loop, height);
  const {
    renderY,
    renderScrollX,
    scrollX,
    velY,
    phase,
    score,
    tierIndex,
    decayTimer,
    decayThreshold,
    wallClockMs,
    deathAtMs,
    zoneIndex,
    zoneChangedAtMs,
    prevZoneIndex,
    rocks,
    pinches,
  } = loop;

  /** Stable bundle of the shared values the palette crossfade reads. */
  const zoneBlend = useMemo(
    () => ({ zoneIndex, prevZoneIndex, zoneChangedAtMs, wallClockMs }),
    [zoneIndex, prevZoneIndex, zoneChangedAtMs, wallClockMs],
  );

  const [gameOver, setGameOver] = useState<{
    score: number;
    distance: number;
  } | null>(null);
  const [announce, setAnnounce] = useState<{
    name: string;
    meters: number;
  } | null>(null);

  // The rotor runs whenever this screen is up and the helicopter is alive.
  useEffect(() => {
    startRotor();
    return stopRotor;
  }, []);

  const handleDeath = (finalScore: number, distance: number) => {
    setGameOver({ score: finalScore, distance });
    stopRotor();
    playCrash();
    hapticCrash();
    recordRun(finalScore, distance);
  };
  const handleRetry = () => {
    setGameOver(null);
    startRotor();
  };

  useAnimatedReaction(
    () => phase.value,
    (current, previous) => {
      if (current === PHASE_DEAD && previous !== PHASE_DEAD) {
        runOnJS(handleDeath)(
          Math.floor(score.value),
          Math.floor(scrollX.value * config.scoring.metersPerShu),
        );
      } else if (current === PHASE_PLAYING && previous === PHASE_DEAD) {
        runOnJS(handleRetry)();
      }
    },
  );

  // A tier step UP means a graze just banked — reward it with a light tick.
  useAnimatedReaction(
    () => tierIndex.value,
    (current, previous) => {
      if (previous !== null && current > previous) {
        runOnJS(hapticGraze)();
      }
    },
  );

  // Zone milestone: announce it, chime, thump. `current > previous` keeps
  // the reset back to zone 0 on retry silent.
  const handleZoneChange = (zone: number) => {
    setAnnounce({
      name: config.zones[zone].name,
      meters: config.zones[zone].atMeters,
    });
    playZoneChime();
    hapticZone();
  };
  useAnimatedReaction(
    () => zoneIndex.value,
    (current, previous) => {
      if (previous !== null && current > previous) {
        runOnJS(handleZoneChange)(current);
      }
    },
  );

  // Announcement opacity — a pure function of the wall clock, no timers.
  const announceStyle = useAnimatedStyle(() => {
    const a = theme.zoneAnnounce;
    if (zoneChangedAtMs.value === 0) return { opacity: 0 };
    const t = (wallClockMs.value - zoneChangedAtMs.value) / 1000;
    let opacity = 0;
    if (t >= 0 && t < a.fadeInSeconds) {
      opacity = t / a.fadeInSeconds;
    } else if (t < a.fadeInSeconds + a.holdSeconds) {
      opacity = 1;
    } else if (t < a.fadeInSeconds + a.holdSeconds + a.fadeOutSeconds) {
      opacity = 1 - (t - a.fadeInSeconds - a.holdSeconds) / a.fadeOutSeconds;
    }
    return { opacity };
  });

  const heliCenterX = width * config.helicopter.fixedXRatio;

  /** Seconds since death — negative while flying. Drives crash + shake. */
  const crashT = useDerivedValue(() =>
    phase.value === PHASE_DEAD
      ? (wallClockMs.value - deathAtMs.value) / 1000
      : -1,
  );
  const shakeTransform = useScreenShake(crashT);

  // HUD layout (cosmetic) — a left-aligned column under the top wall.
  const hudX = width * 0.06;
  const hudTop = height * 0.09;
  const barMaxWidth = width * 0.24;
  const barY = hudTop + 44;
  const barHeight = 5;

  const scoreText = useDerivedValue(() => `${Math.floor(score.value)}`);
  const multiplierText = useDerivedValue(
    () => `×${config.graze.multiplierTiers[tierIndex.value]}`,
  );
  // Cooling bar: time left before the multiplier steps down one tier.
  const barWidth = useDerivedValue(() => {
    if (tierIndex.value === 0) return 0;
    const remaining = 1 - decayTimer.value / decayThreshold.value;
    return Math.max(0, remaining) * barMaxWidth;
  });
  const distanceText = useDerivedValue(
    () => `${Math.floor(renderScrollX.value * config.scoring.metersPerShu)} m`,
  );
  const zoneText = useDerivedValue(() => config.zones[zoneIndex.value].name);

  return (
    <View style={styles.root}>
      <GestureDetector gesture={gesture}>
        <Canvas style={styles.canvas}>
          <Group transform={shakeTransform}>
            <Background
              width={width}
              height={height}
              renderScrollX={renderScrollX}
              wallClockMs={wallClockMs}
              zoneBlend={zoneBlend}
            />
            {pinches.map((slot, i) => (
              <Pinch
                key={i}
                slot={slot}
                index={i}
                screenHeight={height}
                renderScrollX={renderScrollX}
                zoneBlend={zoneBlend}
              />
            ))}
            {rocks.map((slot, i) => (
              <Rock
                key={i}
                slot={slot}
                screenHeight={height}
                renderScrollX={renderScrollX}
                zoneBlend={zoneBlend}
              />
            ))}
            <CaveWalls
              width={width}
              height={height}
              renderScrollX={renderScrollX}
              zoneBlend={zoneBlend}
            />
            <Helicopter
              centerX={heliCenterX}
              screenHeight={height}
              renderY={renderY}
              velY={velY}
              phase={phase}
              wallClockMs={wallClockMs}
            />
            <CrashEffect
              centerX={heliCenterX}
              screenHeight={height}
              renderY={renderY}
              crashT={crashT}
            />
          </Group>
          <SkiaText
            x={hudX}
            y={hudTop}
            text={scoreText}
            font={scoreFont}
            color={theme.colors.hud}
          />
          <SkiaText
            x={hudX}
            y={hudTop + 32}
            text={multiplierText}
            font={multiplierFont}
            color={theme.colors.amber}
          />
          <Rect
            x={hudX}
            y={barY}
            width={barMaxWidth}
            height={barHeight}
            color={theme.colors.wallInner}
          />
          <Rect
            x={hudX}
            y={barY}
            width={barWidth}
            height={barHeight}
            color={theme.colors.amber}
          />
          <SkiaText
            x={hudX}
            y={barY + 26}
            text={distanceText}
            font={distanceFont}
            color={theme.colors.hud}
          />
          <SkiaText
            x={hudX}
            y={barY + 46}
            text={zoneText}
            font={distanceFont}
            color={theme.colors.hud}
          />
        </Canvas>
      </GestureDetector>
      {announce !== null && (
        <Animated.View
          style={[styles.announce, announceStyle]}
          pointerEvents="none"
        >
          <Text style={styles.announceName}>{announce.name}</Text>
          <Text style={styles.announceMeters}>{announce.meters} m</Text>
        </Animated.View>
      )}
      {gameOver !== null && (
        <Animated.View
          style={styles.overlay}
          pointerEvents="box-none"
          entering={FadeIn.delay(theme.crash.overlayDelayMs).duration(
            theme.crash.overlayFadeMs,
          )}
        >
          <View style={styles.overlayPanel} pointerEvents="box-none">
            <Text style={styles.overlayTitle}>GAME OVER</Text>
            <Text style={styles.overlayScore}>{gameOver.score}</Text>
            <Text style={styles.overlayDistance}>{gameOver.distance} m</Text>
            <Text style={styles.overlayHint}>TAP TO RETRY</Text>
            <View style={styles.overlayMenuButton}>
              <GameButton
                label="MENU"
                variant="secondary"
                compact
                onPress={onExitToMenu}
              />
            </View>
          </View>
        </Animated.View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: theme.colors.backgroundTop,
  },
  canvas: {
    flex: 1,
  },
  announce: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  announceName: {
    color: '#dce3ec',
    fontSize: 28,
    fontWeight: '800',
    letterSpacing: 8,
  },
  announceMeters: {
    color: '#ffb648',
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: 3,
    marginTop: 6,
  },
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(7, 9, 13, 0.6)',
  },
  overlayPanel: {
    alignItems: 'center',
    paddingVertical: 36,
    paddingHorizontal: 48,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(255, 182, 72, 0.25)',
    backgroundColor: 'rgba(14, 19, 27, 0.85)',
  },
  overlayTitle: {
    color: '#dce3ec',
    fontSize: 30,
    fontWeight: '800',
    letterSpacing: 6,
  },
  overlayScore: {
    color: '#ffb648',
    fontSize: 56,
    fontWeight: '800',
    marginTop: 12,
  },
  overlayDistance: {
    color: '#8a94a3',
    fontSize: 18,
    fontWeight: '600',
    marginTop: 4,
  },
  overlayHint: {
    color: '#8a94a3',
    fontSize: 15,
    fontWeight: '600',
    letterSpacing: 3,
    marginTop: 28,
  },
  overlayMenuButton: {
    marginTop: 22,
  },
});
