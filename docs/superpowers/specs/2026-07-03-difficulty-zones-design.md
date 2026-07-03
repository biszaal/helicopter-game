# Difficulty Progression & Fun Upgrades — Design

**Date:** 2026-07-03
**Status:** Approved direction (hybrid ramp + zones; all fun ingredients), pending spec review.

## Problem

A run feels identical at second 5 and second 300. Scroll speed, spawn density, corridor
clearance, and player handling never change; the only escalation is rock growth and pinch
shrink, both slow and invisible. There are no milestones — nothing to chase, no "I reached
the red zone" moment — and obstacle variety is fixed from the first rock to the last.

## Goal

Every run should escalate until it kills you, and the escalation should be *felt*:
faster, denser, tighter under a continuous ramp, punctuated by named zones that announce
themselves, change the cave's mood, and unlock a new obstacle behavior. Double down on the
core pillar — reward flying close to danger — with better graze feedback.

## Design decision: difficulty is driven by DISTANCE, not time

Today `sizeScaleAt`/`pinchGapAt` take elapsed seconds. Once scroll speed ramps, time and
distance diverge, and zones are defined in meters ("400 m"), so **all difficulty math moves
to distance** (`scrollX` in shu; meters = `scrollX × metersPerShu`). Difficulty at 600 m is
then deterministic for every run. Migration is a re-parameterization: old per-second rates
÷ 0.55 shu/s ≈ per-shu rates (e.g. size growth 0.012/s → 0.022/shu).

## The dials and what each makes the player feel

All ramps are linear-with-cap, one shared helper (`rampAt(d, ramp)`), same shape as the
existing `sizeScaleAt` pattern. Numbers below are starting points for the feel-tuning
gate, not commitments.

**Pace calibration:** the cave moves at 55–95 m/s (`metersPerShu` = 100), so meters pile
up fast. All distances below were chosen by wall-clock feel and converted: the ramps cap
around 5000 m ≈ 68 s into a run.

| Dial | Start → Cap | Cap reached | Feel |
| --- | --- | --- | --- |
| Scroll speed | 0.55 → 0.95 shu/s | ~5000 m (~68 s) | Less reaction time per obstacle; the core adrenaline dial |
| Rock spawn interval (mean) | 0.9 s → 0.5 s | ~5000 m | Rocks arrive ~1.8× as often, each passing ~1.7× faster |
| Min vertical clearance | 0.16 → 0.13 shu | ~4300 m | Guaranteed corridor gets snug (heli hitbox 0.035 + graze bands = 0.105, so 0.13 stays fair) |
| Rock size scale | 1.0 → 2.2× (existing pace) | ~5500 m (~72 s, ≈ old 100 s ramp) | Same rocks eat more of the corridor |
| Pinch gap | 0.40 → 0.18 (existing pace) | ~5500 m | Pinches go from mild to squeeze |
| Pinch interval (mean) | 14 s → 10 s | ~5000 m | Pinches stop being rare events |

**Compounding note:** spawn spacing in world-x = speed × interval. Early: 0.55 × 0.9 ≈ 0.50 shu
between rocks; late: 0.95 × 0.5 ≈ 0.48 shu — spatial density rises only slightly while
everything arrives ~1.7× faster and rocks are 2.2× bigger. Speed is the star; density and
size support it. Player handling (spring, maxSpeed) never changes — the game gets harder,
the helicopter stays trustworthy.

## Zones

Zone table in `config.zones` (gameplay data), palettes in `theme.zones` (cosmetic).
Zone index = last entry whose `atMeters ≤ distance`; past the last zone the game stays
there forever — by Zone 4 every ramp has capped, so THE DEEP is the plateau where only
skill runs out. Boundaries in wall-clock terms (at ramp pace): ~25 s / ~57 s / ~89 s.

| Zone | At | Name (placeholder) | Unlocks |
| --- | --- | --- | --- |
| 1 | 0 m | SHALLOWS | Baseline game |
| 2 | 1500 m | THE DRIFT | Drifting rocks (`driftChance ≈ 0.35`) |
| 3 | 4000 m | THE WALLS | Rock-wall formations (`wallChance ≈ 0.2` of spawns, cooldown ≥ 2.5 s) |
| 4 | 7000 m | THE DEEP | Double (S-curve) pinches (`doublePinchChance ≈ 0.5`) |

