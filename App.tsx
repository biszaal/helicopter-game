import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { StyleSheet } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { initAudio } from './src/audio/sounds';
import { GameScreen } from './src/render/GameScreen';
import { MenuScreen } from './src/render/MenuScreen';
import { SettingsScreen } from './src/render/SettingsScreen';
import { ShopScreen } from './src/render/ShopScreen';
import { SettingsProvider } from './src/state/settings';

type Screen = 'menu' | 'game' | 'settings' | 'shop';

function Root() {
  const [screen, setScreen] = useState<Screen>('menu');

  useEffect(() => {
    initAudio();
  }, []);

  switch (screen) {
    case 'game':
      return <GameScreen onExitToMenu={() => setScreen('menu')} />;
    case 'settings':
      return <SettingsScreen onBack={() => setScreen('menu')} />;
    case 'shop':
      return <ShopScreen onBack={() => setScreen('menu')} />;
    default:
      return (
        <MenuScreen
          onPlay={() => setScreen('game')}
          onSettings={() => setScreen('settings')}
          onShop={() => setScreen('shop')}
        />
      );
  }
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
