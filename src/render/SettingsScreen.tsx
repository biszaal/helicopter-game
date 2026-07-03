import { StyleSheet, Switch, Text, View } from 'react-native';
import { useSettings } from '../state/settings';
import { GameButton } from './GameButton';
import { theme } from './theme';

interface SettingsScreenProps {
  onBack: () => void;
}

export function SettingsScreen({ onBack }: SettingsScreenProps) {
  const {
    soundEnabled,
    hapticsEnabled,
    bestScore,
    bestDistance,
    setSoundEnabled,
    setHapticsEnabled,
    resetBest,
  } = useSettings();

  return (
    <View style={styles.root}>
      <Text style={styles.title}>SETTINGS</Text>
      <View style={styles.rows}>
        <View style={styles.row}>
          <Text style={styles.rowLabel}>Sound effects</Text>
          <Switch
            value={soundEnabled}
            onValueChange={setSoundEnabled}
            trackColor={{ true: theme.colors.amber, false: '#2a323f' }}
            thumbColor="#dce3ec"
          />
        </View>
        <View style={styles.row}>
          <Text style={styles.rowLabel}>Haptics</Text>
          <Switch
            value={hapticsEnabled}
            onValueChange={setHapticsEnabled}
            trackColor={{ true: theme.colors.amber, false: '#2a323f' }}
            thumbColor="#dce3ec"
          />
        </View>
        <View style={styles.divider} />
        <View style={styles.row}>
          <View>
            <Text style={styles.rowLabel}>Best run</Text>
            <Text style={styles.bestValue}>
              {bestScore > 0 ? `${bestScore} · ${bestDistance} m` : '—'}
            </Text>
          </View>
          <GameButton
            label="RESET"
            variant="secondary"
            compact
            onPress={resetBest}
          />
        </View>
      </View>
      <View style={styles.footer}>
        <GameButton label="BACK" variant="secondary" onPress={onBack} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: theme.colors.backgroundTop,
    paddingTop: '20%',
    paddingHorizontal: 28,
  },
  title: {
    color: theme.colors.hud,
    fontSize: 28,
    fontWeight: '800',
    letterSpacing: 8,
    textAlign: 'center',
    marginBottom: 40,
  },
  rows: {
    gap: 22,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  rowLabel: {
    color: theme.colors.hud,
    fontSize: 17,
    fontWeight: '600',
  },
  bestValue: {
    color: theme.colors.amber,
    fontSize: 14,
    fontWeight: '700',
    marginTop: 3,
  },
  divider: {
    height: 1,
    backgroundColor: 'rgba(220, 227, 236, 0.12)',
  },
  footer: {
    flex: 1,
    justifyContent: 'flex-end',
    alignItems: 'center',
    paddingBottom: '14%',
  },
});
