# Difficulty Phase C — Zone Obstacle Behaviors Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Each zone plays differently, not just harder: drifting rocks unlock in THE DRIFT (zone 1), full-height rock walls with one gap in THE WALLS (zone 2), and offset S-curve pinch pairs in THE DEEP (zone 3).

**Architecture:** All three behaviors reuse the existing pooled slots — drift adds four fields to RockSlot and a per-step `centerY` update in the loop; a wall is just N rock slots activated at the same worldX; a double pinch is two pinch slots. Pure geometry (gap placement, wall tiling, S-curve centres) lives in `spawning.ts` with vitest coverage; the worklet spawn functions in `useGameLoop.ts` orchestrate. Fairness invariants: a drifting rock's occupied rect is its full drift envelope (base ± amp + halfH) both when placing it and when other rocks avoid it; wall gaps are `clearance × gapScale` (roomier than the guaranteed corridor); the second pinch centre is reachable at max speed with ~2× slack.

**Tech Stack:** TypeScript, react-native-reanimated worklets, vitest for pure functions.

## Global Constraints

- Spec: `docs/superpowers/specs/2026-07-03-difficulty-zones-design.md` (New obstacle behaviors).
- ALL gameplay tunables in `src/config.ts`; zero allocation during the per-frame loop (spawn-time allocation is established precedent — `occupied` arrays).
- Zone gating uses `zoneIndexAt(scroll)` (zones: 0 SHALLOWS / 1 THE DRIFT / 2 THE WALLS / 3 THE DEEP).
- Locked: hitbox < sprite, score monotonic, solver never seals the tunnel (skip instead), pooled obstacles, visible obstacle ≥ kill region (rock silhouettes are inscribed in hitbox rects — holds automatically for wall segments).
- Renderers need NO changes: drift updates `slot.centerY` (already read per frame), walls/pairs are ordinary slots; pools render via existing `.map`.
- Verification: `npx tsc --noEmit`, `npx vitest run`, on-device checklist (user runs Expo Go).

## File Structure

- `src/config.ts` — new `behaviors` block; pool sizes 14→24 (rocks), 3→4 (pinches).
- `src/engine/useRockPool.ts` — drift fields on RockSlot.
- `src/engine/spawning.ts` — `spursFor`, `doublePinchCentres`, `placeWallGap`, `wallSegments` (+ internal `clampCentre` refactor).
- `src/engine/useGameLoop.ts` — drift decision + envelope in `spawnRock`, per-step drift update, `spawnWall`, `activatePinch` refactor + pair spawn, scheduling hooks.
- `src/engine/__tests__/spawning.test.ts` — new describes for the four pure functions.

---

### Task 1: Config + pool growth

**Files:**
- Modify: `src/config.ts`, `src/engine/useRockPool.ts`

**Interfaces:**
- Produces: `config.behaviors.drift/{unlockZone,chance,ampMin,ampMax,periodMin,periodMax}`, `config.behaviors.rockWall/{unlockZone,chance,gapScale,segmentHalfH,segmentHalfW,placementTries,postWallBreather}`, `config.behaviors.doublePinch/{unlockZone,chance,gapBetween,centerOffset}`; `RockSlot.baseCenterY/driftAmp/driftFreq/driftPhase`.

- [ ] **Step 1: Add the behaviors block to config.ts** (after `difficulty`):

