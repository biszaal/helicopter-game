/**
 * ALL cosmetic tuning lives here: colors, parallax speeds, tilt angles,
 * particle counts. Nothing in this file may influence gameplay — physics,
 * hitboxes and difficulty stay in config.ts.
 */
export const theme = {
  colors: {
    /** Vertical background gradient, top → bottom. */
    backgroundTop: '#07090d',
    backgroundBottom: '#131a24',
    /** Parallax ridge silhouettes, far → near. */
    ridgeFar: '#0e131b',
    ridgeNear: '#161d28',
    /** Cave wall / pinch body gradient (screen edge → play edge). */
    wallOuter: '#1c222c',
    wallInner: '#2e3743',
    /** Rock shading gradient (lit top-left → shadowed bottom-right). */
    rockLit: '#39434f',
    rockDark: '#1e242e',
    /** Helicopter body gradient + details. */
    heliBodyTop: '#a6b0bd',
    heliBodyBottom: '#525b68',
    heliRotor: '#c7cdd6',
    canopyGlow: '#ffd484',
    searchlight: 'rgba(255, 221, 150, 0.16)',
    navLight: '#ffb648',
    /** Crash effect. */
    flash: '#ffe9c4',
    smoke: '#5a6472',
    debrisAmber: '#ffb648',
    debrisMetal: '#8b95a2',
    /** Dust motes drifting through the cave. */
    dust: 'rgba(190, 205, 225, 0.28)',
    hud: '#dce3ec',
    amber: '#ffb648',
  },

  background: {
    /** Parallax layers: scroll factor relative to the world, silhouette
     * height and tile width (all heights in shu, i.e. × screenHeight px). */
    layers: [
      { speed: 0.3, maxHeight: 0.24, tileWidth: 1.1, color: '#0e131b' },
      { speed: 0.6, maxHeight: 0.15, tileWidth: 0.8, color: '#161d28' },
    ],
    dustCount: 12,
    /** Motes drift slightly slower than the world — reads as depth. */
    dustScrollFactor: 0.85,
  },

  walls: {
    /** How far the cosmetic teeth protrude past the collision line, into
     * the playfield (shu). Teeth are SAFE — the visual is always at least
     * as large as what kills, never smaller. */
    toothDepth: 0.022,
    /** Width of one repeating tooth tile (shu). */
    tileWidth: 0.5,
  },

  helicopter: {
    /** Radians of pitch per shu/s of vertical speed (nose dips diving). */
    tiltPerVelocity: 0.24,
    /** Pitch clamp (rad ≈ 18°). */
    tiltMax: 0.32,
    /** Constant forward lean while flying (rad). */
    forwardLean: 0.05,
    /** Main rotor sweep frequency (rad of blade phase per ms). */
    rotorSpeed: 0.045,
    tailRotorSpeed: 0.03,
    /** Nav light blink period (ms) and on-fraction. */
    blinkPeriodMs: 900,
    blinkOnFraction: 0.18,
  },

  crash: {
    shardCount: 16,
    /** Shard fade-out time (s) — the whole effect is over by then. */
    shardLifetime: 1.2,
    /** Downward pull on shards (shu/s²) — cosmetic only. */
    shardGravity: 1.6,
    flashDuration: 0.22,
    /** Flash radius growth (shu/s). */
    flashGrowth: 1.2,
    smokeCount: 3,
    shakeDuration: 0.45,
    /** Initial shake amplitude (px) and angular frequencies (rad/s). */
    shakeAmplitude: 14,
    shakeFreqX: 95,
    shakeFreqY: 83,
    shakeDecay: 9,
    /** Game-over overlay entrance (ms). */
    overlayDelayMs: 600,
    overlayFadeMs: 450,
  },
} as const;
