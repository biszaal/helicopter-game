# Difficulty Phase D — Graze Feedback Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Double down on the risk-reward pillar: a banked graze throws a spark burst off the helicopter and whooshes; at high multipliers each tier-up also pulses an amber glow around the screen edges.

**Architecture:** The engine records a graze-bank event as three shared values (`grazeAtMs`, `grazeY`, `grazeSeed`) at the two existing `applyGrazes` sites. Everything visible is a pure function of `wallClockMs − grazeAtMs` (CrashEffect pattern: module-level `mulberry32` seeds, derived transforms, parked off-screen when idle — zero allocation, no timers). The whoosh is a synthesized filtered-noise sweep played from the existing tier-up reaction. The pulse is one full-screen Rect with a static radial vignette gradient and a derived opacity.

**Tech Stack:** react-native-skia (RadialGradient, derived props), reanimated, expo-audio, Node WAV synthesis (no downloads — ffmpeg gets SIGKILLed in this sandbox).

## Global Constraints

- Spec: `docs/superpowers/specs/2026-07-03-difficulty-zones-design.md` (Graze feedback upgrades; screen-edge glow chosen over time dilation).
- Cosmetic tunables in `theme.ts` only; no gameplay influence. Zero allocation in the loop (three shared-value writes per bank event are fine).
- Sounds via `runOnJS` from the existing `useAnimatedReaction` on `tierIndex` (fires once per bank even when a pinch banks 2 grazes — `current > previous`).
- Verification: `npx tsc --noEmit`, `npx vitest run` (27), `afinfo` on the new WAV; feel-testing on device by the user.

## File Structure

- `src/engine/useGameLoop.ts` — graze event shared values, set at both bank sites, reset, exposed.
- `src/render/GrazeSparks.tsx` — new: `GrazeSparks` (burst) + `GrazePulse` (vignette).
- `src/render/theme.ts` — `sparks` + `grazePulse` blocks.
- `src/audio/sounds.ts` — whoosh player + `playWhoosh()`; `assets/sounds/whoosh.wav` + LICENSES entry.
- `src/render/GameScreen.tsx` — mount components, add whoosh to the tier reaction.

---

### Task 1: Graze event in the engine

**Files:**
- Modify: `src/engine/useGameLoop.ts`

**Interfaces:**
- Produces: `GameLoop.grazeAtMs/grazeY/grazeSeed: SharedValue<number>` — wall clock of the last banked graze (0 = none this run), heli centre y at that moment (shu), and a 0..1 seed for burst variety.

- [ ] **Step 1:** Declare next to the zone values:

```ts
  /** Last banked graze: wall clock (0 = none), heli y (shu), 0..1 seed. */
  const grazeAtMs = useSharedValue(0);
  const grazeY = useSharedValue(0);
  const grazeSeed = useSharedValue(0);
```

Interface doc entries mirror the comment. At BOTH bank sites (rock clear, pinch clear), right after the `applyGrazes` result assignment, add:

```ts
            grazeAtMs.value = frame.timestamp;
            grazeY.value = pos;
            grazeSeed.value = Math.random();
```

`resetRun` gains `grazeAtMs.value = 0;`. Add all three to the returned object.

- [ ] **Step 2:** `npx tsc --noEmit` clean, `npx vitest run` 27 pass; commit `feat: engine records graze-bank events`.

---

### Task 2: Whoosh on bank

**Files:**
- Create: `assets/sounds/whoosh.wav` (synthesized)
- Modify: `assets/sounds/LICENSES.md`, `src/audio/sounds.ts`, `src/render/GameScreen.tsx`

- [ ] **Step 1:** Scratchpad `make-whoosh.js` — 0.28 s of white noise through a state-variable bandpass whose centre sweeps 500 → 2200 Hz, sharp attack (30 ms) and exponential decay, normalized to 0.7, de-clicked edges, 16-bit mono 44.1 kHz WAV (same header code as the chime script). Run it to write `assets/sounds/whoosh.wav`; verify with `afinfo`. LICENSES entry: synthesized, CC0.

- [ ] **Step 2:** `sounds.ts` — add `whoosh: AudioPlayer` to the players record, `whoosh.volume = 0.5;`, and:

