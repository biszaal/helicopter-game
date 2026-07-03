# Difficulty Phase A — Ramp Core + Zone Engine Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Difficulty becomes distance-driven: scroll speed, spawn intervals, corridor clearance, rock size, and pinch gaps all ramp with distance scrolled, and the run is segmented into named zones shown in the HUD.

**Architecture:** One `rampAt(d, ramp)` helper in `src/engine/spawning.ts` evaluates every dial as linear-with-cap over `scrollX` (shu). A `config.zones` table maps distance milestones to names; the loop tracks the current zone in shared values. Spawn *schedules* stay time-based, but the interval sampled at each spawn comes from a distance ramp.

**Tech Stack:** Expo SDK 57, react-native-reanimated worklets (UI-thread loop), @shopify/react-native-skia (render), vitest (new — pure-function tests).

## Global Constraints

- Spec: `docs/superpowers/specs/2026-07-03-difficulty-zones-design.md` (Phase A section).
- ALL gameplay tunables live in `src/config.ts`; cosmetic values in `src/render/theme.ts`. Never inline a tuning number.
- Units: "shu" = screen-height units; velocities shu/s; times seconds. Fixed timestep 120 Hz — motion must be identical at any render Hz.
- Zero allocation inside the frame loop; obstacles stay pooled.
- Locked rules untouched: score monotonic, one-tier decay, hitbox strictly < sprite, portrait.
- Loop/spawn code runs as worklets on the UI thread — every function they call needs the `'worklet'` directive; JS-thread side effects only via existing `useAnimatedReaction` + `runOnJS` patterns.
- Expo has changed: consult https://docs.expo.dev/versions/v57.0.0/ before using any new Expo API (none expected in Phase A).
- Headless verification only (`npx tsc --noEmit`, `npx vitest run`); the user runs Expo Go on their phone themselves.

## File Structure

- `src/config.ts` — replace time-based difficulty keys with distance ramps; add `zones` table.
- `src/engine/spawning.ts` — `Ramp` type, `rampAt`, `zoneIndexAt`; migrate `sizeScaleAt`, `pinchGapAt`, `pinchSpurs` to distance; `placeRock` takes clearance as a parameter.
- `src/engine/useGameLoop.ts` — consume ramps (speed, intervals, clearance), track zone shared values, ramped scoring rate, reset zone state.
- `src/render/GameScreen.tsx` — plain zone-name label in the HUD.
- `src/engine/__tests__/spawning.test.ts` — new; tests for all pure functions.
- `package.json` — add `vitest` devDependency and `test` script.

---

### Task 1: Test harness + ramp and zone primitives

**Files:**
- Modify: `package.json` (devDependency + script)
- Modify: `src/config.ts` (add `zones` table only — nothing removed yet)
- Modify: `src/engine/spawning.ts` (add `Ramp`, `rampAt`, `zoneIndexAt`)
- Test: `src/engine/__tests__/spawning.test.ts` (new)

**Interfaces:**
- Consumes: `config.scoring.metersPerShu` (existing, = 100).
- Produces: `interface Ramp { start: number; perShu: number; cap: number }`, `rampAt(d: number, ramp: Ramp): number`, `zoneIndexAt(distanceShu: number): number`, `config.zones: readonly { atMeters, name }[]` — Tasks 2 and 3 depend on these exact names.

- [ ] **Step 1: Install vitest and add the test script**

```bash
npm install --save-dev vitest
```

Then in `package.json` `"scripts"`, add:

```json
"test": "vitest run"
```

- [ ] **Step 2: Write the failing tests**

Create `src/engine/__tests__/spawning.test.ts`:

