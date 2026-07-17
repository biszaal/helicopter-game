import { Canvas } from '@shopify/react-native-skia';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import {
  useDerivedValue,
  useFrameCallback,
  useSharedValue,
  type SharedValue,
} from 'react-native-reanimated';
import { config } from '../config';
import { PHASE_PLAYING } from '../engine/useGameLoop';
import { useSettings } from '../state/settings';
import { GameButton } from './GameButton';
import { Helicopter } from './Helicopter';
import { getSkin, theme } from './theme';

interface ShopScreenProps {
  onBack: () => void;
}

// Preview canvas geometry: the Helicopter component sizes itself off a
// "screen height", so a reference height picks the sprite scale — 710 puts
// a ~64 px helicopter in a 132×88 card with the searchlight clipping off
// the right edge (reads as a hangar spotlight).
const PREVIEW_W = 132;
const PREVIEW_H = 88;
const PREVIEW_SCREEN_H = 710;

function SkinPreview({
  skinId,
  clockMs,
}: {
  skinId: string;
  clockMs: SharedValue<number>;
}) {
  const renderY = useDerivedValue(() => (PREVIEW_H * 0.56) / PREVIEW_SCREEN_H);
  const velY = useDerivedValue(() => 0);
  const phase = useSharedValue(PHASE_PLAYING);
  return (
    <Canvas style={styles.preview}>
      <Helicopter
        centerX={PREVIEW_W * 0.42}
        screenHeight={PREVIEW_SCREEN_H}
        renderY={renderY}
        velY={velY}
        phase={phase}
        wallClockMs={clockMs}
        skin={getSkin(skinId)}
      />
    </Canvas>
  );
}

function SkinCard({
  id,
  name,
  price,
  clockMs,
}: {
  id: string;
  name: string;
  price: number;
  clockMs: SharedValue<number>;
}) {
  const { totalCoins, ownedSkins, selectedSkin, purchaseSkin, selectSkin } =
    useSettings();
  const owned = ownedSkins.includes(id);
  const equipped = selectedSkin === id;
  const affordable = totalCoins >= price;

  return (
    <View style={[styles.card, equipped && styles.cardEquipped]}>
      <SkinPreview skinId={id} clockMs={clockMs} />
      <View style={styles.cardInfo}>
        <Text style={styles.cardName}>{name}</Text>
        {!owned && <Text style={styles.cardPrice}>● {price}</Text>}
      </View>
      {equipped ? (
        <Text style={styles.equippedBadge}>EQUIPPED</Text>
      ) : owned ? (
        <GameButton
          label="EQUIP"
          variant="secondary"
          compact
          onPress={() => selectSkin(id)}
        />
      ) : affordable ? (
        <GameButton label="BUY" compact onPress={() => purchaseSkin(id)} />
      ) : (
        <Text style={styles.lockedBadge}>BUY</Text>
      )}
    </View>
  );
}

/** The hangar: buy and equip helicopter skins with run-earned coins. */
export function ShopScreen({ onBack }: ShopScreenProps) {
  const { totalCoins } = useSettings();

  // One clock shared by every preview — rotors spin in sync, one callback.
  const clockMs = useSharedValue(0);
  useFrameCallback((frame) => {
    clockMs.value = frame.timestamp;
  });

  return (
    <View style={styles.root}>
      <Text style={styles.title}>SHOP</Text>
      <Text style={styles.wallet}>● {totalCoins}</Text>
      <ScrollView
        style={styles.list}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
      >
        {config.shop.skins.map((skin) => (
          <SkinCard
            key={skin.id}
            id={skin.id}
            name={skin.name}
            price={skin.price}
            clockMs={clockMs}
          />
        ))}
      </ScrollView>
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
    paddingTop: '16%',
    paddingHorizontal: 24,
  },
  title: {
    color: theme.colors.hud,
    fontSize: 28,
    fontWeight: '800',
    letterSpacing: 8,
    textAlign: 'center',
  },
  wallet: {
    color: theme.colors.coinGold,
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 2,
    textAlign: 'center',
    marginTop: 8,
    marginBottom: 18,
  },
  list: {
    flex: 1,
  },
  listContent: {
    gap: 14,
    paddingBottom: 16,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(220, 227, 236, 0.1)',
    backgroundColor: 'rgba(14, 19, 27, 0.85)',
    paddingVertical: 10,
    paddingRight: 16,
  },
  cardEquipped: {
    borderColor: 'rgba(255, 182, 72, 0.55)',
  },
  preview: {
    width: PREVIEW_W,
    height: PREVIEW_H,
  },
  cardInfo: {
    flex: 1,
  },
  cardName: {
    color: theme.colors.hud,
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: 2,
  },
  cardPrice: {
    color: theme.colors.coinGold,
    fontSize: 14,
    fontWeight: '700',
    marginTop: 4,
  },
  equippedBadge: {
    color: theme.colors.amber,
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 2,
  },
  lockedBadge: {
    color: 'rgba(220, 227, 236, 0.25)',
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 2,
    paddingVertical: 8,
    paddingHorizontal: 20,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: 'rgba(220, 227, 236, 0.12)',
    overflow: 'hidden',
  },
  footer: {
    paddingVertical: 18,
    alignItems: 'center',
  },
});