```ts
  behaviors: {
    // Each zone unlocks one new obstacle behavior — deeper zones play
    // differently, not just faster. Indexes refer to config.zones.
    /** Zone 1 "THE DRIFT": some rocks bob vertically. The corridor solver
     * reserves each drifting rock's FULL travel envelope, so the guaranteed
     * corridor is never invaded mid-bob. */
    drift: {
      unlockZone: 1,
      /** Fraction of rock spawns that drift once unlocked. */
      chance: 0.45,
      /** Bob amplitude range (shu). */
      ampMin: 0.03,
      ampMax: 0.07,
      /** Bob period range (s). */
      periodMin: 2.5,
      periodMax: 4.5,
    },
    /** Zone 2 "THE WALLS": a stack of rocks spans the tunnel with exactly
     * one gap — a gate to thread. */
    rockWall: {
      unlockZone: 2,
      /** Fraction of rock spawns replaced by a wall once unlocked. */
      chance: 0.16,
      /** Gap height = clearance ramp × this (a gate, not a needle: at the
       * clearance floor 0.13 the gap is ≈ 0.22 shu). */
      gapScale: 1.7,
      /** Half height of each stacked segment (shu). */
      segmentHalfH: 0.055,
      /** Half width of every segment (shu). */
      segmentHalfW: 0.05,
      /** Random gap positions tried before the wall is skipped. */
      placementTries: 6,
      /** Next rock interval is stretched by this after a wall — a beat to
       * recover. */
      postWallBreather: 1.5,
    },
    /** Zone 3 "THE DEEP": pinches arrive as offset pairs — an S-curve.
     * Reachability: at cap speed 0.95 the 0.3 shu between spans takes
     * 0.32 s; max vertical speed 1.3 covers 0.41 shu ≥ centerOffset with
     * ~2× slack. */
    doublePinch: {
      unlockZone: 3,
      /** Fraction of pinch spawns that become a pair once unlocked. */
      chance: 0.6,
      /** Tunnel between the two spans (shu). Must stay < 2 × rockFreeMargin
       * so the whole S stays rock-free. */
      gapBetween: 0.3,
      /** The second corridor centre is pushed this far toward the other
       * side of the tunnel (shu). */
      centerOffset: 0.22,
    },
  },
```

Bump pools: `obstacles.poolSize: 14` → `24` (a wall bursts ~10 segments at once), comment accordingly; `pinch.poolSize: 3` → `4` (a pair holds 2 at once).

- [ ] **Step 2: Drift fields on RockSlot** (`useRockPool.ts`) — add to the interface:

```ts
  /** Anchor y for the vertical bob (equals centerY for static rocks). */
  baseCenterY: SharedValue<number>;
  /** Bob amplitude (shu) — 0 for static rocks. */
  driftAmp: SharedValue<number>;
  /** Bob angular frequency (rad/s) and phase (rad). */
  driftFreq: SharedValue<number>;
  driftPhase: SharedValue<number>;
```

and to the slot literal: `baseCenterY: useSharedValue(0), driftAmp: useSharedValue(0), driftFreq: useSharedValue(0), driftPhase: useSharedValue(0),`.

- [ ] **Step 3: Verify and commit**

Run: `npx tsc --noEmit` clean; `npx vitest run` 17 pass.

```bash
git add src/config.ts src/engine/useRockPool.ts
git commit -m "feat: behavior config and pool growth for zone obstacles"
```

---

### Task 2: Pure geometry in spawning.ts (TDD)

**Files:**
- Modify: `src/engine/spawning.ts`
- Test: `src/engine/__tests__/spawning.test.ts`

**Interfaces:**
- Produces (all `'worklet'`, all pure):
  - `spursFor(centre: number, gap: number): { topLen: number; botLen: number }`
  - `doublePinchCentres(distanceShu: number, rng: () => number): { gap: number; first: number; second: number }`
  - `placeWallGap(x1: number, x2: number, gapHalf: number, occupied: OccupiedRect[], rng: () => number): number | null`
  - `wallSegments(gapCenter: number, gapHalf: number, segmentHalfH: number): { centerY: number; halfH: number }[]`

- [ ] **Step 1: Write the failing tests** — append to `spawning.test.ts` (a `makeRng` helper returning queued values then 0.5 forever):