```ts
import { describe, expect, test } from 'vitest';
import { rampAt, zoneIndexAt } from '../spawning';

describe('rampAt', () => {
  const up = { start: 0.55, perShu: 0.008, cap: 0.95 };
  const down = { start: 0.9, perShu: -0.008, cap: 0.5 };

  test('returns start at zero distance', () => {
    expect(rampAt(0, up)).toBe(0.55);
  });
  test('rises linearly with distance', () => {
    expect(rampAt(10, up)).toBeCloseTo(0.63);
  });
  test('clamps a rising ramp at its cap', () => {
    expect(rampAt(1000, up)).toBe(0.95);
  });
  test('falls linearly when perShu is negative', () => {
    expect(rampAt(10, down)).toBeCloseTo(0.82);
  });
  test('clamps a falling ramp at its floor', () => {
    expect(rampAt(1000, down)).toBe(0.5);
  });
});

describe('zoneIndexAt', () => {
  // config.zones boundaries: 0 / 1500 / 4000 / 7000 m; 1 shu = 100 m.
  test('run start is the first zone', () => {
    expect(zoneIndexAt(0)).toBe(0);
  });
  test('stays in the previous zone just before a boundary', () => {
    expect(zoneIndexAt(14.9)).toBe(0);
  });
  test('crossing a boundary enters the zone', () => {
    expect(zoneIndexAt(15)).toBe(1);
  });
  test('deep runs stay in the last zone forever', () => {
    expect(zoneIndexAt(1000)).toBe(3);
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npx vitest run`
Expected: FAIL — `spawning.ts` has no exported member `rampAt` / `zoneIndexAt`.

- [ ] **Step 4: Add the zones table to config**

In `src/config.ts`, insert between the `graze` block and the `difficulty` block:

```ts
  zones: [
    // Named stretches of cave, by distance. The cave runs 55–95 m/s
    // (metersPerShu = 100), so boundaries are set by wall-clock feel:
    // ~25 s / ~57 s / ~89 s into a run at ramp pace.
    { atMeters: 0, name: 'SHALLOWS' },
    { atMeters: 1500, name: 'THE DRIFT' },
    { atMeters: 4000, name: 'THE WALLS' },
    { atMeters: 7000, name: 'THE DEEP' },
  ],
```

- [ ] **Step 5: Implement `Ramp`, `rampAt`, `zoneIndexAt`**

In `src/engine/spawning.ts`, add below the `OccupiedRect` interface:

```ts
/** A linear-with-cap difficulty dial: value = start + perShu·distance,
 * clamped at cap. perShu may be negative — then cap is a floor. */
export interface Ramp {
  start: number;
  perShu: number;
  cap: number;
}

/** Dial value after d shu of scroll — every difficulty curve in the game. */
export function rampAt(d: number, ramp: Ramp): number {
  'worklet';
  const v = ramp.start + ramp.perShu * d;
  return ramp.perShu >= 0 ? Math.min(v, ramp.cap) : Math.max(v, ramp.cap);
}

/** Which zone (index into config.zones) a run at this distance is in. */
export function zoneIndexAt(distanceShu: number): number {
  'worklet';
  const meters = distanceShu * config.scoring.metersPerShu;
  let index = 0;
  for (let i = 1; i < config.zones.length; i++) {
    if (meters >= config.zones[i].atMeters) index = i;
  }
  return index;
}
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `npx vitest run`
Expected: PASS (9 tests). Also run `npx tsc --noEmit` — expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add package.json package-lock.json src/config.ts src/engine/spawning.ts src/engine/__tests__/spawning.test.ts
git commit -m "feat: add distance-ramp and zone primitives + vitest harness"
```

---

### Task 2: Drive difficulty from distance

**Files:**
- Modify: `src/config.ts` (rework `difficulty`, remove migrated keys)
- Modify: `src/engine/spawning.ts` (migrate `sizeScaleAt`, `pinchGapAt`, `pinchSpurs`, `placeRock`)
- Modify: `src/engine/useGameLoop.ts` (consume ramps; ramped scoring)
- Test: `src/engine/__tests__/spawning.test.ts` (extend)

**Interfaces:**
- Consumes: `Ramp`, `rampAt` from Task 1.
- Produces: `sizeScaleAt(distanceShu: number): number`, `pinchGapAt(distanceShu: number): number`, `pinchSpurs(distanceShu: number, rng: () => number)`, `placeRock(x1, x2, halfH, occupied, rng, clearance: number): number | null`, `config.difficulty.{scrollSpeed, rockInterval, clearance, sizeScale, pinchGap, pinchInterval}: Ramp`. Phase C will reuse `placeRock`'s clearance parameter and these ramps.

