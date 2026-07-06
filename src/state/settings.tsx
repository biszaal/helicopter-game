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

const STORAGE_KEY = 'cave-heli:settings-v1';

interface Settings {
  soundEnabled: boolean;
  hapticsEnabled: boolean;
  /** Best score and the distance of that same run. */
  bestScore: number;
  bestDistance: number;
  /** Coin wallet — every run's coins bank here. */
  totalCoins: number;
}

const DEFAULTS: Settings = {
  soundEnabled: true,
  hapticsEnabled: true,
  bestScore: 0,
  bestDistance: 0,
  totalCoins: 0,
};

interface SettingsContextValue extends Settings {
  setSoundEnabled: (on: boolean) => void;
  setHapticsEnabled: (on: boolean) => void;
  /** Called on death: banks the run's coins, keeps the best run if this
   * one beat it. */
  recordRun: (score: number, distance: number, coins: number) => void;
  resetBest: () => void;
}

const SettingsContext = createContext<SettingsContextValue | null>(null);

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<Settings>(DEFAULTS);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY)
      .then((raw) => {
        if (raw !== null) {
          setSettings({ ...DEFAULTS, ...(JSON.parse(raw) as Partial<Settings>) });
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
        const next = { ...prev, totalCoins: prev.totalCoins + coins };
        if (score > prev.bestScore) {
          next.bestScore = score;
          next.bestDistance = distance;
        }
        AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next)).catch(() => {});
        return next;
      });
    },
    [],
  );
  const resetBest = useCallback(
    () => patch({ bestScore: 0, bestDistance: 0, totalCoins: 0 }),
    [patch],
  );

  return (
    <SettingsContext.Provider
      value={{
        ...settings,
        setSoundEnabled,
        setHapticsEnabled,
        recordRun,
        resetBest,
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
