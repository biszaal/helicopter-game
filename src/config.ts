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
    /** How fast the cave scrolls past (shu/s). */
    baseScrollSpeed: 0.55,
    /** Width of one background stripe (shu) — proves scroll speed visually. */
    backgroundTileRatio: 0.22,
    /** Thickness of the top/bottom cave walls (shu). Collidable — walls kill. */
    wallThickness: 0.045,
  },

  obstacles: {
    // Free-floating rocks at random heights and sizes — never paired columns.
    /** Mean seconds between rock spawns. */
    spawnIntervalBase: 0.9,
    /** Random ± fraction applied to each spawn interval (clusters happen). */
    spawnIntervalJitter: 0.35,
    /** Rock size at run start (shu), before growth and per-rock jitter. */
    baseWidth: 0.07,
    baseHeight: 0.055,
    /** Per-rock random ± fraction on each dimension (shape variety). */
    sizeJitter: 0.4,
    /** Pooled rock slots — reused, never allocated during play. */
    poolSize: 14,
    /** A flyable corridor at least this tall (shu) is guaranteed through
     * every cluster of rocks/pinch spurs that overlap in x. */
    minVerticalClearance: 0.16,
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
    /** Mean seconds between pinches after the first. */
    intervalSeconds: 14,
    /** Random ± fraction on that interval. */
    intervalJitter: 0.25,
    /** Horizontal length of a pinch section (shu). */
    lengthShu: 0.5,
    /** Corridor height of the very first pinch (shu)... */
    gapStart: 0.4,
    /** ...shrinking by this much per second of run time... */
    gapShrinkPerSecond: 0.0022,
    /** ...but never below this (shu). */
    gapMin: 0.18,
    /** Random ± offset of the corridor centre from mid-tunnel (shu). */
    centerJitter: 0.15,
    /** Pooled pinch slots. */
    poolSize: 3,
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

  difficulty: {
    // "Obstacles get bigger over time": rock dimensions scale with run time.
    /** Rock size growth per second of run time (fraction of base size). */
    sizeGrowthPerSecond: 0.012,
    /** Growth cap — rocks never exceed base × this. */
    sizeScaleMax: 2.2,
  },
} as const;

export type GameConfig = typeof config;
