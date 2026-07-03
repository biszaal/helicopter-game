import { Pressable, StyleSheet, Text } from 'react-native';
import { hapticSelect } from '../audio/haptics';
import { playClick } from '../audio/sounds';
import { theme } from './theme';

interface GameButtonProps {
  label: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary';
  /** Slimmer padding for inline placements (e.g. settings rows). */
  compact?: boolean;
}

/** The one button style for menus/overlays — plays the click + haptic. */
export function GameButton({
  label,
  onPress,
  variant = 'primary',
  compact = false,
}: GameButtonProps) {
  return (
    <Pressable
      onPress={() => {
        playClick();
        hapticSelect();
        onPress();
      }}
      style={({ pressed }) => [
        styles.base,
        compact && styles.compact,
        variant === 'primary' ? styles.primary : styles.secondary,
        pressed && styles.pressed,
      ]}
    >
      <Text
        style={[
          styles.label,
          compact && styles.labelCompact,
          variant === 'primary' ? styles.labelPrimary : styles.labelSecondary,
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    paddingHorizontal: 48,
    borderRadius: 14,
    minWidth: 220,
  },
  compact: {
    paddingVertical: 8,
    paddingHorizontal: 20,
    minWidth: 0,
  },
  primary: {
    backgroundColor: theme.colors.amber,
  },
  secondary: {
    borderWidth: 1.5,
    borderColor: 'rgba(255, 182, 72, 0.55)',
    backgroundColor: 'rgba(14, 19, 27, 0.55)',
  },
  pressed: {
    opacity: 0.7,
    transform: [{ scale: 0.98 }],
  },
  label: {
    fontSize: 18,
    fontWeight: '800',
    letterSpacing: 4,
  },
  labelCompact: {
    fontSize: 13,
    letterSpacing: 2,
  },
  labelPrimary: {
    color: '#131a24',
  },
  labelSecondary: {
    color: theme.colors.amber,
  },
});