Each zone entry: `{ atMeters, name, driftChance, wallChance, doublePinchChance }` — explicit
per-zone numbers so tuning is a table edit, not code. Unlocked behaviors persist into later
zones (chances can rise per zone).

**Zone transition event flow** (follows the existing death-event pattern):
loop detects index change → writes `zoneIndex` + `zoneChangedAtMs` shared values →
`useAnimatedReaction` in GameScreen → `runOnJS`: zone chime + light haptic. Announcement
overlay and palette crossfade are pure functions of `wallClockMs − zoneChangedAtMs`
(CrashEffect philosophy — no extra loop, no allocation).

## New obstacle behaviors

### Drifting rocks (zone 2+)

- New `RockSlot` fields: `baseCenterY`, `driftAmp` (0 = static), `driftFreq`, `driftPhase`.
- Each physics tick: `centerY = baseCenterY + driftAmp · sin(wallClock·freq + phase)` for
  active drifters (≤ poolSize iterations, zero allocation). Collision and graze use the
  live `centerY` — the existing checks don't change.
- **Fairness (critical):** the corridor solver must see the *envelope*, not the instant
  position. `placeRock` gets `halfH + driftAmp` for the candidate, and drifting rocks enter
  the `occupied[]` list (built in `spawnRock`) as `baseCenterY ± (halfH + driftAmp)`. The
  solver itself is untouched — inputs are inflated. The guaranteed corridor survives every
  drift phase by construction.
- Config: `driftAmplitude ≈ 0.05 shu`, `driftFreqMin/Max ≈ 0.8–1.6 rad/s`.

### Rock walls (zone 3+)

- A wall spawn picks a gap center (same free-gap logic as `placeRock`, honoring existing
  occupied rects), then fills the rest of the tunnel height with 3–5 stacked rocks at one
  `worldX`. Gap ≥ `clearanceAt(d) + 0.03` (walls are absolute, so slightly more forgiving
  than scatter clearance). Wall rocks are normal pool slots — they join `occupied[]`,
  graze/clear/score like any rock. Walls never drift.
- **Pool math:** rock lifetime on screen ≈ 0.7 shu of scroll; late-game spawn spacing
  ≈ 0.48 shu → ~2 scatter rocks nominal, but jitter clusters plus up to 2 walls × 5 rocks
  in flight → **`poolSize` 14 → 24** (trivial memory, generous headroom).

### Double pinch / S-curve (zone 4+)

- With `doublePinchChance`, a pinch spawn places a second segment at
  `worldX + lengthShu + segmentGap (≈ 0.35 shu)` with its corridor center forced to the
  opposite side (`|Δcenter| ∈ [0.15, 0.30] shu`) — an S you must steer through.
- **Fairness bound:** traversing `segmentGap` at capped speed 0.95 shu/s takes ~0.37 s; at
  `maxSpeed` 1.3 shu/s the heli can move ~0.48 shu vertically in that time — Δcenter capped
  at 0.30 leaves ≥ 35 % slack. Formula lives in a config comment; the number is tunable.
- Pinch `poolSize` 3 → 4 (double pinch = 2 slots + safety). `rockFreeMargin` already applies
  per segment, so no rocks inside the S.

## Milestone & escalation juice

- **Zone announcement:** zone name + meters, fade in/hold/out (~2.5 s total), driven by
  `zoneChangedAtMs`. Timing/typography in `theme.zoneAnnounce`.
- **Palette shift:** `theme.zones[i]` = { background gradient, wall, rock, glow colors }.
  On transition, every render component crossfades previous → current palette over
  ~2.5 s via `interpolateColor(progress)` where progress is a pure function of
  `wallClockMs − zoneChangedAtMs`. Needs a `prevZoneIndex` shared value. Mood arc:
  deep blue → teal → amber → red glow.
- **Zone chime:** one new CC0 asset (`assets/sounds/zone.wav`, LICENSES.md entry;
  processed with afconvert — downloaded ffmpeg binaries get SIGKILLed in this sandbox).
