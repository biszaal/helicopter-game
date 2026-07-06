# Coins — Design (Roadmap Phase 6)

Approved in chat 2026-07-06. Earning only: spawn → collect → count → persist.
Spending (magnet, upgrades, doublers) is phase 7/8 material and deliberately
absent here.

## Placement philosophy (user decision)

**Mix: trails + risk clusters.** Most coins arrive as gentle arcs in flyable
space — collection pleasure and a soft "safe path" hint. Occasionally a
high-value cluster hugs an obstacle's graze band, aligned with the design
pillar: danger pays.

## Spawn sources

**Trails** (worth 1 each):

- Scheduled like rocks: `nextTrailAt` in run-seconds, mean
  `config.coins.trail.intervalSeconds = 4.5` ± `intervalJitter = 0.3`
  (fraction), first at `firstTrailDelaySeconds = 3`.
- A trail is 5–8 coins along a seeded template — `line`, `sine`, or `arc`
  (template geometry = pure functions in `spawning.ts`, unit-tested):
  spacing `0.09` shu in x, vertical amplitude `0.06–0.12` shu, centre placed
  at a random flyable y, every point clamped to
  `[wallThickness + r, 1 − wallThickness − r]`.
- **Fairness/consistency rule:** each coin's pickup circle (bounding box ×
  `pickupScale`, + `0.01` shu margin) is checked against the same occupied
  rectangles the rock solver uses — rocks at their FULL drift envelope,
  pinch spurs, wall bands. Overlapping coins are dropped individually (a
  trail with a bite taken out is fine; a coin inside a rock is not).

**Risk clusters** (worth 5 each):

- On each rock / rock-wall / pinch spawn, with `riskCluster.chance = 0.2`:
  3 coins placed in the danger's payoff zone —
  - rock: stacked along the rock's right half, centred `grazeDistance / 2`
    outside the kill rect (inside the graze band);
  - wall: in the gate gap, centred on the gap;
  - pinch: down the corridor centre at mid-span.
- Drawn ~1.3× larger with the warmer risk color so value reads at speed.

## Collection

- Pickup box = coin bounding box × `pickupScale = 1.6` (generous — the
  inverse of the kill-hitbox rule; a miss that looked like a hit is the
  frustration to avoid). Overlap test reuses `rectsOverlap` against the
  helicopter hitbox, every physics step — active coins with
  `collectedAtMs === 0` only (a coin mid-pop is not collectable twice).
- On collect (engine, zero allocation): `slot.collectedAtMs = timestamp`,
  `slot.active` stays 1 during the pop window, `runCoins += slot.value`.
  The engine deactivates the slot once
  `config.events.coinPopSeconds = 0.4` has passed (same event-window
  pattern as zone/graze effects — render deriveds idle afterwards).
- Off-screen uncollected coins release their slot as rocks do.
- `resetRun`: all slots inactive, `runCoins = 0`.

## Feel

- **Pop:** collected coin scales up ~1.8× and fades (with its glint
  highlight), pure function of `wallClockMs − collectedAtMs` (CrashEffect
  pattern). No per-coin sparkle flecks — 40 slots × extra nodes is exactly
  the per-instance multiplication the perf rules forbid.
- **Ding:** short synthesized blip (~90 ms, E6 sine + soft 2nd harmonic,
  generator committed as `scripts/make-coin-ding.js`). Consecutive collects
  within 1 s raise playback rate `1.0 → 1.6` in `+0.06` steps — a trail
  reads as an arpeggio. Rate on a ONE-SHOT player is safe (the looper
  lesson applies to loops only); streak state lives JS-side in `sounds.ts`
  using `Date.now()`. Fired from a `useAnimatedReaction` on `coinCount`
  (one ding per reaction even if two coins land the same frame). No haptic.
- **HUD:** gold `● N` under the distance readout. Game-over panel adds
  `+N COINS`. Menu shows the wallet under BEST.

## Engineering shape

- `useCoinPool` — `config.coins.poolSize = 40` slots:
  `active, worldX, centerY, value, collectedAtMs, seed` (all shared values).
- Gameplay tunables in `config.coins` + `config.events.coinPopSeconds`;
  cosmetics (colors, sprite radius `0.016` shu, pop timing, sparkle count)
  in `theme.coins`. Gold `#ffd34d`; risk coins use `theme.colors.amber`.
- Trail/cluster geometry = pure functions in `spawning.ts` (vitest, same
  style as wall/S-pinch tests).
- **Perf rules baked in from day one:** one shared gold color (no per-coin
  derivation), inactive coins park off-screen, pop sparkle deriveds
  early-return once the engine zeroes the window, no allocation in the loop.
- Persistence: `settings.tsx` gains `totalCoins` (AsyncStorage);
  `recordRun(score, distance, coins)` adds the run's coins. The settings
  RESET button clears the wallet along with best score/distance.

## Out of scope (phase 7/8)

Magnet, coin value × graze multiplier, zone-scaled density, shop/spending,
coin doubler IAP.

## Verification

Headless: `npx tsc --noEmit`; vitest for template geometry (points in
bounds, spacing, clamping), cluster placement (inside graze band, outside
kill rect), and overlap-rejection. On device: trails collectable on sight,
risk trio at a rock reads as "graze me", arpeggio audible, `+N COINS` on
death, wallet grows across runs, RESET clears it, no hitches.