- [ ] **Step 1: Extend the tests (failing)**

Append to `src/engine/__tests__/spawning.test.ts`:

```ts
import { placeRock, pinchGapAt, sizeScaleAt } from '../spawning';

describe('sizeScaleAt (distance-driven)', () => {
  test('rocks start at 1×', () => {
    expect(sizeScaleAt(0)).toBe(1);
  });
  test('rocks grow with distance', () => {
    expect(sizeScaleAt(10)).toBeCloseTo(1.22);
  });
  test('growth caps', () => {
    expect(sizeScaleAt(10_000)).toBe(2.2);
  });
});

describe('pinchGapAt (distance-driven)', () => {
  test('first pinches are wide', () => {
    expect(pinchGapAt(0)).toBe(0.4);
  });
  test('pinches narrow with distance', () => {
    expect(pinchGapAt(10)).toBeCloseTo(0.36);
  });
  test('the gap never drops below its floor', () => {
    expect(pinchGapAt(10_000)).toBe(0.18);
  });
});

describe('placeRock clearance parameter', () => {
  // One rock mid-tunnel leaves ~0.4 shu of free space above and below it.
  const occupied = [{ x1: 0, x2: 0.2, y1: 0.45, y2: 0.55 }];
  const rng = () => 0.5; // deterministic candidate: centre of the valid band

  test('placement succeeds when a corridor of the passed clearance survives', () => {
    expect(placeRock(0, 0.2, 0.05, occupied, rng, 0.16)).not.toBeNull();
  });
  test('placement is rejected when the demanded clearance cannot survive', () => {
    expect(placeRock(0, 0.2, 0.05, occupied, rng, 1.5)).toBeNull();
  });
});
```

(Merge the import with the existing `import { rampAt, zoneIndexAt } from '../spawning';` line — one combined import.)

Run: `npx vitest run`
Expected: FAIL — `placeRock` called with 6 arguments (has 5); `sizeScaleAt(10)` returns 1.12 (still time-based math), etc.

- [ ] **Step 2: Rework `config.difficulty` and delete the migrated keys**

In `src/config.ts`:

Replace the whole `difficulty` block with:

```ts
  difficulty: {
    // Every dial is a linear-with-cap ramp over DISTANCE scrolled (shu), so
    // difficulty at a given metre mark is identical for every run. The cave
    // runs 55–95 m/s; these caps land around 5000 m ≈ 68 s into a run.
    /** Scroll speed (shu/s) — the core adrenaline dial. */
    scrollSpeed: { start: 0.55, perShu: 0.008, cap: 0.95 },
    /** Mean seconds between rock spawns — rocks arrive more often deeper in. */
    rockInterval: { start: 0.9, perShu: -0.008, cap: 0.5 },
    /** Guaranteed flyable corridor height (shu) — snug deeper in, never
     * unfair: heli hitbox 0.035 + a graze band each side ≈ 0.105. */
    clearance: { start: 0.16, perShu: -0.0007, cap: 0.13 },
    /** Rock size multiplier — "obstacles get bigger the deeper you go". */
    sizeScale: { start: 1, perShu: 0.022, cap: 2.2 },
    /** Pinch corridor height (shu) — "the narrow parts get narrower". */
    pinchGap: { start: 0.4, perShu: -0.004, cap: 0.18 },
    /** Mean seconds between pinches. */
    pinchInterval: { start: 14, perShu: -0.08, cap: 10 },
  },
```

