/**
 * ALL game tuning lives in this one object. Physics, hitboxes, scoring and
 * difficulty numbers must never be inlined anywhere else in the codebase.
 *
 * Units — "shu" = screen-height units. 1.0 shu = the full playfield height,
 * so tuned values feel identical on any phone:
 *   - positions/distances: shu
 *   - velocities:          shu per second
 *   - accelerations:       shu per second²
 *   - times:               seconds
 */
export const config = {
  engine: {
    /** Fixed physics tick rate. Motion must be identical at any render Hz. */
    physicsHz: 120,
    /** Max real delta (s) fed to the accumulator — guards against huge
     * catch-up bursts after the app stalls or resumes. */
    maxFrameDelta: 0.25,
  },

  physics: {
    // No gravity: the helicopter flies dead straight until steered, then
    // spring-chases the drag target so steering has momentum + overshoot.
    /** Finger travel → target travel. 1 = the target mirrors the finger
     * exactly (in screen-height fractions); >1 twitchier, <1 more damped. */
    steerSensitivity: 1.0,
    /** Spring pull toward the target (1/s²). Higher = snappier chase. */
    springStiffness: 90,
    /** Velocity damping (1/s). Critical damping is 2·√stiffness (≈19 here);
     * below that the helicopter overshoots slightly — the floaty feel. */
    springDamping: 14,
    /** Hard cap on vertical speed (shu/s). */
    maxSpeed: 1.3,
  },

  helicopter: {
    /** Visual rectangle size (shu — both measured against screen height). */
    spriteSize: { width: 0.09, height: 0.05 },
    /** Horizontal anchor of the helicopter centre, as a fraction of screen width. */
    fixedXRatio: 0.3,
    /** Spawn height of the helicopter centre (shu from the top). */
    startYRatio: 0.5,
    /** Collision box as a fraction of the sprite — STRICTLY < 1 so deaths
     * feel fair and grazes feel earned. The most-tuned number in the game. */
    hitboxScale: 0.7,
  },

  world: {
    // Scroll speed lives in difficulty.scrollSpeed — it ramps with distance.
    /** Width of one background stripe (shu) — proves scroll speed visually. */
    backgroundTileRatio: 0.22,
    /** Thickness of the top/bottom cave walls (shu). Collidable — walls kill. */
    wallThickness: 0.045,
  },

  obstacles: {
    // Free-floating rocks at random heights and sizes — never paired columns.
    // The mean spawn interval lives in difficulty.rockInterval (it ramps).
    /** Random ± fraction applied to each spawn interval (clusters happen). */
    spawnIntervalJitter: 0.35,
    /** Rock size at run start (shu), before growth and per-rock jitter. */
    baseWidth: 0.07,
    baseHeight: 0.055,
    /** Per-rock random ± fraction on each dimension (shape variety). */
    sizeJitter: 0.4,
    /** Pooled rock slots — reused, never allocated during play. Sized for a
     * rock wall bursting ~10 segments at once plus loose rocks in flight. */
    poolSize: 24,
    // The guaranteed-corridor height lives in difficulty.clearance (it ramps).
    /** Rocks within this x distance (shu) count as the same "wall" for the
     * corridor guarantee. */
    xClearWindow: 0.14,
    /** Random y attempts before a spawn is skipped as unplaceable. */
    placementTries: 6,
    /** Grace period before the first rock of a run appears (s). */
    firstSpawnDelaySeconds: 1.2,
  },

  pinch: {
    // "Once in a while the space gets narrower": a stretch of tunnel where
    // both walls bulge inward, leaving a corridor that shrinks the further
    // the run goes.
    /** When the first pinch of a run starts spawning (s). */
    firstAtSeconds: 12,
    // Mean interval and corridor height live in difficulty.pinchInterval and
    // difficulty.pinchGap — both ramp with distance.
    /** Random ± fraction on the spawn interval. */
    intervalJitter: 0.25,
    /** Horizontal length of a pinch section (shu). */
    lengthShu: 0.5,
    /** Random ± offset of the corridor centre from mid-tunnel (shu). */
    centerJitter: 0.15,
    /** Pooled pinch slots — an S-curve pair holds two at once. */
    poolSize: 4,
    /** No rocks spawn within a pinch span ± this margin (shu). */
    rockFreeMargin: 0.18,
  },

  scoring: {
    /** Distance display only: how many "metres" one shu of scroll is worth. */
    metersPerShu: 100,
    /** Base banking rate: points per shu of scroll, before the multiplier.
     * Points bank instantly and the total can never go down. */
    basePointsPerShu: 120,
  },

  coins: {
    /** End-of-run reward: one coin per this many points banked (there are
     * no in-world pickups — the score IS the coin income). */
    pointsPerCoin: 1000,
  },

  shop: {
    // Skin ids must exist in theme.heliSkins (guarded by a test). Prices
    // are tuned against the earn rate above: a decent run pays ~5-10
    // coins, a deep one ~20-30 — first skin in a handful of runs, GOLD
    // aspirational.
    skins: [
      { id: 'classic', name: 'CLASSIC', price: 0 },
      { id: 'midnight', name: 'MIDNIGHT', price: 40 },
      { id: 'ember', name: 'EMBER', price: 80 },
      { id: 'jungle', name: 'JUNGLE', price: 150 },
      { id: 'arctic', name: 'ARCTIC', price: 250 },
      { id: 'gold', name: 'GOLD', price: 500 },
    ],
  },

  ui: {
    /** Seconds after death before a tap is accepted as retry (anti-mash). */
    retryLockoutSeconds: 0.35,
  },

  graze: {
    /** How close (shu) the hitbox must pass a rock to register a graze. */
    grazeDistance: 0.035,
    /** Multiplier ladder — each graze steps up one tier. */
    multiplierTiers: [1, 2, 3, 4, 5, 6, 8, 10],
    /** Wall-clock seconds without a graze before the first decay step. */
    decaySeconds: 2.25,
    /** Seconds per further one-tier step down (never a hard reset). */
    decayStepSeconds: 1.0,
  },

  events: {
    // Windows (s) after which the engine zeroes an effect timestamp so the
    // render layer's derived values idle on their cheap early-return paths
    // instead of interpolating forever. Cosmetic durations in theme.ts must
    // fit inside these windows.
    /** Zone palette crossfade + announcement window. */
    zoneTransitionSeconds: 2.5,
    /** Graze sparks + edge pulse window. */
    grazeEffectSeconds: 0.6,
  },

  zones: [
    // Named stretches of cave, by distance. The cave runs 55–95 m/s
    // (metersPerShu = 100), so boundaries are set by wall-clock feel:
    // ~25 s / ~57 s / ~89 s into a run at ramp pace.
    { atMeters: 0, name: 'SHALLOWS' },
    { atMeters: 1500, name: 'THE DRIFT' },
    { atMeters: 4000, name: 'THE WALLS' },
    { atMeters: 7000, name: 'THE DEEP' },
  ],

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
} as const;

export type GameConfig = typeof config;
