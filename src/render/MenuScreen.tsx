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
}

/**
 * Main menu: the live cave backdrop with a gently hovering helicopter,
 * driven by a local clock — the real game loop is not running here.
 */
export function MenuScreen({ onPlay, onSettings }: MenuScreenProps) {
  const { width, height } = useWindowDimensions();
  const { bestScore, bestDistance, totalCoins, selectedSkin } = useSettings();

  const clockMs = useSharedValue(0);
  useFrameCallback((frame) => {
    clockMs.value = frame.timestamp;
  });
  const scroll = useDerivedValue(() => (clockMs.value / 1000) * 0.05);
  const renderY = useDerivedValue(
    () => 0.4 + Math.sin((clockMs.value / 1000) * 0.8) * 0.018,
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
          centerX={width * 0.5}
          screenHeight={height}
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
        <View style={styles.buttons}>
          <GameButton label="PLAY" onPress={onPlay} />
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
  content: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: '18%',
    paddingBottom: '14%',
  },
  titleBlock: {
    alignItems: 'center',
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
  buttons: {
    gap: 16,
    alignItems: 'center',
  },
});
