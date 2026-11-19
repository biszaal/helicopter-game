import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useState } from 'react';
import { BackHandler, StyleSheet, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { initAudio } from './src/audio/sounds';
import { GameScreen } from './src/render/GameScreen';
import { LeaderboardScreen } from './src/render/LeaderboardScreen';
import { LoadingScreen } from './src/render/LoadingScreen';
import { MenuScreen } from './src/render/MenuScreen';
import { SettingsScreen } from './src/render/SettingsScreen';
import { ShopScreen } from './src/render/ShopScreen';
import { SettingsProvider, useSettings } from './src/state/settings';

type Screen = 'menu' | 'game' | 'settings' | 'shop' | 'leaderboard';

function Root() {
  const [screen, setScreen] = useState<Screen>('menu');
  // Boot overlay: covers settings hydration, then fades out over the menu
  // (already mounted underneath, so the scene carries straight through).
  const [booting, setBooting] = useState(true);
  const { hydrated } = useSettings();
  const finishBoot = useCallback(() => setBooting(false), []);

  useEffect(() => {
    initAudio();
  }, []);

  // Android back button: sub-screens return to the menu. The game screen
  // handles its own back press (pause first), and on the menu the default
  // (leave the app) is what players expect.
  useEffect(() => {
    if (screen === 'menu' || screen === 'game') return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      setScreen('menu');
      return true;
    });
    return () => sub.remove();
  }, [screen]);

  let current;
  switch (screen) {
    case 'game':
      current = <GameScreen onExitToMenu={() => setScreen('menu')} />;
      break;
    case 'settings':
      current = <SettingsScreen onBack={() => setScreen('menu')} />;
      break;
    case 'shop':
      current = <ShopScreen onBack={() => setScreen('menu')} />;
      break;
    case 'leaderboard':
      current = <LeaderboardScreen onBack={() => setScreen('menu')} />;
      break;
    default:
      current = (
        <MenuScreen
          onPlay={() => setScreen('game')}
          onSettings={() => setScreen('settings')}
          onShop={() => setScreen('shop')}
          onLeaderboard={() => setScreen('leaderboard')}
        />
      );
  }

  return (
    <View style={styles.root}>
      {current}
      {booting && <LoadingScreen hydrated={hydrated} onDone={finishBoot} />}
    </View>
  );
}

export default function App() {
  return (
    <GestureHandlerRootView style={styles.root}>
      <StatusBar hidden />
      <SettingsProvider>
        <Root />
      </SettingsProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
});
