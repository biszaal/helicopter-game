import {
  Canvas,
  Group,
  matchFont,
  Rect,
  Text as SkiaText,
  vec,
} from '@shopify/react-native-skia';
import { useEffect, useMemo, useState } from 'react';
import {
  BackHandler,
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
  playWhoosh,
  playZoneChime,
  setRotorIntensity,
  startRotor,
  stopRotor,
} from '../audio/sounds';
import { config } from '../config';
import { submitScore } from '../net/leaderboardApi';
import { rampAt } from '../engine/spawning';
import {
  PHASE_DEAD,
  PHASE_PAUSED,
  PHASE_PLAYING,
  useGameLoop,
} from '../engine/useGameLoop';
import { useSteerGesture } from '../input/useSteerGesture';
import { useSettings } from '../state/settings';
import { Background } from './Background';
import { GameButton } from './GameButton';
import { CaveWalls } from './CaveWalls';
import { CrashEffect, useScreenShake } from './CrashEffect';
import { GrazePulse, GrazeSparks } from './GrazeSparks';
import { Helicopter } from './Helicopter';
import { Pinch } from './Pinches';
import { Rock } from './Rocks';
import { getSkin, theme } from './theme';
import { useZoneColor } from './zonePalette';

const fontFamily = Platform.select({ ios: 'Helvetica', default: 'sans-serif' });
const scoreFont = matchFont({ fontFamily, fontSize: 34, fontWeight: 'bold' });
const multiplierFont = matchFont({ fontFamily, fontSize: 24, fontWeight: 'bold' });
const distanceFont = matchFont({ fontFamily, fontSize: 15, fontWeight: 'bold' });

interface GameScreenProps {
  onExitToMenu: () => void;
}

