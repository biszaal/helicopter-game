# Difficulty Phase B — Zone Milestone Juice Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make zone escalation *felt*: an announcement overlay, a cave-palette crossfade, a chime + haptic at each boundary, and rotor pitch/volume that rise with scroll speed.

**Architecture:** The engine gains one shared value (`prevZoneIndex`) so the render layer can crossfade palettes as a pure function of `wallClockMs − zoneChangedAtMs` (CrashEffect philosophy — no timers, no extra loops). Zone palettes live in `theme.zones`; a `useZoneColor` hook in a new `src/render/zonePalette.ts` does the interpolation. JS-thread effects (chime, haptic, announcement state, rotor rate) fire through the existing `useAnimatedReaction` + `runOnJS` pattern in GameScreen. The chime is a synthesized CC0 WAV (no downloads — ffmpeg binaries get SIGKILLed in this sandbox; plain Node writes the PCM).

**Tech Stack:** react-native-reanimated (`interpolateColor`, `useAnimatedStyle`), @shopify/react-native-skia (derived color props), expo-audio (`setPlaybackRate` — confirmed in SDK 57), expo-haptics.

## Global Constraints

- Spec: `docs/superpowers/specs/2026-07-03-difficulty-zones-design.md` (Milestone & escalation juice).
- Cosmetic tunables in `src/render/theme.ts`; nothing in theme may influence gameplay. Gameplay stays in `src/config.ts` (no changes there this phase).
- Zero allocation in the *game loop*; render-side derived values may allocate (existing precedent: text/transform deriveds).
- Sounds/haptics are called from the JS thread only, via `runOnJS` inside `useAnimatedReaction` (see GameScreen's death/tier reactions).
- MenuScreen also renders `Background` with no game loop — zone props must be optional there (static zone-0 palette).
- No new tests: this phase is render/audio wiring with no new pure engine functions; verification is `npx tsc --noEmit` + the existing 17 vitest tests + on-device checklist.
- Headless verification only; the user runs Expo Go themselves.

## File Structure

- `src/engine/useGameLoop.ts` — add `prevZoneIndex` shared value (set on crossing, reset, exposed).
- `src/render/theme.ts` — `zones` palettes (4 × 8 colors), `zoneTransitionSeconds`, `zoneAnnounce` timings; ridge layer colors move into the palettes.
- `src/render/zonePalette.ts` — new: `ZoneBlend` interface + `useZoneColor` hook.
- `src/render/Background.tsx`, `CaveWalls.tsx`, `Rocks.tsx`, `Pinches.tsx` — consume crossfaded colors.
- `src/render/GameScreen.tsx` — zoneBlend plumbing, announcement overlay, zone reaction (chime/haptic/state), rotor-intensity reaction.
- `src/audio/sounds.ts` — zone player, `playZoneChime`, `setRotorIntensity`; `src/audio/haptics.ts` — `hapticZone`.
- `assets/sounds/zone.wav` (synthesized) + `assets/sounds/LICENSES.md` entry.

---

### Task 1: Expose `prevZoneIndex` from the engine

**Files:**
- Modify: `src/engine/useGameLoop.ts`

**Interfaces:**
- Produces: `GameLoop.prevZoneIndex: SharedValue<number>` — the zone before the current one; palette crossfades read both. Equals `zoneIndex` when no transition is in flight.

- [ ] **Step 1: Add the shared value**

Declare next to `zoneIndex`:

```ts
  const prevZoneIndex = useSharedValue(0);
```

Interface entry after `zoneChangedAtMs`:

```ts
  /** The zone before the current one — palette crossfades read both. */
  prevZoneIndex: SharedValue<number>;
```

Zone-crossing block becomes:

```ts
    const zone = zoneIndexAt(scroll);
    if (zone !== zoneIndex.value) {
      prevZoneIndex.value = zoneIndex.value;
      zoneIndex.value = zone;
      zoneChangedAtMs.value = frame.timestamp;
    }
```

`resetRun` gains `prevZoneIndex.value = 0;` next to `zoneIndex.value = 0;`. Add `prevZoneIndex` to the returned object.

- [ ] **Step 2: Verify and commit**

Run: `npx tsc --noEmit` → clean; `npx vitest run` → 17 pass.

```bash
git add src/engine/useGameLoop.ts
git commit -m "feat: expose prevZoneIndex for palette crossfades"
```

---

### Task 2: Zone palettes + crossfade in every cave component

**Files:**
- Modify: `src/render/theme.ts`
- Create: `src/render/zonePalette.ts`
- Modify: `src/render/Background.tsx`, `src/render/CaveWalls.tsx`, `src/render/Rocks.tsx`, `src/render/Pinches.tsx`, `src/render/GameScreen.tsx`

**Interfaces:**
- Consumes: `GameLoop.zoneIndex/prevZoneIndex/zoneChangedAtMs/wallClockMs`.
- Produces: `interface ZoneBlend { zoneIndex; prevZoneIndex; zoneChangedAtMs; wallClockMs }` (all `SharedValue<number>`), `useZoneColor(blend: ZoneBlend | undefined, key): DerivedValue<string>`, `theme.zones`, `theme.zoneTransitionSeconds`. Components gain a `zoneBlend` prop (optional on Background — MenuScreen omits it).

- [ ] **Step 1: Add palettes and transition timing to theme**

In `theme.ts` add top-level keys (after `colors`):

```ts
  /** Per-zone cave palettes (indexes match config.zones). zones[0] mirrors
   * the base colors above; later zones shift the mood:
   * deep blue → cold teal → ember amber → red glow. */
  zones: [
    {
      backgroundTop: '#07090d',
      backgroundBottom: '#131a24',
      ridgeFar: '#0e131b',
      ridgeNear: '#161d28',
      wallOuter: '#1c222c',
      wallInner: '#2e3743',
      rockLit: '#39434f',
      rockDark: '#1e242e',
    },
    {
      backgroundTop: '#040c0c',
      backgroundBottom: '#0d2124',
      ridgeFar: '#091a1b',
      ridgeNear: '#102528',
      wallOuter: '#152a2c',
      wallInner: '#25444a',
      rockLit: '#2f5257',
      rockDark: '#16292c',
    },
    {
      backgroundTop: '#0c0805',
      backgroundBottom: '#231910',
      ridgeFar: '#19120b',
      ridgeNear: '#281e11',
      wallOuter: '#2b2013',
      wallInner: '#453420',
      rockLit: '#54422b',
      rockDark: '#2b2013',
    },
    {
      backgroundTop: '#0c0507',
      backgroundBottom: '#250d12',
      ridgeFar: '#1b0a0e',
      ridgeNear: '#2b1116',
      wallOuter: '#2f1318',
      wallInner: '#4b1f28',
      rockLit: '#59292f',
      rockDark: '#2d1317',
    },
  ],
  /** Palette crossfade duration at a zone boundary (s). */
  zoneTransitionSeconds: 2.5,
```

In `theme.background.layers`, delete the `color` field from both layers (ridge colors now come from the palette: layer 0 → `ridgeFar`, layer 1 → `ridgeNear`).

- [ ] **Step 2: Create `src/render/zonePalette.ts`**

```ts
import {
  interpolateColor,
  useDerivedValue,
  type DerivedValue,
  type SharedValue,
} from 'react-native-reanimated';
import { theme } from './theme';

/** Everything a component needs to crossfade palettes at a zone boundary. */
export interface ZoneBlend {
  zoneIndex: SharedValue<number>;
  prevZoneIndex: SharedValue<number>;
  zoneChangedAtMs: SharedValue<number>;
  wallClockMs: SharedValue<number>;
}

export type ZonePaletteKey = keyof (typeof theme.zones)[number];

/**
 * Crossfaded palette color — a pure function of wallClock − zoneChangedAt
 * (CrashEffect philosophy: no timers, no extra loops). Without a blend
 * (menu screens) it returns the first zone's color, statically.
 */
export function useZoneColor(
  blend: ZoneBlend | undefined,
  key: ZonePaletteKey,
): DerivedValue<string> {
  return useDerivedValue(() => {
    if (blend === undefined) return theme.zones[0][key];
    const from = theme.zones[blend.prevZoneIndex.value][key];
    const to = theme.zones[blend.zoneIndex.value][key];
    if (blend.zoneChangedAtMs.value === 0 || from === to) return to;
    const t = (blend.wallClockMs.value - blend.zoneChangedAtMs.value) / 1000;
    const p = t / theme.zoneTransitionSeconds;
    if (p >= 1) return to;
    return interpolateColor(Math.max(0, p), [0, 1], [from, to]);
  });
}
```

- [ ] **Step 3: Wire Background (optional blend — MenuScreen stays untouched)**

`BackgroundProps` gains `zoneBlend?: ZoneBlend`. In `Background`:

```ts
  const bgTop = useZoneColor(zoneBlend, 'backgroundTop');
  const bgBottom = useZoneColor(zoneBlend, 'backgroundBottom');
  const bgColors = useDerivedValue(() => [bgTop.value, bgBottom.value]);
  const ridgeFar = useZoneColor(zoneBlend, 'ridgeFar');
  const ridgeNear = useZoneColor(zoneBlend, 'ridgeNear');
```

The gradient `colors={[theme.colors.backgroundTop, theme.colors.backgroundBottom]}` becomes `colors={bgColors}`. `RidgeCopy`'s `color` prop type widens to `SharedValue<string> | string` and each copy receives `color={li === 0 ? ridgeFar : ridgeNear}` (replacing `layer.color`, which no longer exists).

- [ ] **Step 4: Wire CaveWalls, Rock, Pinch (required blend)**

Each component's props gain `zoneBlend: ZoneBlend`.

CaveWalls:

```ts
  const wallOuter = useZoneColor(zoneBlend, 'wallOuter');
  const wallInner = useZoneColor(zoneBlend, 'wallInner');
  const topGradient = useDerivedValue(() => [wallOuter.value, wallInner.value]);
  const bottomGradient = useDerivedValue(() => [wallInner.value, wallOuter.value]);
```

The two `LinearGradient`s use `topGradient`/`bottomGradient`; `TeethCopy` gains a `color: SharedValue<string>` prop (replacing its `theme.colors.wallInner` read) and both copies receive `color={wallInner}`.

Rock:

```ts
  const rockLit = useZoneColor(zoneBlend, 'rockLit');
  const rockDark = useZoneColor(zoneBlend, 'rockDark');
  const fillColors = useDerivedValue(() => [rockLit.value, rockDark.value]);
```

`LinearGradient` uses `colors={fillColors}`.

Pinch:

```ts
  const wallInner = useZoneColor(zoneBlend, 'wallInner');
```

All four `theme.colors.wallInner` reads (two Rects, two teeth Paths) become `color={wallInner}`.

- [ ] **Step 5: Plumb the blend from GameScreen**

Destructure `prevZoneIndex` and `zoneChangedAtMs` from `loop`. Build a stable blend object:

```ts
  const zoneBlend = useMemo(
    () => ({ zoneIndex, prevZoneIndex, zoneChangedAtMs, wallClockMs }),
    [zoneIndex, prevZoneIndex, zoneChangedAtMs, wallClockMs],
  );
```

Pass `zoneBlend={zoneBlend}` to `Background`, every `Pinch`, every `Rock`, and `CaveWalls`. (`import { useMemo } from 'react'` and the `ZoneBlend` type as needed.)

- [ ] **Step 6: Verify and commit**

Run: `npx tsc --noEmit` → clean (proves MenuScreen still compiles with no new props); `npx vitest run` → 17 pass.

```bash
git add src/render/theme.ts src/render/zonePalette.ts src/render/Background.tsx src/render/CaveWalls.tsx src/render/Rocks.tsx src/render/Pinches.tsx src/render/GameScreen.tsx
git commit -m "feat: zone palettes crossfade the cave at each boundary"
```

---

### Task 3: Zone chime, haptic, and announcement overlay

**Files:**
- Create: `assets/sounds/zone.wav` (synthesized by a scratchpad Node script)
- Modify: `assets/sounds/LICENSES.md`, `src/audio/sounds.ts`, `src/audio/haptics.ts`, `src/render/theme.ts`, `src/render/GameScreen.tsx`

**Interfaces:**
- Consumes: `GameLoop.zoneIndex/zoneChangedAtMs/wallClockMs`, `config.zones[i].{name, atMeters}`.
- Produces: `playZoneChime(): void`, `hapticZone(): void`, `theme.zoneAnnounce = { fadeInSeconds, holdSeconds, fadeOutSeconds }`.

- [ ] **Step 1: Synthesize the chime**

Write this to the scratchpad as `make-zone-chime.js` and run `node make-zone-chime.js <repo>/assets/sounds/zone.wav`:

```js
const fs = require('fs');
const SR = 44100;
const N = Math.floor(SR * 1.0);
const buf = new Float64Array(N);

// Two-note bell (E5 → B5): fundamental + a fast-decaying 2nd partial.
function bell(freq, startS, amp, decay) {
  const start = Math.floor(startS * SR);
  for (let i = start; i < N; i++) {
    const t = (i - start) / SR;
    buf[i] +=
      amp * Math.exp(-decay * t) * Math.sin(2 * Math.PI * freq * t) +
      amp * 0.3 * Math.exp(-decay * 1.7 * t) * Math.sin(2 * Math.PI * freq * 2.01 * t);
  }
}
bell(659.26, 0.0, 0.55, 5.5);
bell(987.77, 0.11, 0.5, 4.5);

let peak = 0;
for (const v of buf) peak = Math.max(peak, Math.abs(v));
const gain = 0.75 / peak;
const fade = Math.floor(SR * 0.004); // de-click both edges
const data = Buffer.alloc(N * 2);
for (let i = 0; i < N; i++) {
  let v = buf[i] * gain;
  if (i < fade) v *= i / fade;
  if (i > N - fade) v *= (N - i) / fade;
  data.writeInt16LE(Math.round(v * 32767), i * 2);
}
const h = Buffer.alloc(44);
h.write('RIFF', 0); h.writeUInt32LE(36 + data.length, 4);
h.write('WAVE', 8); h.write('fmt ', 12);
h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(1, 22);
h.writeUInt32LE(SR, 24); h.writeUInt32LE(SR * 2, 28);
h.writeUInt16LE(2, 32); h.writeUInt16LE(16, 34);
h.write('data', 36); h.writeUInt32LE(data.length, 40);
fs.writeFileSync(process.argv[2], Buffer.concat([h, data]));
console.log('wrote', process.argv[2]);
```

Verify with `afinfo assets/sounds/zone.wav` (expect: 1 ch, 44100 Hz, 16-bit LPCM, ~1.0 s). Append to `LICENSES.md`: `zone.wav` — synthesized for this project with a Node script (pure sine bell); public domain / CC0.

- [ ] **Step 2: Add the zone player and haptic**

`src/audio/sounds.ts` — extend the players record type and `initAudio`:

```ts
  const zone = createAudioPlayer(require('../../assets/sounds/zone.wav'));
  zone.volume = 0.8;
  players = { click, rotor, crash, zone };
```

New function:

```ts
/** Zone milestone chime. */
export function playZoneChime(): void {
  if (!soundOn || players === null) return;
  players.zone.seekTo(0);
  players.zone.play();
}
```

`src/audio/haptics.ts`:

```ts
/** Zone milestone: a medium thump — bigger than a graze, smaller than death. */
export function hapticZone(): void {
  if (!hapticsOn) return;
  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
}
```

- [ ] **Step 3: Announcement timing in theme**

Add to `theme.ts` (next to `zoneTransitionSeconds`):

```ts
  /** Zone announcement overlay: fade in / hold / fade out (s). */
  zoneAnnounce: { fadeInSeconds: 0.35, holdSeconds: 1.6, fadeOutSeconds: 0.55 },
```

- [ ] **Step 4: Announcement overlay + zone reaction in GameScreen**

Imports: `useAnimatedStyle` from reanimated, `playZoneChime` from sounds, `hapticZone` from haptics.

State + handler next to the game-over state:

```ts
  const [announce, setAnnounce] = useState<{ name: string; meters: number } | null>(null);
  const handleZoneChange = (zone: number) => {
    setAnnounce({
      name: config.zones[zone].name,
      meters: config.zones[zone].atMeters,
    });
    playZoneChime();
    hapticZone();
  };
```

Reaction (below the tier reaction; `current > previous` so retries reset silently):

```ts
  useAnimatedReaction(
    () => zoneIndex.value,
    (current, previous) => {
      if (previous !== null && current > previous) {
        runOnJS(handleZoneChange)(current);
      }
    },
  );
```

Opacity — a pure function of the wall clock, no timers:

```ts
  const announceStyle = useAnimatedStyle(() => {
    const a = theme.zoneAnnounce;
    if (zoneChangedAtMs.value === 0) return { opacity: 0 };
    const t = (wallClockMs.value - zoneChangedAtMs.value) / 1000;
    let opacity = 0;
    if (t >= 0 && t < a.fadeInSeconds) {
      opacity = t / a.fadeInSeconds;
    } else if (t < a.fadeInSeconds + a.holdSeconds) {
      opacity = 1;
    } else if (t < a.fadeInSeconds + a.holdSeconds + a.fadeOutSeconds) {
      opacity = 1 - (t - a.fadeInSeconds - a.holdSeconds) / a.fadeOutSeconds;
    }
    return { opacity };
  });
```

JSX between `</GestureDetector>` and the game-over overlay (so GAME OVER draws on top):

```tsx
      {announce !== null && (
        <Animated.View
          style={[styles.announce, announceStyle]}
          pointerEvents="none"
        >
          <Text style={styles.announceName}>{announce.name}</Text>
          <Text style={styles.announceMeters}>{announce.meters} m</Text>
        </Animated.View>
      )}
```

Styles:

```ts
  announce: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  announceName: {
    color: '#dce3ec',
    fontSize: 28,
    fontWeight: '800',
    letterSpacing: 8,
  },
  announceMeters: {
    color: '#ffb648',
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: 3,
    marginTop: 6,
  },
```

- [ ] **Step 5: Verify and commit**

Run: `npx tsc --noEmit` → clean; `npx vitest run` → 17 pass.

```bash
git add assets/sounds/zone.wav assets/sounds/LICENSES.md src/audio/sounds.ts src/audio/haptics.ts src/render/theme.ts src/render/GameScreen.tsx
git commit -m "feat: zone announcement overlay with chime and haptic"
```

---

### Task 4: Rotor intensity rises with scroll speed

**Files:**
- Modify: `src/audio/sounds.ts`, `src/render/GameScreen.tsx`

**Interfaces:**
- Consumes: `rampAt`, `config.difficulty.scrollSpeed`, `GameLoop.scrollX`.
- Produces: `setRotorIntensity(progress: number): void` (0 → base pitch/volume, 1 → +25 % rate, +20 % volume).

- [ ] **Step 1: `setRotorIntensity` in sounds.ts**

Module constants + function; `initAudio`'s `rotor.volume = 0.45;` becomes `rotor.volume = ROTOR_BASE_VOLUME;`, and `startRotor` resets intensity for fresh runs:

```ts
const ROTOR_BASE_VOLUME = 0.45;
/** At full scroll-speed ramp the rotor spins 25% faster (pitch rises too —
 * no pitch correction on purpose) and plays 20% louder. */
const ROTOR_RATE_SPAN = 0.25;
const ROTOR_VOLUME_SPAN = 0.2;

export function startRotor(): void {
  if (!soundOn || players === null) return;
  setRotorIntensity(0);
  players.rotor.seekTo(0);
  players.rotor.play();
}

/** Rotor urgency mapped from the scroll-speed ramp progress (0–1). */
export function setRotorIntensity(progress: number): void {
  if (players === null) return;
  const p = Math.min(1, Math.max(0, progress));
  players.rotor.setPlaybackRate(1 + ROTOR_RATE_SPAN * p);
  players.rotor.volume = ROTOR_BASE_VOLUME * (1 + ROTOR_VOLUME_SPAN * p);
}
```

- [ ] **Step 2: Quantized reaction in GameScreen**

Import `rampAt` from `'../engine/spawning'` and `setRotorIntensity` from sounds. Below the zone reaction — quantized to 1/20 steps so `runOnJS` fires ~every few seconds, not per frame:

```ts
  useAnimatedReaction(
    () => {
      const ramp = config.difficulty.scrollSpeed;
      const speed = rampAt(scrollX.value, ramp);
      return Math.round(((speed - ramp.start) / (ramp.cap - ramp.start)) * 20);
    },
    (bucket, previous) => {
      if (previous !== null && bucket !== previous) {
        runOnJS(setRotorIntensity)(bucket / 20);
      }
    },
  );
```

- [ ] **Step 3: Verify and commit**

Run: `npx tsc --noEmit` → clean; `npx vitest run` → 17 pass.

```bash
git add src/audio/sounds.ts src/render/GameScreen.tsx
git commit -m "feat: rotor pitch and volume rise with scroll speed"
```

---

## Verification (end of Phase B)

Headless: `npx tsc --noEmit` clean; `npx vitest run` 17 pass; `afinfo assets/sounds/zone.wav` valid.

On device (user, Expo Go):
- At 1500 m: "THE DRIFT — 1500 m" fades in centre-screen, chime + medium haptic fire, and the whole cave (background, ridges, walls, rocks, pinch shelves) crossfades blue → teal over ~2.5 s. Same at 4000 m (amber) and 7000 m (red).
- Rotor audibly climbs in pitch/volume as speed ramps over the first ~68 s; resets to base on retry.
- Menu screen backdrop is unchanged (zone-0 palette).
- Sound/haptics toggles in Settings silence the chime/haptic; no frame hitches at zone boundaries.
