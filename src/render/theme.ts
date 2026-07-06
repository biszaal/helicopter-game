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
  /** Zone announcement overlay: fade in / hold / fade out (s). */
  zoneAnnounce: { fadeInSeconds: 0.35, holdSeconds: 1.6, fadeOutSeconds: 0.55 },

  background: {
    /** Parallax layers: scroll factor relative to the world, silhouette
     * height and tile width (all heights in shu, i.e. × screenHeight px).
     * Ridge colors come from the zone palette (layer 0 far, layer 1 near). */
    layers: [
      { speed: 0.3, maxHeight: 0.24, tileWidth: 1.1 },
      { speed: 0.6, maxHeight: 0.15, tileWidth: 0.8 },
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

  /** Coins: gold body, warmer + bigger for risk coins, collect pop. */
  coins: {
    gold: '#ffd34d',
    highlight: '#fff3c4',
    /** Risk (value > 1) coins draw this much bigger. */
    riskSizeScale: 1.3,
    /** Pop: body scales to this and fades over the events window. */
    popScale: 1.8,
  },

  /** Graze feedback: spark burst streaking back off the helicopter. */
  sparks: {
    count: 7,
    /** Burst fade-out time (s). */
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