```ts
/** Graze banked — a quick air-cut past the rock. */
export function playWhoosh(): void {
  if (!soundOn || players === null) return;
  players.whoosh.seekTo(0);
  players.whoosh.play();
}
```

- [ ] **Step 3:** GameScreen tier reaction adds `runOnJS(playWhoosh)();` next to `runOnJS(hapticGraze)();` (import it).

- [ ] **Step 4:** Verify + commit `feat: whoosh sound when a graze banks`.

---

### Task 3: Spark burst + high-tier pulse

**Files:**
- Modify: `src/render/theme.ts`, `src/render/GameScreen.tsx`
- Create: `src/render/GrazeSparks.tsx`

**Interfaces:**
- Consumes: `GameLoop.grazeAtMs/grazeY/grazeSeed/wallClockMs/tierIndex`, `mulberry32` from `./shapes`.
- Produces: `<GrazeSparks centerX screenHeight grazeY grazeSeed grazeAtMs wallClockMs />` (inside the world group, after Helicopter) and `<GrazePulse width height tierIndex grazeAtMs wallClockMs />` (screen-space, after the world group, before HUD).

- [ ] **Step 1:** theme additions:

```ts
  /** Graze feedback: spark burst streaking back off the helicopter. */
  sparks: {
    count: 7,
    lifetime: 0.35,
    /** Backward streak speed range (shu/s). */
    speedMin: 0.25,
    speedMax: 0.55,
    /** Half-angle of the backward fan (rad). */
    spread: 0.5,
    /** Spark radius range (shu). */
    sizeMin: 0.004,
    sizeMax: 0.009,
  },
  /** Amber edge glow on tier-ups at high multipliers. */
  grazePulse: {
    /** Tier index (into multiplierTiers) where the pulse starts — 5 = ×6. */
    minTierIndex: 5,
    inSeconds: 0.08,
    outSeconds: 0.35,
    maxOpacity: 0.3,
  },
```

- [ ] **Step 2:** `GrazeSparks.tsx` — CrashEffect pattern. Module seeds via `mulberry32(1234)`: per spark `{ angleOff: (rng()−0.5)·2·spread, speed: speedMin + rng()·(speedMax−speedMin), size: sizeMin + rng()·(sizeMax−sizeMin), flicker: 0.7 + rng()·0.3 }`. Each `Spark` is a `Circle` colored `theme.colors.amber`:
  - `t = (wallClockMs − grazeAtMs)/1000`; parked off-screen when `grazeAtMs === 0 || t < 0 || t > lifetime`.
  - Direction: straight back (angle π) plus `angleOff` plus a per-burst twist `(grazeSeed − 0.5) · 0.6`.
  - `cx = centerX + cos(angle)·speed·t·screenHeight`, `cy = grazeY·screenHeight + sin(angle)·speed·t·screenHeight`, `opacity = flicker·(1 − t/lifetime)`.

  `GrazePulse` in the same file: a full-screen `Rect` with a static `RadialGradient` (`c = vec(width/2, height/2)`, `r = 0.75·max(width,height)`, colors `['rgba(255,182,72,0)', 'rgba(255,182,72,0.55)']`, positions `[0.55, 1]`) and derived opacity: 0 unless `tierIndex ≥ minTierIndex` and `0 ≤ t ≤ in+out`; ramps to `maxOpacity` over `inSeconds`, decays over `outSeconds`.

- [ ] **Step 3:** GameScreen destructures `grazeAtMs, grazeY, grazeSeed`; mounts `GrazeSparks` after `Helicopter` (inside the shake group) and `GrazePulse` after the closing shake `Group` (before the HUD SkiaTexts).

- [ ] **Step 4:** Verify + commit `feat: graze sparks and high-tier edge pulse`.

---

## Verification (end of Phase D)

Headless: `npx tsc --noEmit` clean; `npx vitest run` 27 pass; `afinfo assets/sounds/whoosh.wav` valid.

On device: shaving a rock throws a short amber spark streak backward off the heli + whoosh + the existing haptic; a pinch pass banking both spurs fires one burst/whoosh; from ×6 up each bank also pulses the screen edges amber; retry clears everything (no stray sparks); Settings sound toggle silences the whoosh.
