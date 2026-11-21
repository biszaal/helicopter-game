import { Canvas } from '@shopify/react-native-skia';
import { useEffect, useRef } from 'react';
import { StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import Animated, {
  Easing,
  runOnJS,
  useAnimatedStyle,
  useDerivedValue,
  useFrameCallback,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { PHASE_PLAYING } from '../engine/useGameLoop';
import { useSettings } from '../state/settings';
import { Background } from './Background';
import { Helicopter } from './Helicopter';
import {
  MENU_HELI_SCALE,
  MENU_HELI_X_RATIO,
  MENU_HELI_Y,
} from './MenuScreen';
import { getSkin, theme } from './theme';
import { useColumnFit } from './useColumnFit';

interface LoadingScreenProps {
  /** Flips true when persisted settings have loaded — the real "done". */
  hydrated: boolean;
  /** Called after the fade-out finishes; the parent unmounts us. */
  onDone: () => void;
}

/**
 * Boot overlay shown while settings hydrate. Renders the same cave scene as
 * the menu (same clock math, same helicopter spot, same left column), so
 * when it fades out over the already-mounted menu the only change the eye
 * sees is the loading bar dissolving into the buttons. Stays up at least
 * theme.loading.minDisplayMs so the bar finishes its sweep.
 */
export function LoadingScreen({ hydrated, onDone }: LoadingScreenProps) {
  const { width, height } = useWindowDimensions();
  const fit = useColumnFit(height);
  const { bestScore, bestDistance, totalCoins, selectedSkin } = useSettings();
  const mountedAtMs = useRef(Date.now());

  const clockMs = useSharedValue(0);
  useFrameCallback((frame) => {
    clockMs.value = frame.timestamp;
  });
  // Identical hover to MenuScreen so the crossfade lines up perfectly.
  const scroll = useDerivedValue(() => (clockMs.value / 1000) * 0.05);
  const renderY = useDerivedValue(
    () =>
      (MENU_HELI_Y + Math.sin((clockMs.value / 1000) * 0.8) * 0.018) /
      MENU_HELI_SCALE,
  );
  const velY = useDerivedValue(
    () => Math.cos((clockMs.value / 1000) * 0.8) * 0.3,
  );
  const phase = useSharedValue(PHASE_PLAYING);

  const progress = useSharedValue(0);
  const overlayOpacity = useSharedValue(1);
  useEffect(() => {
    progress.value = withTiming(1, {
      duration: theme.loading.minDisplayMs,
      easing: Easing.out(Easing.cubic),
    });
  }, [progress]);

  useEffect(() => {
    if (!hydrated) return;
    const elapsed = Date.now() - mountedAtMs.current;
    const wait = Math.max(0, theme.loading.minDisplayMs - elapsed);
    const timer = setTimeout(() => {
      overlayOpacity.value = withTiming(
        0,
        { duration: theme.loading.fadeOutMs, easing: Easing.in(Easing.quad) },
        (finished) => {
          if (finished) runOnJS(onDone)();
        },
      );
    }, wait);
    return () => clearTimeout(timer);
  }, [hydrated, onDone, overlayOpacity]);

  const overlayStyle = useAnimatedStyle(() => ({
    opacity: overlayOpacity.value,
  }));
  const barFillStyle = useAnimatedStyle(() => ({
    width: `${progress.value * 100}%`,
  }));

  return (
    <Animated.View style={[styles.root, overlayStyle]}>
      <Canvas style={StyleSheet.absoluteFill}>
        <Background
          width={width}
          height={height}
          renderScrollX={scroll}
          wallClockMs={clockMs}
        />
        <Helicopter
          centerX={width * MENU_HELI_X_RATIO}
          screenHeight={height * MENU_HELI_SCALE}
          renderY={renderY}
          velY={velY}
          phase={phase}
          wallClockMs={clockMs}
          skin={getSkin(selectedSkin)}
        />
      </Canvas>
      <View style={styles.content} pointerEvents="none">
        <View
          onLayout={fit.onLayout}
          style={[
            styles.column,
            {
              transform: [{ scale: fit.scale }],
              opacity: fit.measured ? 1 : 0,
            },
          ]}
        >
          <View style={styles.titleBlock}>
            <Text style={styles.titleTop}>CAVE</Text>
            <Text style={styles.titleBottom}>HELICOPTER</Text>
            {bestScore > 0 && (
              <Text style={styles.best}>
                BEST {bestScore} · {bestDistance} m
              </Text>
            )}
            {totalCoins > 0 && (
              <Text style={styles.coins}>● {totalCoins} {totalCoins === 1 ? 'COIN' : 'COINS'}</Text>
            )}
          </View>
          <View style={styles.actionArea}>
            <View style={styles.barTrack}>
              <Animated.View style={[styles.barFill, barFillStyle]} />
            </View>
            <Text style={styles.loadingLabel}>SPOOLING UP</Text>
          </View>
        </View>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  root: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: theme.colors.backgroundTop,
  },
  // Mirrors MenuScreen's right column so the title/heli sit in the same
  // spots during the boot crossfade.
  content: {
    flex: 1,
    alignItems: 'flex-end',
    justifyContent: 'center',
    paddingRight: 64,
  },
  /** Same scaled column as MenuScreen (useColumnFit), so the boot
   * crossfade lines up on short screens too. */
  column: {
    alignItems: 'flex-end',
    gap: 28,
    transformOrigin: 'right center',
  },
  titleBlock: {
    alignItems: 'flex-end',
  },
  titleTop: {
    color: theme.colors.amber,
    fontSize: 46,
    fontWeight: '900',
    letterSpacing: 14,
  },
  titleBottom: {
    color: theme.colors.hud,
    fontSize: 26,
    fontWeight: '800',
    letterSpacing: 6,
    marginTop: 2,
  },
  best: {
    color: '#8a94a3',
    fontSize: 14,
    fontWeight: '600',
    letterSpacing: 2,
    marginTop: 18,
  },
  coins: {
    color: theme.colors.coinGold,
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: 2,
    marginTop: 8,
  },
  /** Same fixed slot as the menu's button stack — the bar sits where PLAY
   * will appear. */
  actionArea: {
    height: 260,
    gap: 12,
    alignItems: 'flex-end',
    justifyContent: 'flex-start',
    paddingTop: 24,
  },
  barTrack: {
    width: 220,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(220, 227, 236, 0.14)',
    overflow: 'hidden',
  },
  barFill: {
    height: '100%',
    borderRadius: 2,
    backgroundColor: theme.colors.amber,
  },
  loadingLabel: {
    color: '#8a94a3',
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 4,
  },
});
