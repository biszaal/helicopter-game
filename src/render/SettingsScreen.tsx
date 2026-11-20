import { Linking, StyleSheet, Switch, Text, View } from 'react-native';
import { useSettings } from '../state/settings';
import { GameButton } from './GameButton';
import { theme } from './theme';

/** Google Play requires an in-app route to request deletion of server-side
 * data; a link to this web page satisfies it. The page covers the one thing
 * the game stores off-device, the optional leaderboard entry. */
const DELETE_DATA_URL = 'https://www.biszaaltech.com/games/helicopter/delete-account';

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
        <View style={styles.row}>
          <Text style={styles.rowLabel}>Delete my leaderboard data</Text>
          <GameButton
            label="OPEN"
            variant="secondary"
            compact
            onPress={() => {
              Linking.openURL(DELETE_DATA_URL).catch(() => {});
            }}
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
    // Fixed paddings: percentages resolve against the parent's WIDTH in RN,
    // which blew out into a giant blank band once the app went landscape.
    paddingTop: 18,
    paddingBottom: 14,
    paddingHorizontal: 28,
    alignItems: 'center',
  },
  title: {
    color: theme.colors.hud,
    fontSize: 28,
    fontWeight: '800',
    letterSpacing: 8,
    textAlign: 'center',
    marginBottom: 14,
  },
  rows: {
    // Tight enough that every row plus BACK fits a ~393 pt landscape phone,
    // even with Android's taller (48 dp) switch rows.
    gap: 12,
    width: '100%',
    // Landscape: keep the rows a readable width instead of stretching the
    // labels and switches to opposite edges of the screen.
    maxWidth: 480,
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
  },
});