export function GameScreen({ onExitToMenu }: GameScreenProps) {
  const { width, height } = useWindowDimensions();
  const { recordRun, selectedSkin, bestScore, username } = useSettings();
  const skin = getSkin(selectedSkin);
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
    grazeAtMs,
    grazeY,
    grazeSeed,
    elapsed,
    rocks,
    pinches,
  } = loop;

  /** Stable bundle of the shared values the palette crossfade reads. */
  const zoneBlend = useMemo(
    () => ({ zoneIndex, prevZoneIndex, zoneChangedAtMs, wallClockMs }),
    [zoneIndex, prevZoneIndex, zoneChangedAtMs, wallClockMs],
  );

  // Each palette color is derived ONCE here and shared by every consumer —
  // 24 rocks reading one value, not 24 rocks deriving their own copies.
  const bgTop = useZoneColor(zoneBlend, 'backgroundTop');
  const bgBottom = useZoneColor(zoneBlend, 'backgroundBottom');
  const bgColors = useDerivedValue(() => [bgTop.value, bgBottom.value]);
  const ridgeFar = useZoneColor(zoneBlend, 'ridgeFar');
  const ridgeNear = useZoneColor(zoneBlend, 'ridgeNear');
  const wallOuter = useZoneColor(zoneBlend, 'wallOuter');
  const wallInner = useZoneColor(zoneBlend, 'wallInner');
  const wallTopGradient = useDerivedValue(() => [
    wallOuter.value,
    wallInner.value,
  ]);
  const wallBottomGradient = useDerivedValue(() => [
    wallInner.value,
    wallOuter.value,
  ]);
  const rockLit = useZoneColor(zoneBlend, 'rockLit');
  const rockDark = useZoneColor(zoneBlend, 'rockDark');
  const rockFill = useDerivedValue(() => [rockLit.value, rockDark.value]);

  const [gameOver, setGameOver] = useState<{
    score: number;
    distance: number;
    coins: number;
  } | null>(null);
  const [announce, setAnnounce] = useState<{
    name: string;
    meters: number;
  } | null>(null);
  const [paused, setPaused] = useState(false);

  // Pause/resume run on the JS thread (buttons): flipping the phase is all
  // the engine needs — its PHASE_PLAYING guard freezes the world in place.
  const pauseGame = () => {
    if (phase.value !== PHASE_PLAYING) return;
    phase.value = PHASE_PAUSED;
    setPaused(true);
    stopRotor();
  };
  const resumeGame = () => {
    if (phase.value !== PHASE_PAUSED) return;
    phase.value = PHASE_PLAYING;
    setPaused(false);
    startRotor();
  };

  // The rotor runs whenever this screen is up and the helicopter is alive.
  useEffect(() => {
    startRotor();
    return stopRotor;
  }, []);

  // Android back button: a live run pauses; from the pause or game-over
  // overlay it leaves to the menu. It never resumes — a back press must not
  // drop the player straight back into the rocks. pauseGame only reads the
  // stable `phase` shared value, so the listener can't go stale.
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (phase.value === PHASE_PLAYING) pauseGame();
      else onExitToMenu();
      return true;
    });
    return () => sub.remove();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, onExitToMenu]);

  const handleDeath = (finalScore: number, distance: number, runDurationMs: number) => {
    const coins = Math.floor(finalScore / config.coins.pointsPerCoin);
    setGameOver({ score: finalScore, distance, coins });
    stopRotor();
    playCrash();
    hapticCrash();
    // Fire-and-forget: no username claimed yet, or a network failure,
    // should never interrupt the death screen. Checked BEFORE recordRun,
    // which is what actually updates bestScore.
    if (finalScore > bestScore && username !== null) {
      submitScore(finalScore, distance, runDurationMs).catch(() => {});
    }
    recordRun(finalScore, distance, coins);
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
          Math.floor(elapsed.value * 1000),
        );
      } else if (current === PHASE_PLAYING && previous === PHASE_DEAD) {
        runOnJS(handleRetry)();
      }
    },
  );

  // A tier step UP means a graze just banked — a light tick and an air-cut.
  useAnimatedReaction(
    () => tierIndex.value,
    (current, previous) => {
      if (previous !== null && current > previous) {
        runOnJS(hapticGraze)();
        runOnJS(playWhoosh)();
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

  // Rotor volume tracks the scroll-speed ramp. Quantized to 1/20 steps so
  // runOnJS fires every few seconds, never per frame.
  useAnimatedReaction(
    () => {
      const ramp = config.difficulty.scrollSpeed;
      const speed = rampAt(scrollX.value, ramp);
      return Math.round(((speed - ramp.start) / (ramp.cap - ramp.start)) * 20);
    },
    (bucket, previous) => {
      if (previous !== null && bucket !== previous) {
        runOnJS(setRotorIntensity)(bucket / 20);
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
              bgColors={bgColors}
              ridgeFar={ridgeFar}
              ridgeNear={ridgeNear}
              zoneBlend={zoneBlend}
            />
            {/* World layers under the camera zoom; the background stays
                unscaled — it's atmosphere, and parallax hides the seam. */}
            <Group
              transform={[{ scale: theme.camera.zoom }]}
              origin={vec(width / 2, height / 2)}
            >
              {pinches.map((slot, i) => (
                <Pinch
                  key={i}
                  slot={slot}
                  index={i}
                  screenHeight={height}
                  renderScrollX={renderScrollX}
                  color={wallInner}
                />
              ))}
              {rocks.map((slot, i) => (
                <Rock
                  key={i}
                  slot={slot}
                  screenHeight={height}
                  renderScrollX={renderScrollX}
                  fill={rockFill}
                />
              ))}
              <CaveWalls
                width={width}
                height={height}
                renderScrollX={renderScrollX}
                topGradient={wallTopGradient}
                bottomGradient={wallBottomGradient}
                teethColor={wallInner}
              />
              <Helicopter
                centerX={heliCenterX}
                screenHeight={height}
                renderY={renderY}
                velY={velY}
                phase={phase}
                wallClockMs={wallClockMs}
                skin={skin}
              />
              <GrazeSparks
                centerX={heliCenterX}
                screenHeight={height}
                grazeY={grazeY}
                grazeSeed={grazeSeed}
                grazeAtMs={grazeAtMs}
                wallClockMs={wallClockMs}
              />
              <CrashEffect
                centerX={heliCenterX}
                screenHeight={height}
                renderY={renderY}
                crashT={crashT}
              />
            </Group>
          </Group>
          <GrazePulse
            width={width}
            height={height}
            tierIndex={tierIndex}
            grazeAtMs={grazeAtMs}
            wallClockMs={wallClockMs}
          />
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
      {gameOver === null && !paused && (
        <View
          style={[
            styles.pauseButton,
            { top: height * 0.055, right: width * 0.05 },
          ]}
        >
          <GameButton
            label="PAUSE"
            variant="secondary"
            compact
            onPress={pauseGame}
          />
        </View>
      )}
      {paused && (
        <Animated.View style={styles.overlay} entering={FadeIn.duration(150)}>
          <View style={styles.overlayPanel}>
            <Text style={styles.overlayTitle}>PAUSED</Text>
            <View style={styles.overlayMenuButton}>
              <GameButton label="RESUME" onPress={resumeGame} />
            </View>
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
            {gameOver.coins > 0 && (
              <Text style={styles.overlayCoins}>+{gameOver.coins} COINS</Text>
            )}
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
  pauseButton: {
    position: 'absolute',
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
  overlayCoins: {
    color: theme.colors.coinGold,
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 2,
    marginTop: 10,
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
