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
    /** Constant downward acceleration (shu/s²). Always applies. */
    gravity: 2.6,
    /** Upward acceleration while touching (shu/s²). Fights gravity, so the
     * net climb rate is thrustAccel − gravity. Must exceed gravity. */
    thrustAccel: 5.6,
    /** Terminal fall velocity (shu/s, positive = down). */
    maxFallSpeed: 1.05,
    /** Max climb velocity (shu/s). */
    maxRiseSpeed: 0.85,
  },

  helicopter: {
    /** Visual rectangle size (shu — both measured against screen height). */
    spriteSize: { width: 0.09, height: 0.05 },
    /** Horizontal anchor of the helicopter centre, as a fraction of screen width. */
    fixedXRatio: 0.3,
    /** Spawn height of the helicopter centre (shu from the top). */
    startYRatio: 0.45,
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

  scoring: {
    /** Distance display only: how many "metres" one shu of scroll is worth. */
    metersPerShu: 100,
  },

  ui: {
    /** Seconds after death before a tap is accepted as retry (anti-mash). */
    retryLockoutSeconds: 0.35,
  },

  // ---- Placeholders below: seeded now, wired up in Phases 3-5 ----

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

  obstacles: {
    /** Seconds between obstacle spawns at difficulty zero. */
    spawnIntervalBase: 1.6,
    /** Vertical flying gap left between stalactite and stalagmite (shu). */
    gapSizeBase: 0.34,
    /** Max random vertical offset of the gap centre (shu, ±). */
    gapPositionJitter: 0.18,
    /** Horizontal width of a rock column (shu). */
    width: 0.09,
    /** Shortest a stalactite/stalagmite may be, beyond the wall (shu) —
     * keeps every obstacle visibly asymmetric instead of vanishing. */
    minRockLength: 0.06,
    /** Pooled obstacle slots — reused, never allocated during play. */
    poolSize: 10,
    /** Grace period before the first obstacle of a run appears (s). */
    firstSpawnDelaySeconds: 1.2,
  },

  difficulty: {
    /** Length of one difficulty zone (seconds). */
    zoneLengthSeconds: 20,
    /** Exactly ONE dial advances per zone, cycling through this list. */
    perZoneDeltas: [
      { dial: 'obstacleFrequency', delta: -0.15 },
      { dial: 'gapSize', delta: -0.03 },
      { dial: 'scrollSpeed', delta: 0.06 },
      { dial: 'wallNarrowing', delta: 0.03 },
    ],
  },
} as const;

export type GameConfig = typeof config;
