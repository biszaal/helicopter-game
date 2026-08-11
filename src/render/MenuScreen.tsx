import { Canvas } from '@shopify/react-native-skia';
import { StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import {
  useDerivedValue,
  useFrameCallback,
  useSharedValue,
} from 'react-native-reanimated';
import { PHASE_PLAYING } from '../engine/useGameLoop';
import { useSettings } from '../state/settings';
import { Background } from './Background';
import { GameButton } from './GameButton';
import { Helicopter } from './Helicopter';
import { getSkin, theme } from './theme';

interface MenuScreenProps {
  onPlay: () => void;
  onSettings: () => void;
  onShop: () => void;
  onLeaderboard: () => void;
}

/** Landscape split: the helicopter hovering on the left (same x as its
 * in-game flight position, so PLAY feels continuous), title + buttons in a
 * right column. */
export const MENU_HELI_X_RATIO = 0.3;
export const MENU_HELI_Y = 0.4;
/** Showcase scale. The sprite formula (0.09 × screenHeight) matches the
 * game exactly, but landscape height makes that read small on a menu — so
 * the hero heli is drawn off an inflated reference height, the same trick
 * as the shop previews. renderY must be divided back by this. */
export const MENU_HELI_SCALE = 2;

/**
 * Main menu: the live cave backdrop with a gently hovering helicopter,
 * driven by a local clock — the real game loop is not running here.
 */
export function MenuScreen({
  onPlay,
  onSettings,
  onShop,
  onLeaderboard,
}: MenuScreenProps) {
  const { width, height } = useWindowDimensions();
  const { bestScore, bestDistance, totalCoins, selectedSkin } = useSettings();

  const clockMs = useSharedValue(0);
  useFrameCallback((frame) => {
    clockMs.value = frame.timestamp;
  });
  const scroll = useDerivedValue(() => (clockMs.value / 1000) * 0.05);
  // Divided by the scale because the Helicopter multiplies renderY by the
  // (inflated) screenHeight it is given.
  const renderY = useDerivedValue(
    () =>
      (MENU_HELI_Y + Math.sin((clockMs.value / 1000) * 0.8) * 0.018) /
      MENU_HELI_SCALE,
  );
  // Exaggerated pseudo-velocity so the hover reads as a gentle rocking.
  const velY = useDerivedValue(
    () => Math.cos((clockMs.value / 1000) * 0.8) * 0.3,
  );
  const phase = useSharedValue(PHASE_PLAYING);

  return (
    <View style={styles.root}>
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
      <View style={styles.content} pointerEvents="box-none">
        <View style={styles.titleBlock}>
          <Text style={styles.titleTop}>CAVE</Text>
          <Text style={styles.titleBottom}>HELICOPTER</Text>
          {bestScore > 0 && (
            <Text style={styles.best}>
              BEST {bestScore} · {bestDistance} m
            </Text>
          )}
          {totalCoins > 0 && (
            <Text style={styles.coins}>● {totalCoins} COINS</Text>
          )}
        </View>
        <View style={styles.actionArea}>
          <GameButton label="PLAY" onPress={onPlay} />
          <GameButton label="SHOP" variant="secondary" onPress={onShop} />
          <GameButton
            label="LEADERBOARD"
            variant="secondary"
            onPress={onLeaderboard}
          />
          <GameButton label="SETTINGS" variant="secondary" onPress={onSettings} />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: theme.colors.backgroundTop,
  },
  // Right column, clear of the landscape notch; the LoadingScreen mirrors
  // this geometry exactly so the boot fade lines up.
  content: {
    flex: 1,
    alignItems: 'flex-end',
    justifyContent: 'center',
    paddingRight: 64,
    gap: 28,
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
  /** Fixed-height slot shared with LoadingScreen (bar lives where the
   * buttons appear) so the title never shifts during the boot crossfade. */
  actionArea: {
    height: 260,
    gap: 14,
    alignItems: 'flex-end',
    justifyContent: 'flex-start',
  },
});
