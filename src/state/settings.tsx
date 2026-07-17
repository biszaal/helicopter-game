import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';
import { setHapticsEnabled as syncHaptics } from '../audio/haptics';
import { setSoundEnabled as syncSound } from '../audio/sounds';
import {
  applyPurchase,
  applySelect,
  FREE_SKIN_ID,
  sanitizeWallet,
} from './shop';

const STORAGE_KEY = 'cave-heli:settings-v1';

interface Settings {
  soundEnabled: boolean;
  hapticsEnabled: boolean;
  /** Best score and the distance of that same run. */
  bestScore: number;
  bestDistance: number;
  /** Lifetime coin wallet — earned from run scores, spent in the shop. */
  totalCoins: number;
  /** Skin ids the player owns; always contains the free skin. */
  ownedSkins: string[];
  /** The equipped skin — always one of ownedSkins. */
  selectedSkin: string;
}

const DEFAULTS: Settings = {
  soundEnabled: true,
  hapticsEnabled: true,
  bestScore: 0,
  bestDistance: 0,
  totalCoins: 0,
  ownedSkins: [FREE_SKIN_ID],
  selectedSkin: FREE_SKIN_ID,
};

interface SettingsContextValue extends Settings {
  setSoundEnabled: (on: boolean) => void;
  setHapticsEnabled: (on: boolean) => void;
  /** Called on death; banks the run's coins and keeps the best run if this
   * one beat it. */
  recordRun: (score: number, distance: number, coins: number) => void;
  resetBest: () => void;
  /** Buy + equip a skin; no-op if unknown, owned, or unaffordable. */
  purchaseSkin: (id: string) => void;
  /** Equip an owned skin; no-op otherwise. */
  selectSkin: (id: string) => void;
}

const SettingsContext = createContext<SettingsContextValue | null>(null);

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<Settings>(DEFAULTS);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY)
      .then((raw) => {
        if (raw !== null) {
          setSettings(
            sanitizeWallet({
              ...DEFAULTS,
              ...(JSON.parse(raw) as Partial<Settings>),
            }),
          );
        }
      })
      .catch(() => {}); // unreadable storage: keep defaults
  }, []);

  // The audio/haptics modules keep their own flags so UI-thread game events
  // (runOnJS) never touch React context.
  useEffect(() => {
    syncSound(settings.soundEnabled);
    syncHaptics(settings.hapticsEnabled);
  }, [settings.soundEnabled, settings.hapticsEnabled]);

  const patch = useCallback((partial: Partial<Settings>) => {
    setSettings((prev) => {
      const next = { ...prev, ...partial };
      AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next)).catch(() => {});
      return next;
    });
  }, []);

  const setSoundEnabled = useCallback(
    (on: boolean) => patch({ soundEnabled: on }),
    [patch],
  );
  const setHapticsEnabled = useCallback(
    (on: boolean) => patch({ hapticsEnabled: on }),
    [patch],
  );
  const recordRun = useCallback(
    (score: number, distance: number, coins: number) => {
      setSettings((prev) => {
        const best =
          score > prev.bestScore
            ? { bestScore: score, bestDistance: distance }
            : null;
        if (best === null && coins <= 0) return prev;
        const next = {
          ...prev,
          ...best,
          totalCoins: prev.totalCoins + Math.max(0, coins),
        };
        AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next)).catch(() => {});
        return next;
      });
    },
    [],
  );
  const resetBest = useCallback(
    // Best run only — the wallet and owned skins survive a reset.
    () => patch({ bestScore: 0, bestDistance: 0 }),
    [patch],
  );
  const applyWallet = useCallback(
    (transition: (prev: Settings) => Settings | null) => {
      setSettings((prev) => {
        const next = transition(prev);
        if (next === null) return prev;
        AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next)).catch(() => {});
        return next;
      });
    },
    [],
  );
  const purchaseSkin = useCallback(
    (id: string) => applyWallet((prev) => applyPurchase(prev, id)),
    [applyWallet],
  );
  const selectSkin = useCallback(
    (id: string) => applyWallet((prev) => applySelect(prev, id)),
    [applyWallet],
  );

  return (
    <SettingsContext.Provider
      value={{
        ...settings,
        setSoundEnabled,
        setHapticsEnabled,
        recordRun,
        resetBest,
        purchaseSkin,
        selectSkin,
      }}
    >
      {children}
    </SettingsContext.Provider>
  );
}

export function useSettings(): SettingsContextValue {
  const value = useContext(SettingsContext);
  if (value === null) {
    throw new Error('useSettings must be used inside SettingsProvider');
  }
  return value;
}
