import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { isValidUsernameFormat } from '../net/leaderboardRules';
import {
  claimUsername,
  fetchOwnRank,
  fetchTop100,
  syncBestScore,
  type LeaderboardEntry,
} from '../net/leaderboardApi';
import { useSettings } from '../state/settings';
import { GameButton } from './GameButton';
import { theme } from './theme';

interface LeaderboardScreenProps {
  onBack: () => void;
}

export function LeaderboardScreen({ onBack }: LeaderboardScreenProps) {
  const { username, setUsername, bestScore, bestDistance } = useSettings();
  const [claiming, setClaiming] = useState(username === null);
  const [draftName, setDraftName] = useState('');
  const [claimError, setClaimError] = useState<string | null>(null);
  /** A claim request is in flight — spinner on CLAIM, repeat taps ignored. */
  const [submitting, setSubmitting] = useState(false);
  const [entries, setEntries] = useState<LeaderboardEntry[] | null>(null);
  const [ownRank, setOwnRank] = useState<number | null>(null);
  const [loadError, setLoadError] = useState(false);

  const load = useCallback(() => {
    setLoadError(false);
    // Sync first so the board includes this device's best (see
    // syncBestScore). A failed sync must never block showing the board.
    syncBestScore(bestScore, bestDistance)
      .catch(() => {})
      .then(() => Promise.all([fetchTop100(), fetchOwnRank()]))
      .then(([top, rank]) => {
        setEntries(top);
        setOwnRank(rank);
      })
      .catch(() => setLoadError(true));
  }, [bestScore, bestDistance]);

  useEffect(() => {
    if (!claiming) load();
  }, [claiming, load]);

  const handleClaim = () => {
    if (submitting) return;
    if (!isValidUsernameFormat(draftName)) {
      setClaimError('3-16 letters, numbers, or _');
      return;
    }
    setClaimError(null);
    setSubmitting(true);
    claimUsername(draftName)
      .then((result) => {
        if (!result.ok) {
          setClaimError(
            result.reason === 'taken'
              ? 'That name is taken'
              : result.reason === 'profane'
                ? 'Not allowed — try another'
                : 'Invalid name',
          );
          return;
        }
        setUsername(draftName);
        setClaiming(false);
      })
      .catch(() => setClaimError('Network error — try again'))
      .finally(() => setSubmitting(false));
  };

  if (claiming) {
    return (
      // Landscape keyboard leaves ~210 pt on a phone, so everything sits in
      // the top band: BACK in the corner, input and CLAIM on one row.
      <View style={styles.root}>
        <View style={styles.backCorner}>
          <GameButton
            label="BACK"
            variant="secondary"
            compact
            onPress={onBack}
          />
        </View>
        <Text style={styles.title}>PICK A NAME</Text>
        <View style={styles.claimRow}>
          <TextInput
            style={styles.input}
            value={draftName}
            onChangeText={setDraftName}
            placeholder="username"
            placeholderTextColor="rgba(220, 227, 236, 0.35)"
            autoCapitalize="none"
            autoCorrect={false}
            maxLength={16}
            returnKeyType="done"
            onSubmitEditing={handleClaim}
            editable={!submitting}
          />
          <GameButton label="CLAIM" onPress={handleClaim} loading={submitting} />
        </View>
        {claimError !== null && <Text style={styles.error}>{claimError}</Text>}
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <Text style={styles.title}>LEADERBOARD</Text>
      {loadError && (
        <Text style={styles.error}>Couldn't load — check your connection</Text>
      )}
      {entries === null && !loadError && (
        <ActivityIndicator style={styles.spinner} color={theme.colors.amber} />
      )}
      {entries !== null && (
        <ScrollView style={styles.list}>
          {entries.map((entry, i) => (
            <View
              key={entry.username}
              style={[styles.row, entry.username === username && styles.rowSelf]}
            >
              <Text style={styles.rank}>{i + 1}</Text>
              <Text style={styles.name}>{entry.username}</Text>
              <Text style={styles.score}>{entry.bestScore}</Text>
            </View>
          ))}
        </ScrollView>
      )}
      {ownRank !== null && ownRank > 100 && (
        <View style={[styles.row, styles.rowSelf, styles.rowPinned]}>
          <Text style={styles.rank}>{ownRank}</Text>
          <Text style={styles.name}>{username}</Text>
        </View>
      )}
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
    alignItems: 'center',
    paddingTop: 22,
    paddingBottom: 14,
  },
  title: {
    color: theme.colors.hud,
    fontSize: 28,
    fontWeight: '800',
    letterSpacing: 8,
  },
  spinner: {
    marginTop: 32,
  },
  error: {
    color: theme.colors.amber,
    fontSize: 13,
    fontWeight: '700',
    marginTop: 12,
    textAlign: 'center',
    paddingHorizontal: 32,
  },
  /** Clear of the landscape notch, level with the title. */
  backCorner: {
    position: 'absolute',
    top: 22,
    left: 64,
  },
  claimRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    marginTop: 24,
  },
  input: {
    width: 240,
    borderWidth: 1.5,
    borderColor: 'rgba(255, 182, 72, 0.4)',
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 16,
    color: theme.colors.hud,
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 1,
    textAlign: 'center',
  },
  list: {
    flex: 1,
    width: '100%',
    maxWidth: 480,
    marginTop: 16,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(220, 227, 236, 0.08)',
  },
  rowSelf: {
    backgroundColor: 'rgba(255, 182, 72, 0.1)',
  },
  rowPinned: {
    width: '100%',
    maxWidth: 480,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 182, 72, 0.3)',
  },
  rank: {
    width: 48,
    color: '#8a94a3',
    fontSize: 14,
    fontWeight: '700',
  },
  name: {
    flex: 1,
    color: theme.colors.hud,
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: 1,
  },
  score: {
    color: theme.colors.coinGold,
    fontSize: 15,
    fontWeight: '800',
  },
  footer: {
    paddingTop: 14,
    alignItems: 'center',
  },
});