```ts
function makeRng(values: number[]): () => number {
  let i = 0;
  return () => (i < values.length ? values[i++] : 0.5);
}

describe('spursFor', () => {
  test('spur lengths and the gap tile the tunnel exactly', () => {
    const { topLen, botLen } = spursFor(0.4, 0.2);
    expect(topLen).toBeCloseTo(0.3);
    expect(botLen).toBeCloseTo(0.5);
    expect(topLen + 0.2 + botLen).toBeCloseTo(1);
  });
});

describe('doublePinchCentres', () => {
  test('second centre is pushed toward the other side', () => {
    // rng 1 → first centre jitters fully up (0.5 + 0.15 = 0.65, above mid)
    const c = doublePinchCentres(0, makeRng([1]));
    expect(c.first).toBeCloseTo(0.65);
    expect(c.second).toBeCloseTo(0.65 - 0.22);
  });
  test('a low first centre pushes the second up', () => {
    const c = doublePinchCentres(0, makeRng([0]));
    expect(c.first).toBeCloseTo(0.35);
    expect(c.second).toBeCloseTo(0.35 + 0.22);
  });
  test('both centres keep spurs inside the playfield at the gap floor', () => {
    // 10000 shu → gap at floor 0.18; extreme jitter must still clamp.
    const c = doublePinchCentres(10_000, makeRng([1]));
    const wall = 0.045;
    for (const centre of [c.first, c.second]) {
      expect(centre - c.gap / 2).toBeGreaterThanOrEqual(wall);
      expect(centre + c.gap / 2).toBeLessThanOrEqual(1 - wall);
    }
  });
});

describe('placeWallGap', () => {
  test('accepts a spot clear of nearby blockers', () => {
    // rng 0.5 → gap centre mid-tunnel; nothing occupied.
    expect(placeWallGap(1, 1.1, 0.11, [], makeRng([0.5]))).toBeCloseTo(0.5);
  });
  test('rejects spots overlapping a blocker, then retries', () => {
    // A blocker right at mid-tunnel in the same x window; first try (0.5)
    // collides, second try (0.1) is clear.
    const occupied = [{ x1: 1, x2: 1.1, y1: 0.45, y2: 0.55 }];
    const y = placeWallGap(1, 1.1, 0.05, occupied, makeRng([0.5, 0.1]));
    expect(y).not.toBeNull();
    expect(Math.abs((y as number) - 0.5)).toBeGreaterThan(0.1);
  });
  test('returns null when every try is blocked', () => {
    const occupied = [{ x1: 1, x2: 1.1, y1: 0, y2: 1 }];
    expect(placeWallGap(1, 1.1, 0.11, occupied, makeRng([]))).toBeNull();
  });
  test('far-away blockers are ignored', () => {
    const occupied = [{ x1: 5, x2: 5.1, y1: 0, y2: 1 }];
    expect(placeWallGap(1, 1.1, 0.11, occupied, makeRng([0.5]))).not.toBeNull();
  });
});

describe('wallSegments', () => {
  const wall = 0.045;
  test('tiles both bands exactly, never entering the gap', () => {
    const segs = wallSegments(0.5, 0.11, 0.055);
    expect(segs.length).toBeGreaterThan(0);
    for (const s of segs) {
      const top = s.centerY - s.halfH;
      const bottom = s.centerY + s.halfH;
      expect(top).toBeGreaterThanOrEqual(wall - 1e-9);
      expect(bottom).toBeLessThanOrEqual(1 - wall + 1e-9);
      const inGap = top < 0.5 + 0.11 - 1e-9 && bottom > 0.5 - 0.11 + 1e-9;
      expect(inGap).toBe(false);
    }
    // Coverage: total segment height equals tunnel height minus the gap.
    const covered = segs.reduce((sum, s) => sum + 2 * s.halfH, 0);
    expect(covered).toBeCloseTo(1 - 2 * wall - 0.22);
  });
  test('a gap flush against a wall leaves that band empty', () => {
    const segs = wallSegments(wall + 0.11, 0.11, 0.055);
    for (const s of segs) {
      expect(s.centerY - s.halfH).toBeGreaterThanOrEqual(wall + 0.22 - 1e-9);
    }
  });
});
```

Update the import list at the top of the test file to add `doublePinchCentres, placeWallGap, spursFor, wallSegments`.