Delete these now-superseded keys (each replaced by a ramp's `start`):
- `world.baseScrollSpeed` (line 49–50)
- `obstacles.spawnIntervalBase` (lines 59–60) — keep `spawnIntervalJitter`
- `obstacles.minVerticalClearance` (lines 70–72) — update the corridor doc comment on `xClearWindow` if it references it
- `pinch.intervalSeconds` (lines 88–89) — keep `firstAtSeconds` and `intervalJitter`
- `pinch.gapStart`, `pinch.gapShrinkPerSecond`, `pinch.gapMin` (lines 94–99)

- [ ] **Step 3: Migrate the spawning functions**

In `src/engine/spawning.ts`:

Replace `sizeScaleAt` and `pinchGapAt` with:

```ts
/** "Rocks get bigger the deeper you go": size multiplier at a run distance. */
export function sizeScaleAt(distanceShu: number): number {
  'worklet';
  return rampAt(distanceShu, config.difficulty.sizeScale);
}

/** "Pinches get narrower the further you go": corridor height at a distance. */
export function pinchGapAt(distanceShu: number): number {
  'worklet';
  return rampAt(distanceShu, config.difficulty.pinchGap);
}
```

In `pinchSpurs`, rename the first parameter `elapsedSeconds` → `distanceShu` and pass it to `pinchGapAt(distanceShu)`; update its doc comment to say "for a pinch spawned at the given run distance". Body otherwise unchanged.

In `placeRock`, add a trailing parameter and drop the config read:

```ts
export function placeRock(
  x1: number,
  x2: number,
  halfH: number,
  occupied: OccupiedRect[],
  rng: () => number,
  clearance: number,
): number | null {
  'worklet';
  const wall = config.world.wallThickness;
  const xWindow = config.obstacles.xClearWindow;
```

(The line `const clearance = config.obstacles.minVerticalClearance;` is deleted; the rest of the body is unchanged. Extend the doc comment: clearance is passed in because it ramps with distance.)

- [ ] **Step 4: Consume the ramps in the game loop**

In `src/engine/useGameLoop.ts`:

1. Import `rampAt` alongside the existing spawning imports.

2. `spawnPinch` loses its `now` parameter and samples by distance:

```ts
  const spawnPinch = (scroll: number) => {
    'worklet';
    for (let i = 0; i < pinches.length; i++) {
      const p = pinches[i];
      if (p.active.value === 0) {
        const spurs = pinchSpurs(scroll, Math.random);
```

3. `spawnRock` loses its `now` parameter; size and clearance come from distance:

```ts
  const spawnRock = (scroll: number) => {
    'worklet';
    const { baseWidth, baseHeight, sizeJitter } = config.obstacles;
    const scale = sizeScaleAt(scroll);
```

and the `placeRock` call becomes:

```ts
    const y = placeRock(
      centreX - halfW,
      centreX + halfW,
      halfH,
      occupied,
      Math.random,
      rampAt(scroll, config.difficulty.clearance),
    );
```

4. In the fixed-step `while` loop, the scroll advance (line 250) becomes:

```ts
      const speed = rampAt(scroll, config.difficulty.scrollSpeed);
      scroll += speed * FIXED_DT;
```

5. The two spawn schedules (lines 254–269) become:

```ts
      // Spawning — time schedules whose intervals shorten with distance.
      if (now >= nextRockAt.value) {
        const interval = rampAt(scroll, config.difficulty.rockInterval);
        nextRockAt.value =
          now +
          interval *
            (1 + (Math.random() * 2 - 1) * config.obstacles.spawnIntervalJitter);
        spawnRock(scroll);
      }
      if (now >= nextPinchAt.value) {
        const interval = rampAt(scroll, config.difficulty.pinchInterval);
        nextPinchAt.value =
          now +
          interval * (1 + (Math.random() * 2 - 1) * config.pinch.intervalJitter);
        spawnPinch(scroll);
      }
```

6. The banking line (375–379) uses the ramped speed — points per metre stay constant, points per second rise with pace:

```ts
      // Bank instantly at the current multiplier — the total only ever grows.
      runScore +=
        config.scoring.basePointsPerShu * tiers[tier] * speed * FIXED_DT;
```

7. Update the `elapsed` shared value's doc comment (line 85) to:

```ts
  /** Run time (s) — drives the spawn schedules. */
```

- [ ] **Step 5: Run tests and typecheck**

Run: `npx vitest run`
Expected: PASS (17 tests).
Run: `npx tsc --noEmit`
Expected: no errors (this proves no other file still reads the deleted config keys).

- [ ] **Step 6: Commit**

```bash
git add src/config.ts src/engine/spawning.ts src/engine/useGameLoop.ts src/engine/__tests__/spawning.test.ts
git commit -m "feat: drive difficulty from distance — speed, spawn, clearance ramps"
```

---

### Task 3: Zone tracking + HUD zone label

**Files:**
- Modify: `src/engine/useGameLoop.ts` (zone shared values, reset, interface)
- Modify: `src/render/GameScreen.tsx` (zone label under the distance readout)

**Interfaces:**
- Consumes: `zoneIndexAt` (Task 1), `config.zones`.
- Produces: `GameLoop.zoneIndex: SharedValue<number>`, `GameLoop.zoneChangedAtMs: SharedValue<number>` — Phase B's announcement/palette/chime work reads exactly these two.

- [ ] **Step 1: Track the zone in the loop**

In `src/engine/useGameLoop.ts`:

1. Import `zoneIndexAt` alongside the spawning imports.

2. Add to the `GameLoop` interface after `deathAtMs`:

```ts
  /** Index into config.zones — advances at each distance milestone. */
  zoneIndex: SharedValue<number>;
  /** wallClockMs at the last zone change (0 until the first crossing). */
  zoneChangedAtMs: SharedValue<number>;
```

3. Declare the shared values after `nextPinchAt`:

```ts
  const zoneIndex = useSharedValue(0);
  const zoneChangedAtMs = useSharedValue(0);
```

4. In the frame callback, right after `elapsed.value = now;` (line 402), detect crossings once per frame (not per physics step — cheaper, same result):

```ts
    const zone = zoneIndexAt(scroll);
    if (zone !== zoneIndex.value) {
      zoneIndex.value = zone;
      zoneChangedAtMs.value = frame.timestamp;
    }
```

5. In `resetRun`, after `nextPinchAt.value = ...`:

```ts
    zoneIndex.value = 0;
    zoneChangedAtMs.value = 0;
```

6. Add `zoneIndex` and `zoneChangedAtMs` to the returned object.

- [ ] **Step 2: Show the zone label in the HUD**

In `src/render/GameScreen.tsx`:

1. Add `zoneIndex` to the destructuring of `loop`.

2. Below the `distanceText` derived value:

```ts
  const zoneText = useDerivedValue(() => config.zones[zoneIndex.value].name);
```

3. Below the distance `<SkiaText>` (after line 232), add:

```tsx
          <SkiaText
            x={hudX}
            y={barY + 46}
            text={zoneText}
            font={distanceFont}
            color={theme.colors.hud}
          />
```

- [ ] **Step 3: Typecheck and full test run**

Run: `npx tsc --noEmit`
Expected: no errors.
Run: `npx vitest run`
Expected: PASS (17 tests).

- [ ] **Step 4: Commit**

```bash
git add src/engine/useGameLoop.ts src/render/GameScreen.tsx
git commit -m "feat: track zones in the loop and show the zone label in the HUD"
```

---

## Verification (end of Phase A)

Headless:
- `npx tsc --noEmit` — clean.
- `npx vitest run` — 17 tests pass.
- Ramp sanity spot-check in Node if wanted: `rampAt(50, config.difficulty.scrollSpeed)` → 0.95; `zoneIndexAt(70)` → 3.

On device (user runs Expo Go on their phone):
- The cave is noticeably faster by ~2000 m and rocks come more often; handling feels unchanged.
- Zone label reads SHALLOWS, flips to THE DRIFT / THE WALLS / THE DEEP at 1500 / 4000 / 7000 m.
- Score accumulates visibly faster late in a run (ramped banking rate).
- Crash → tap to retry: speed, spawn cadence, and zone label all reset to run-start values.
- Long survival past ~5000 m: difficulty stops escalating (caps), game stays playable.
