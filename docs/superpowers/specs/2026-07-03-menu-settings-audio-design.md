# Main Menu, Settings & Sound — Design

Approved by user 2026-07-03.

## Goal

Add a main menu (Play / Settings), a settings page, and sound effects
(helicopter rotor loop, crash, button clicks) with haptics and a persisted
best score. Gameplay code stays untouched apart from event taps.

## Screens & navigation

No navigation library. `App.tsx` holds `screen: 'menu' | 'game' | 'settings'`
state and renders one of three screens.

- **MenuScreen** — reuses the Skia `Background` and a hovering,
  rotor-spinning `Helicopter` (driven by local shared values, no game loop)
  as a living backdrop. Title, best score line, PLAY and SETTINGS buttons.
- **SettingsScreen** — Sound toggle, Haptics toggle, best score/distance
  display with RESET button, Back.
- **GameScreen** — unchanged visually; the game-over overlay gains a MENU
  button beside "tap to retry".

## Settings & best score

`src/state/settings.tsx`: React context holding `soundEnabled`,
`hapticsEnabled`, `bestScore`, `bestDistance`. Persisted as one JSON blob in
AsyncStorage (`@react-native-async-storage/async-storage`), loaded once at
startup. Best score/distance update automatically on death when beaten.

## Audio

`src/audio/sounds.ts` using `expo-audio` (SDK 57): three preloaded players —
`click` (all buttons), `rotor` (seamless loop while flying; starts on run
start/retry, stops on crash), `crash` (on death). All gated by the sound
toggle. `playsInSilentMode: true` so the game is audible with the iPhone
mute switch on.

Sources are CC0 downloads: Kenney audio packs for click + crash; a CC0
helicopter loop (OpenGameArt/freesound). The rotor loop is post-processed
with a tail-to-head crossfade so it loops seamlessly. Files live in
`assets/sounds/` with a `LICENSES.md` documenting each source.

## Haptics

`expo-haptics`: light impact on each graze (multiplier tier up), heavy
impact on crash. Gated by the haptics toggle.

## Event flow

Game events originate on the UI thread; they cross to JS with
`useAnimatedReaction` → `runOnJS` (the existing game-over pattern):
death → crash sound + heavy haptic + stop rotor + best-score update;
retry → restart rotor; tier-up → light haptic.

## Verification

`npx tsc --noEmit`, `npx expo export`; user tests sounds/haptics/menu flow
in Expo Go (sounds require a dev build or Expo Go with the audio module —
expo-audio is supported in Expo Go).
