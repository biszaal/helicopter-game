import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';

/** Varied name-bar widths so the placeholder reads as a list of names. */
const NAME_WIDTHS = ['62%', '46%', '70%', '38%', '56%', '66%', '44%', '52%'] as const;

/**
 * Placeholder rows shown while the board loads: the same row geometry as
 * LeaderboardScreen's real rows (rank, name, score), pulsing gently so the
 * screen reads as "loading" without a spinner.
 */
export function LeaderboardSkeleton() {
  const pulse = useSharedValue(0.35);
  useEffect(() => {
    pulse.value = withRepeat(
      withTiming(0.8, { duration: 700, easing: Easing.inOut(Easing.ease) }),
      -1,
      true,
    );
  }, [pulse]);
  const pulseStyle = useAnimatedStyle(() => ({ opacity: pulse.value }));

  return (
    <Animated.View
      style={[styles.list, pulseStyle]}
      accessibilityLabel="Loading leaderboard"
      accessibilityRole="progressbar"
    >
      {NAME_WIDTHS.map((nameWidth, i) => (
        <View key={i} style={styles.row}>
          <View style={styles.rank} />
          <View style={styles.nameSlot}>
            <View style={[styles.bar, { width: nameWidth }]} />
          </View>
          <View style={[styles.bar, styles.score]} />
        </View>
      ))}
    </Animated.View>
  );
}

const BAR_COLOR = 'rgba(220, 227, 236, 0.14)';

const styles = StyleSheet.create({
  // Mirrors LeaderboardScreen's list and row styles so nothing jumps when
  // the real rows replace these.
  list: {
    width: '100%',
    maxWidth: 480,
    marginTop: 16,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(220, 227, 236, 0.08)',
  },
  rank: {
    width: 22,
    height: 14,
    borderRadius: 4,
    marginRight: 26,
    backgroundColor: BAR_COLOR,
  },
  nameSlot: {
    flex: 1,
  },
  bar: {
    height: 14,
    borderRadius: 4,
    backgroundColor: BAR_COLOR,
  },
  score: {
    width: 56,
  },
});