- [ ] **Step 2: Run tests, verify the new ones fail** — `npx vitest run` → import errors / failures for the new describes, the original 17 still pass conceptually (file fails to import — that's the expected failure mode).

- [ ] **Step 3: Implement in spawning.ts**

Refactor `pinchSpurs` and add the new functions:

```ts
/** Clamp a corridor centre so both spurs stay inside the playfield. */
function clampCentre(centre: number, gap: number): number {
  'worklet';
  const wall = config.world.wallThickness;
  const minCentre = wall + gap / 2;
  const maxCentre = 1 - wall - gap / 2;
  if (centre < minCentre) return minCentre;
  if (centre > maxCentre) return maxCentre;
  return centre;
}

/** Spur lengths for a corridor of `gap` centred at `centre`. */
export function spursFor(
  centre: number,
  gap: number,
): { topLen: number; botLen: number } {
  'worklet';
  return { topLen: centre - gap / 2, botLen: 1 - (centre + gap / 2) };
}
```

`pinchSpurs` body becomes:

```ts
  const gap = pinchGapAt(distanceShu);
  const centre = clampCentre(
    0.5 + (rng() * 2 - 1) * config.pinch.centerJitter,
    gap,
  );
  return spursFor(centre, gap);
```

```ts
/**
 * Corridor centres for an S-curve pinch pair (zone "THE DEEP"): the first
 * is jittered like a single pinch, the second is pushed centerOffset toward
 * the other side of the tunnel. Both clamped inside the playfield.
 */
export function doublePinchCentres(
  distanceShu: number,
  rng: () => number,
): { gap: number; first: number; second: number } {
  'worklet';
  const gap = pinchGapAt(distanceShu);
  const first = clampCentre(
    0.5 + (rng() * 2 - 1) * config.pinch.centerJitter,
    gap,
  );
  const offset = config.behaviors.doublePinch.centerOffset;
  const second = clampCentre(
    first >= 0.5 ? first - offset : first + offset,
    gap,
  );
  return { gap, first, second };
}

/**
 * Pick a y for a rock wall's gap so the gap band clears every blocker near
 * the wall's x span. Returns null when nothing fits — the wall is skipped
 * (the tunnel is never sealed).
 */
export function placeWallGap(
  x1: number,
  x2: number,
  gapHalf: number,
  occupied: OccupiedRect[],
  rng: () => number,
): number | null {
  'worklet';
  const wall = config.world.wallThickness;
  const xWindow = config.obstacles.xClearWindow;
  const minY = wall + gapHalf;
  const maxY = 1 - wall - gapHalf;
  if (maxY <= minY) return null;

  const tries = config.behaviors.rockWall.placementTries;
  for (let attempt = 0; attempt < tries; attempt++) {
    const y = minY + rng() * (maxY - minY);
    let blocked = false;
    for (let i = 0; i < occupied.length; i++) {
      const o = occupied[i];
      if (
        o.x1 < x2 + xWindow &&
        o.x2 > x1 - xWindow &&
        o.y1 < y + gapHalf &&
        o.y2 > y - gapHalf
      ) {
        blocked = true;
        break;
      }
    }
    if (!blocked) return y;
  }
  return null;
}

/**
 * Tile the tunnel above and below a wall gap with rock segments. Segments
 * split each band evenly (≈ segmentHalfH each) and never enter the gap.
 * Called at spawn time — allocation is fine there.
 */
export function wallSegments(
  gapCenter: number,
  gapHalf: number,
  segmentHalfH: number,
): { centerY: number; halfH: number }[] {
  'worklet';
  const wall = config.world.wallThickness;
  const segments: { centerY: number; halfH: number }[] = [];
  const bands = [
    { y1: wall, y2: gapCenter - gapHalf },
    { y1: gapCenter + gapHalf, y2: 1 - wall },
  ];
  for (let b = 0; b < bands.length; b++) {
    const height = bands[b].y2 - bands[b].y1;
    if (height <= 1e-6) continue;
    const count = Math.max(1, Math.ceil(height / (2 * segmentHalfH)));
    const halfH = height / (2 * count);
    for (let i = 0; i < count; i++) {
      segments.push({
        centerY: bands[b].y1 + (2 * i + 1) * halfH,
        halfH,
      });
    }
  }
  return segments;
}
```

- [ ] **Step 4: Run tests, verify all pass** — `npx vitest run` → 17 + 10 new = 27 pass.

- [ ] **Step 5: Commit**

```bash
git add src/engine/spawning.ts src/engine/__tests__/spawning.test.ts
git commit -m "feat: pure geometry for walls, drift-safe pinch pairs"
```

---

### Task 3: Drifting rocks in the loop

**Files:**
- Modify: `src/engine/useGameLoop.ts`

**Interfaces:**
- Consumes: `config.behaviors.drift`, `zoneIndexAt`, new RockSlot fields.
- Produces: rocks whose `centerY` bobs per physics step; the solver reserves drift envelopes.

- [ ] **Step 1: Drift decision + envelope in `spawnRock`**

After the halfW/halfH computation, decide drift:

```ts
    // Zone unlock: some rocks bob vertically. The solver reserves the FULL
    // travel envelope so the guaranteed corridor is never invaded mid-bob.
    const drift = config.behaviors.drift;
    const drifts =
      zoneIndexAt(scroll) >= drift.unlockZone && Math.random() < drift.chance;
    const driftAmp = drifts
      ? drift.ampMin + Math.random() * (drift.ampMax - drift.ampMin)
      : 0;
```

The occupied-collection loop over rocks changes to use envelopes:

```ts
      occupied.push({
        x1: r.worldX.value - r.halfW.value,
        x2: r.worldX.value + r.halfW.value,
        y1: r.baseCenterY.value - r.halfH.value - r.driftAmp.value,
        y2: r.baseCenterY.value + r.halfH.value + r.driftAmp.value,
      });
```

The `placeRock` call passes the envelope half-height: `halfH + driftAmp` instead of `halfH`. Slot init gains:

```ts
        r.baseCenterY.value = y;
        r.driftAmp.value = driftAmp;
        r.driftFreq.value = drifts
          ? (2 * Math.PI) /
            (drift.periodMin + Math.random() * (drift.periodMax - drift.periodMin))
          : 0;
        r.driftPhase.value = drifts ? Math.random() * Math.PI * 2 : 0;
```

- [ ] **Step 2: Per-step bob in the rocks collision loop**

At the top of the per-rock body (right after the `if (rock.active.value === 0) continue;`):

```ts
        if (rock.driftAmp.value > 0) {
          rock.centerY.value =
            rock.baseCenterY.value +
            rock.driftAmp.value *
              Math.sin(rock.driftFreq.value * now + rock.driftPhase.value);
        }
```

(Collision, graze band, and the renderer all read the live `centerY` — no other changes.)

- [ ] **Step 3: Verify and commit**

Run: `npx tsc --noEmit` clean; `npx vitest run` 27 pass.

```bash
git add src/engine/useGameLoop.ts
git commit -m "feat: drifting rocks with envelope-reserved fairness"
```

---

### Task 4: Rock walls

**Files:**
- Modify: `src/engine/useGameLoop.ts`

**Interfaces:**
- Consumes: `placeWallGap`, `wallSegments`, `config.behaviors.rockWall`, drift-envelope occupied collection.
- Produces: `spawnWall(scroll)` worklet; the rock schedule branches to it in zone ≥ 2.

- [ ] **Step 1: Add `spawnWall` after `spawnRock`**

```ts
  const spawnWall = (scroll: number) => {
    'worklet';
    const wallCfg = config.behaviors.rockWall;
    const halfW = wallCfg.segmentHalfW;
    const centreX = scroll + aspectRatio + halfW;

    // Pinches own their stretch of tunnel — same exclusion as single rocks.
    const margin = config.pinch.rockFreeMargin;
    for (let i = 0; i < pinches.length; i++) {
      const p = pinches[i];
      if (p.active.value === 0) continue;
      const px1 = p.worldX.value - margin;
      const px2 = p.worldX.value + p.length.value + margin;
      if (centreX + halfW > px1 && centreX - halfW < px2) return;
    }

    // Blockers near the wall's span (drift envelopes included).
    const occupied: OccupiedRect[] = [];
    for (let i = 0; i < rocks.length; i++) {
      const r = rocks[i];
      if (r.active.value === 0) continue;
      occupied.push({
        x1: r.worldX.value - r.halfW.value,
        x2: r.worldX.value + r.halfW.value,
        y1: r.baseCenterY.value - r.halfH.value - r.driftAmp.value,
        y2: r.baseCenterY.value + r.halfH.value + r.driftAmp.value,
      });
    }

    const gapHalf =
      (rampAt(scroll, config.difficulty.clearance) * wallCfg.gapScale) / 2;
    const gapCenter = placeWallGap(
      centreX - halfW,
      centreX + halfW,
      gapHalf,
      occupied,
      Math.random,
    );
    if (gapCenter === null) return; // never seal the tunnel — skip instead

    const segments = wallSegments(gapCenter, gapHalf, wallCfg.segmentHalfH);

    // All-or-nothing: a wall with holes reads as a bug, not a mercy.
    let free = 0;
    for (let i = 0; i < rocks.length; i++) {
      if (rocks[i].active.value === 0) free++;
    }
    if (free < segments.length) return;

    let s = 0;
    for (let i = 0; i < rocks.length && s < segments.length; i++) {
      const r = rocks[i];
      if (r.active.value !== 0) continue;
      const seg = segments[s++];
      r.worldX.value = centreX;
      r.centerY.value = seg.centerY;
      r.baseCenterY.value = seg.centerY;
      r.halfW.value = halfW;
      r.halfH.value = seg.halfH;
      r.driftAmp.value = 0;
      r.driftFreq.value = 0;
      r.driftPhase.value = 0;
      r.cleared.value = 0;
      r.armed.value = 0;
      r.seed.value = Math.random(); // cosmetic: shape variant
      r.active.value = 1;
    }
  };
```

- [ ] **Step 2: Branch the rock schedule**

The rock-spawn block in the frame callback becomes:

```ts
      if (now >= nextRockAt.value) {
        const interval = rampAt(scroll, config.difficulty.rockInterval);
        nextRockAt.value =
          now +
          interval *
            (1 + (Math.random() * 2 - 1) * config.obstacles.spawnIntervalJitter);
        const wallCfg = config.behaviors.rockWall;
        if (
          zoneIndexAt(scroll) >= wallCfg.unlockZone &&
          Math.random() < wallCfg.chance
        ) {
          spawnWall(scroll);
          // A wall is a set piece — give the player a beat after it.
          nextRockAt.value = now + interval * wallCfg.postWallBreather;
        } else {
          spawnRock(scroll);
        }
      }
```

- [ ] **Step 3: Verify and commit**

Run: `npx tsc --noEmit` clean; `npx vitest run` 27 pass.

```bash
git add src/engine/useGameLoop.ts
git commit -m "feat: rock walls with a single guaranteed gate"
```

---

### Task 5: Double S-curve pinches

**Files:**
- Modify: `src/engine/useGameLoop.ts`

**Interfaces:**
- Consumes: `doublePinchCentres`, `spursFor`, `config.behaviors.doublePinch`.
- Produces: `spawnPinch` spawns an offset pair in zone ≥ 3.

- [ ] **Step 1: Extract `activatePinch` and branch `spawnPinch`**

Replace the current `spawnPinch` with:

```ts
  const activatePinch = (
    worldX: number,
    spurs: { topLen: number; botLen: number },
  ) => {
    'worklet';
    for (let i = 0; i < pinches.length; i++) {
      const p = pinches[i];
      if (p.active.value === 0) {
        p.worldX.value = worldX;
        p.length.value = config.pinch.lengthShu;
        p.topLen.value = spurs.topLen;
        p.botLen.value = spurs.botLen;
        p.cleared.value = 0;
        p.armedTop.value = 0;
        p.armedBottom.value = 0;
        p.active.value = 1;
        return;
      }
    }
  };

  const spawnPinch = (scroll: number) => {
    'worklet';
    const dp = config.behaviors.doublePinch;
    const enterX = scroll + aspectRatio;
    if (zoneIndexAt(scroll) >= dp.unlockZone && Math.random() < dp.chance) {
      // An S-curve: two spans, corridors offset to opposite sides. The
      // stretch between them sits inside both rock-free margins.
      const c = doublePinchCentres(scroll, Math.random);
      activatePinch(enterX, spursFor(c.first, c.gap));
      activatePinch(
        enterX + config.pinch.lengthShu + dp.gapBetween,
        spursFor(c.second, c.gap),
      );
    } else {
      activatePinch(enterX, pinchSpurs(scroll, Math.random));
    }
  };
```

Imports from `./spawning` gain `doublePinchCentres, placeWallGap, spursFor, wallSegments, zoneIndexAt` as needed across Tasks 3–5.

- [ ] **Step 2: Verify and commit**

Run: `npx tsc --noEmit` clean; `npx vitest run` 27 pass.

```bash
git add src/engine/useGameLoop.ts
git commit -m "feat: offset pinch pairs form S-curves in the deep"
```

---

## Verification (end of Phase C)

Headless: `npx tsc --noEmit` clean; `npx vitest run` 27 pass (10 new).

On device (user, Expo Go):
- Past 1500 m: some rocks bob up and down slowly; corridors always stay flyable around them; grazing a bobbing rock banks normally.
- Past 4000 m: occasional full-height rock walls with one gap appear (~1 in 6 rock spawns); threading the gap close to an edge banks grazes; walls never spawn inside pinch stretches.
- Past 7000 m: most pinches arrive as pairs with offset corridors (S-curves); the stretch between spans is rock-free; both spurs graze independently (up to 4 tier steps per S).
- Retry mid-zone: behaviors reset with the zone (a fresh run has plain rocks only).
- No frame hitches when a wall bursts 8–10 rocks at once.