- **Rotor intensity:** `setRotorIntensity(t)` in sounds.ts maps ramp progress 0–1 to
  `player.setPlaybackRate(1 + 0.25·t)` (+ slight volume rise). Verified available in
  expo-audio SDK 57 (rate 0.1–2.0, optional iOS pitch correction). Called through a
  `useAnimatedReaction` on a *quantized* speed bucket (0.05 steps) so `runOnJS` fires a
  handful of times per run, not per frame. Verify pitch behavior on a real device at the
  tuning gate.

## Graze feedback upgrades

- **Whoosh on graze bank:** `applyGrazes` already runs when a graze banks; it additionally
  increments a `grazeBankCount` shared value → existing reaction pattern → `runOnJS`
  whoosh (new CC0 asset, `assets/sounds/whoosh.wav`). Sits beside the existing tier-up haptic.
- **Spark burst:** new pooled effect (`useSparkPool`, ~6 burst slots: `x, y, atMs, seed,
  active` — pre-allocated shared arrays, written from the worklet, zero allocation).
  Burst spawns at the helicopter's position when a graze banks; `GrazeSparks.tsx` draws
  ~6 shards per burst as a pure function of `wallClockMs − atMs`, lifetime ~0.4 s.
  Visual constants in `theme.sparks`.
- **High-tier pulse:** when the multiplier steps up at tier ≥ 5, a screen-edge glow stroke
  pulses once (~0.3 s), pure function of `lastTierUpAtMs`. **No time dilation** — it would
  fight the fixed-timestep engine for a marginal payoff.

## Scoring interaction

The banking line switches from constant `baseScrollSpeed` to the current ramped speed:
points **per meter** stay constant, points **per second** rise as the game speeds up —
surviving deep is rewarded, and score stays monotonic (locked rule intact).

## Locked rules honored

One config.ts for all gameplay tunables (ramps live in `config.difficulty`, zone table in
`config.zones`); cosmetics in theme.ts; hitbox untouched; score only banks; one-tier decay
untouched; all obstacles + new sparks pooled, zero allocation in the loop; corridor
guarantee extended (drift envelopes, wall gaps, S-curve bound) — never sealed, never unfair;
visible-obstacle ≥ kill-region rule applies to drifting rocks and walls as-is (same
renderer); portrait unchanged.

## Build phases (each independently playable)

- **A — Ramp core + zone engine:** distance migration, `rampAt`, all six dials, zone
  tracking, plain zone-name text in HUD (proves zones work before juice exists). Scoring
  uses ramped speed. `resetRun` clears zone state.
- **B — Milestone juice:** announcement overlay, palette crossfade, zone chime, rotor
  intensity, zone haptic.
- **C — Obstacle behaviors:** drift (with envelope fairness) → rock walls (+ pool 24) →
  double pinch (+ pool 4). In that order; each lands separately.
- **D — Graze feedback:** whoosh, spark pool + renderer, high-tier pulse.

## Files touched

- `src/config.ts` — ramp keys, zone table, behavior chances, pool sizes.
- `src/engine/spawning.ts` — `rampAt`, distance migration, `zoneIndexAt`, wall placement,
  double-pinch geometry; `src/engine/useGameLoop.ts` — ramp consumption, zone tracking,
  drift tick, wall/double spawns, graze-bank counter, spark writes, scoring line.
- `src/engine/useRockPool.ts` (drift fields, 24), `usePinchPool.ts` (4),
  `useSparkPool.ts` (new).
- `src/render/theme.ts` (zone palettes, announce, sparks, pulse), `GameScreen.tsx`
  (overlay, reactions, new components), `Background/CaveWalls/Rocks/Pinches.tsx`
  (palette interpolation), `GrazeSparks.tsx` (new).
- `src/audio/sounds.ts` (chime, whoosh, `setRotorIntensity`), `assets/sounds/` +
  `LICENSES.md` (2 new CC0 files).

## Verification

- Headless per phase: `npx tsc --noEmit`; solver fairness sanity-check via a scratchpad
  Node script driving `placeRock` with inflated drift envelopes and wall gaps ('worklet'
  directives are inert under Node).
- On device (user runs Expo Go): A — speed visibly higher by ~2000 m, zone label flips at
  1500/4000/7000 m, retry resets everything. B — announcement + palette + chime + rotor pitch
  at each boundary. C — drifters move but a corridor always exists; walls have one clean
  gap; S-pinches are tight but steerable at cap speed. D — sparks/whoosh on graze, pulse at
  tier 5+, no frame hitches (everything pooled).
