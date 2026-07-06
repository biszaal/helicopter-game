import {
  useFrameCallback,
  useSharedValue,
  type SharedValue,
} from 'react-native-reanimated';
import { config } from '../config';
import { stepPhysics } from './physics';
import { rectsOverlap } from './collision';
import { applyGrazes, stepDecay } from './scoring';
import {
  coinFits,
  coinTrailPoints,
  doublePinchCentres,
  gateClusterPoints,
  pinchClusterPoints,
  pinchSpurs,
  placeRock,
  placeWallGap,
  rampAt,
  rockClusterPoints,
  sizeScaleAt,
  spursFor,
  wallSegments,
  zoneIndexAt,
  type CoinPoint,
  type OccupiedRect,
} from './spawning';
import { useCoinPool, type CoinSlot } from './useCoinPool';
import { useRockPool, type RockSlot } from './useRockPool';
import { usePinchPool, type PinchSlot } from './usePinchPool';

/** Fixed physics timestep (s). Physics only ever advances in these increments. */
const FIXED_DT = 1 / config.engine.physicsHz;
export const MS_PER_SECOND = 1000;

export const PHASE_PLAYING = 0;
export const PHASE_DEAD = 1;
/** Frozen mid-run: the loop's PHASE_PLAYING guard skips stepping, the wall
 * clock keeps ticking, and setting the phase back resumes seamlessly. */
export const PHASE_PAUSED = 2;

export interface GameLoop {
  /** Interpolated helicopter centre (shu) — what the renderer should draw. */
  renderY: SharedValue<number>;
  /** Interpolated world scroll distance (shu) for background + obstacles. */
  renderScrollX: SharedValue<number>;
  /** Raw scroll distance (shu) — run distance for the counter/overlay. */
  scrollX: SharedValue<number>;
  /** Simulated helicopter centre (shu) — the steering grab anchor. */
  posY: SharedValue<number>;
  /** Altitude the helicopter spring-chases. Set by the drag gesture. */
  targetY: SharedValue<number>;
  /** Vertical spring velocity (shu/s) — read-only, drives the sprite tilt. */
  velY: SharedValue<number>;
  /** PHASE_PLAYING | PHASE_DEAD. */
  phase: SharedValue<number>;
  /** Banked score. Monotonic within a run — it can never decrease. */
  score: SharedValue<number>;
  /** Index into config.graze.multiplierTiers — the current banking rate. */
  tierIndex: SharedValue<number>;
  /** Seconds since the last graze/decay step (drives the cooling bar). */
  decayTimer: SharedValue<number>;
  /** Seconds the timer must reach before the next one-tier step down. */
  decayThreshold: SharedValue<number>;
  /** Monotonic frame clock (ms) — always ticking, even while dead. */
  wallClockMs: SharedValue<number>;
  /** wallClockMs at the moment of death (retry lockout reference). */
  deathAtMs: SharedValue<number>;
  /** Index into config.zones — advances at each distance milestone. */
  zoneIndex: SharedValue<number>;
  /** wallClockMs at the last zone change (0 until the first crossing). */
  zoneChangedAtMs: SharedValue<number>;
  /** The zone before the current one — palette crossfades read both. */
  prevZoneIndex: SharedValue<number>;
  /** Wall clock (ms) of the last banked graze — 0 until one banks. */
  grazeAtMs: SharedValue<number>;
  /** Helicopter centre y (shu) at that moment — the spark burst origin. */
  grazeY: SharedValue<number>;
  /** 0..1 per-burst seed — cosmetic variety only. */
  grazeSeed: SharedValue<number>;
  /** Pooled world objects, for rendering. */
  rocks: RockSlot[];
  pinches: PinchSlot[];
  coins: CoinSlot[];
  /** This run's collected coin value. Monotonic within a run. */
  runCoins: SharedValue<number>;
  /** Worklet: reset every run-scoped value and start a fresh run. */
  resetRun: () => void;
}

/**
 * The game loop. Runs on the UI thread via useFrameCallback.
 *
 * Fixed-timestep accumulator: real frame time is accumulated, physics steps
 * in FIXED_DT increments, and the leftover fraction interpolates between the
 * last two physics states for rendering. Render framerate never touches the
 * simulation — a 60Hz and a 120Hz device produce identical motion.
 *
 * @param aspectRatio screen width / height — i.e. the playfield width in shu.
 */
export function useGameLoop(aspectRatio: number): GameLoop {
  const posY = useSharedValue<number>(config.helicopter.startYRatio);
  const velY = useSharedValue(0);
  const prevPosY = useSharedValue<number>(config.helicopter.startYRatio);
  const targetY = useSharedValue<number>(config.helicopter.startYRatio);
  const scrollX = useSharedValue(0);
  const prevScrollX = useSharedValue(0);
  const accumulator = useSharedValue(0);
  const renderY = useSharedValue<number>(config.helicopter.startYRatio);
  const renderScrollX = useSharedValue(0);

  const phase = useSharedValue(PHASE_PLAYING);
  const wallClockMs = useSharedValue(0);
  const deathAtMs = useSharedValue(0);

  /** Run time (s) — drives the spawn schedules. */
  const elapsed = useSharedValue(0);
  const nextRockAt = useSharedValue<number>(
    config.obstacles.firstSpawnDelaySeconds,
  );
  const nextPinchAt = useSharedValue<number>(config.pinch.firstAtSeconds);

  const zoneIndex = useSharedValue(0);
  const zoneChangedAtMs = useSharedValue(0);
  const prevZoneIndex = useSharedValue(0);

  /** Last banked graze: wall clock (0 = none), heli y (shu), 0..1 seed. */
  const grazeAtMs = useSharedValue(0);
  const grazeY = useSharedValue(0);
  const grazeSeed = useSharedValue(0);

  const score = useSharedValue(0);
  const tierIndex = useSharedValue(0);
  const decayTimer = useSharedValue(0);
  const decayThreshold = useSharedValue<number>(config.graze.decaySeconds);

  const rocks = useRockPool();
  const pinches = usePinchPool();
  const coins = useCoinPool();

  const nextTrailAt = useSharedValue<number>(
    config.coins.trail.firstDelaySeconds,
  );
  const runCoins = useSharedValue(0);

  /** Everything currently blocking the tunnel — rocks at their FULL drift
   * envelope, pinch spurs. Shared by rock/wall/coin placement. */
  const collectOccupied = (): OccupiedRect[] => {
    'worklet';
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
    for (let i = 0; i < pinches.length; i++) {
      const p = pinches[i];
      if (p.active.value === 0) continue;
      const px1 = p.worldX.value;
      const px2 = p.worldX.value + p.length.value;
      occupied.push({ x1: px1, x2: px2, y1: 0, y2: p.topLen.value });
      occupied.push({ x1: px1, x2: px2, y1: 1 - p.botLen.value, y2: 1 });
    }
    return occupied;
  };

  const claimCoin = (x: number, y: number, value: number) => {
    'worklet';
    for (let i = 0; i < coins.length; i++) {
      const c = coins[i];
      if (c.active.value === 0) {
        c.worldX.value = x;
        c.centerY.value = y;
        c.value.value = value;
        c.collectedAtMs.value = 0;
        c.seed.value = Math.random();
        c.active.value = 1;
        return;
      }
    }
  };

  /** Risk trio: deliberate graze-band placement — no fitness check. */
  const spawnRiskCluster = (pts: CoinPoint[]) => {
    'worklet';
    for (let i = 0; i < pts.length; i++) {
      claimCoin(pts[i].x, pts[i].y, config.coins.riskCluster.value);
    }
  };

  const spawnTrail = (scroll: number) => {
    'worklet';
    const t = config.coins.trail;
    const count =
      t.countMin + Math.floor(Math.random() * (t.countMax - t.countMin + 1));
    const amp = t.ampMin + Math.random() * (t.ampMax - t.ampMin);
    const kind = Math.floor(Math.random() * 3);
    const r = config.coins.radius;
    const minY = config.world.wallThickness + 2 * r;
    const maxY = 1 - config.world.wallThickness - 2 * r;
    const centerY = minY + amp + Math.random() * (maxY - minY - 2 * amp);
    const pts = coinTrailPoints(count, t.spacing, centerY, amp, kind, minY, maxY);
    const startX = scroll + aspectRatio + r;
    const half = r * config.coins.pickupScale + config.coins.placementMargin;
    const occupied = collectOccupied();
    for (let i = 0; i < pts.length; i++) {
      const x = startX + pts[i].x;
      if (coinFits(x, pts[i].y, half, occupied)) {
        claimCoin(x, pts[i].y, t.value);
      }
    }
  };

  /** A late obstacle landing on parked coins deletes them — a coin inside
   * a rock is a lie (fairness rule, spec). */
  const clearCoinsInRect = (
    x1: number,
    x2: number,
    y1: number,
    y2: number,
  ) => {
    'worklet';
    const r = config.coins.radius;
    for (let i = 0; i < coins.length; i++) {
      const c = coins[i];
      if (c.active.value === 0 || c.collectedAtMs.value !== 0) continue;
      if (
        c.worldX.value + r > x1 &&
        c.worldX.value - r < x2 &&
        c.centerY.value + r > y1 &&
        c.centerY.value - r < y2
      ) {
        c.active.value = 0;
      }
    }
  };

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
    let firstSpurs: { topLen: number; botLen: number };
    if (zoneIndexAt(scroll) >= dp.unlockZone && Math.random() < dp.chance) {
      // An S-curve: two spans, corridors offset to opposite sides. The
      // stretch between them sits inside both rock-free margins.
      const c = doublePinchCentres(scroll, Math.random);
      firstSpurs = spursFor(c.first, c.gap);
      activatePinch(enterX, firstSpurs);
      activatePinch(
        enterX + config.pinch.lengthShu + dp.gapBetween,
        spursFor(c.second, c.gap),
      );
    } else {
      firstSpurs = pinchSpurs(scroll, Math.random);
      activatePinch(enterX, firstSpurs);
    }
    if (Math.random() < config.coins.riskCluster.chance) {
      const corridorCenter =
        firstSpurs.topLen + (1 - firstSpurs.topLen - firstSpurs.botLen) / 2;
      spawnRiskCluster(
        pinchClusterPoints(enterX, config.pinch.lengthShu, corridorCenter),
      );
    }
  };

  const spawnRock = (scroll: number) => {
    'worklet';
    const { baseWidth, baseHeight, sizeJitter } = config.obstacles;
    const scale = sizeScaleAt(scroll);
    const halfW =
      (baseWidth / 2) * scale * (1 + (Math.random() * 2 - 1) * sizeJitter);
    const halfH =
      (baseHeight / 2) * scale * (1 + (Math.random() * 2 - 1) * sizeJitter);
    const centreX = scroll + aspectRatio + halfW;

    // Zone unlock: some rocks bob vertically. The solver reserves the FULL
    // travel envelope so the guaranteed corridor is never invaded mid-bob.
    const drift = config.behaviors.drift;
    const drifts =
      zoneIndexAt(scroll) >= drift.unlockZone && Math.random() < drift.chance;
    const driftAmp = drifts
      ? drift.ampMin + Math.random() * (drift.ampMax - drift.ampMin)
      : 0;

    // Pinches own their stretch of tunnel — no rocks inside a span.
    const margin = config.pinch.rockFreeMargin;
    for (let i = 0; i < pinches.length; i++) {
      const p = pinches[i];
      if (p.active.value === 0) continue;
      const px1 = p.worldX.value - margin;
      const px2 = p.worldX.value + p.length.value + margin;
      if (centreX + halfW > px1 && centreX - halfW < px2) return;
    }

    // Everything currently blocking the tunnel, for the corridor guarantee.
    const occupied = collectOccupied();

    const y = placeRock(
      centreX - halfW,
      centreX + halfW,
      halfH + driftAmp, // reserve the whole bob envelope
      occupied,
      Math.random,
      rampAt(scroll, config.difficulty.clearance),
    );
    if (y === null) return; // never seal the tunnel — skip instead

    let placed = false;
    for (let i = 0; i < rocks.length; i++) {
      const r = rocks[i];
      if (r.active.value === 0) {
        r.worldX.value = centreX;
        r.centerY.value = y;
        r.baseCenterY.value = y;
        r.driftAmp.value = driftAmp;
        r.driftFreq.value = drifts
          ? (2 * Math.PI) /
            (drift.periodMin +
              Math.random() * (drift.periodMax - drift.periodMin))
          : 0;
        r.driftPhase.value = drifts ? Math.random() * Math.PI * 2 : 0;
        r.halfW.value = halfW;
        r.halfH.value = halfH;
        r.cleared.value = 0;
        r.armed.value = 0;
        r.seed.value = Math.random(); // cosmetic: shape variant
        r.active.value = 1;
        placed = true;
        break;
      }
    }
    if (!placed) return;

    clearCoinsInRect(
      centreX - halfW,
      centreX + halfW,
      y - halfH - driftAmp,
      y + halfH + driftAmp,
    );
    // Risk trio on static rocks only — a bobbing rock would drift away
    // from coins parked beside its spawn pose.
    if (!drifts && Math.random() < config.coins.riskCluster.chance) {
      spawnRiskCluster(
        rockClusterPoints(
          centreX + halfW,
          y,
          halfH,
          config.graze.grazeDistance / 2,
        ),
      );
    }
  };

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
    const occupied = collectOccupied();

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
      r.driftAmp.value = 0;
      r.driftFreq.value = 0;
      r.driftPhase.value = 0;
      r.halfW.value = halfW;
      r.halfH.value = seg.halfH;
      r.cleared.value = 0;
      r.armed.value = 0;
      r.seed.value = Math.random(); // cosmetic: shape variant
      r.active.value = 1;
    }

    clearCoinsInRect(centreX - halfW, centreX + halfW, 0, 1);
    if (Math.random() < config.coins.riskCluster.chance) {
      spawnRiskCluster(gateClusterPoints(centreX, gapCenter, gapHalf));
    }
  };

  const resetRun = () => {
    'worklet';
    posY.value = config.helicopter.startYRatio;
    velY.value = 0;
    prevPosY.value = config.helicopter.startYRatio;
    targetY.value = config.helicopter.startYRatio;
    scrollX.value = 0;
    prevScrollX.value = 0;
    accumulator.value = 0;
    renderY.value = config.helicopter.startYRatio;
    renderScrollX.value = 0;
    elapsed.value = 0;
    nextRockAt.value = config.obstacles.firstSpawnDelaySeconds;
    nextPinchAt.value = config.pinch.firstAtSeconds;
    zoneIndex.value = 0;
    zoneChangedAtMs.value = 0;
    prevZoneIndex.value = 0;
    grazeAtMs.value = 0;
    for (let i = 0; i < rocks.length; i++) {
      rocks[i].active.value = 0;
    }
    for (let i = 0; i < pinches.length; i++) {
      pinches[i].active.value = 0;
    }
    for (let i = 0; i < coins.length; i++) {
      coins[i].active.value = 0;
    }
    runCoins.value = 0;
    nextTrailAt.value = config.coins.trail.firstDelaySeconds;
    score.value = 0;
    tierIndex.value = 0;
    decayTimer.value = 0;
    decayThreshold.value = config.graze.decaySeconds;
    phase.value = PHASE_PLAYING;
  };

  useFrameCallback((frame) => {
    wallClockMs.value = frame.timestamp;

    const deltaMs = frame.timeSincePreviousFrame;
    if (deltaMs === null) return;
    if (phase.value !== PHASE_PLAYING) return; // scene freezes behind the overlay

    let acc =
      accumulator.value +
      Math.min(deltaMs / MS_PER_SECOND, config.engine.maxFrameDelta);

    let pos = posY.value;
    let vel = velY.value;
    let scroll = scrollX.value;
    let prevPos = prevPosY.value;
    let prevScroll = prevScrollX.value;
    let now = elapsed.value;
    let runScore = score.value;
    let coinsRun = runCoins.value;
    let tier = tierIndex.value;
    let dTimer = decayTimer.value;
    let dThreshold = decayThreshold.value;
    let died = false;

    // Helicopter hitbox — strictly smaller than the sprite (hitboxScale < 1).
    const hbWidth = config.helicopter.spriteSize.width * config.helicopter.hitboxScale;
    const hbHeight = config.helicopter.spriteSize.height * config.helicopter.hitboxScale;
    const heliCentreX = aspectRatio * config.helicopter.fixedXRatio;
    const hbLeft = heliCentreX - hbWidth / 2;
    const wall = config.world.wallThickness;
    const grazeDist = config.graze.grazeDistance;
    const tiers = config.graze.multiplierTiers;

    while (acc >= FIXED_DT) {
      prevPos = pos;
      prevScroll = scroll;
      const next = stepPhysics(pos, vel, targetY.value, FIXED_DT);
      pos = next.posY;
      vel = next.velY;
      const speed = rampAt(scroll, config.difficulty.scrollSpeed);
      scroll += speed * FIXED_DT;
      now += FIXED_DT;
      acc -= FIXED_DT;

      // Spawning — time schedules whose intervals shorten with distance.
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
      if (now >= nextPinchAt.value) {
        const interval = rampAt(scroll, config.difficulty.pinchInterval);
        nextPinchAt.value =
          now +
          interval * (1 + (Math.random() * 2 - 1) * config.pinch.intervalJitter);
        spawnPinch(scroll);
      }
      if (now >= nextTrailAt.value) {
        const t = config.coins.trail;
        nextTrailAt.value =
          now +
          t.intervalSeconds * (1 + (Math.random() * 2 - 1) * t.intervalJitter);
        spawnTrail(scroll);
      }

      const hbTop = pos - hbHeight / 2;

      // Cave walls: one touch = dead.
      if (hbTop < wall || hbTop + hbHeight > 1 - wall) {
        died = true;
      }

      // Rocks: collide, arm grazes, bank on clear, release off-screen slots.
      for (let i = 0; i < rocks.length; i++) {
        const rock = rocks[i];
        if (rock.active.value === 0) continue;
        if (rock.driftAmp.value > 0) {
          rock.centerY.value =
            rock.baseCenterY.value +
            rock.driftAmp.value *
              Math.sin(rock.driftFreq.value * now + rock.driftPhase.value);
        }
        const screenX = rock.worldX.value - scroll;
        const halfW = rock.halfW.value;
        const halfH = rock.halfH.value;
        const left = screenX - halfW;
        const top = rock.centerY.value - halfH;

        if (!died) {
          if (
            rectsOverlap(hbLeft, hbTop, hbWidth, hbHeight, left, top, 2 * halfW, 2 * halfH)
          ) {
            died = true;
          } else if (
            !rock.cleared.value &&
            rock.armed.value === 0 &&
            rectsOverlap(
              hbLeft, hbTop, hbWidth, hbHeight,
              left - grazeDist, top - grazeDist,
              2 * halfW + 2 * grazeDist, 2 * halfH + 2 * grazeDist,
            )
          ) {
            rock.armed.value = 1;
          }
        }

        if (!rock.cleared.value && screenX + halfW < hbLeft) {
          rock.cleared.value = 1;
          if (rock.armed.value === 1 && !died) {
            const combo = applyGrazes(tier, 1);
            tier = combo.tierIndex;
            dTimer = combo.decayTimer;
            dThreshold = combo.decayThreshold;
            grazeAtMs.value = frame.timestamp;
            grazeY.value = pos;
            grazeSeed.value = Math.random();
          }
        }
        if (screenX + halfW < -grazeDist) {
          rock.active.value = 0; // back to the pool
        }
      }

      // Pinches: the spurs collide and graze exactly like wide wall rocks.
      for (let i = 0; i < pinches.length; i++) {
        const p = pinches[i];
        if (p.active.value === 0) continue;
        const left = p.worldX.value - scroll;
        const len = p.length.value;
        const topLen = p.topLen.value;
        const botLen = p.botLen.value;

        if (!died) {
          if (
            rectsOverlap(hbLeft, hbTop, hbWidth, hbHeight, left, 0, len, topLen) ||
            rectsOverlap(hbLeft, hbTop, hbWidth, hbHeight, left, 1 - botLen, len, botLen)
          ) {
            died = true;
          } else if (!p.cleared.value) {
            if (
              p.armedTop.value === 0 &&
              rectsOverlap(
                hbLeft, hbTop, hbWidth, hbHeight,
                left - grazeDist, -grazeDist,
                len + 2 * grazeDist, topLen + 2 * grazeDist,
              )
            ) {
              p.armedTop.value = 1;
            }
            if (
              p.armedBottom.value === 0 &&
              rectsOverlap(
                hbLeft, hbTop, hbWidth, hbHeight,
                left - grazeDist, 1 - botLen - grazeDist,
                len + 2 * grazeDist, botLen + 2 * grazeDist,
              )
            ) {
              p.armedBottom.value = 1;
            }
          }
        }

        if (!p.cleared.value && left + len < hbLeft) {
          p.cleared.value = 1;
          const grazes = p.armedTop.value + p.armedBottom.value;
          if (grazes > 0 && !died) {
            const combo = applyGrazes(tier, grazes);
            tier = combo.tierIndex;
            dTimer = combo.decayTimer;
            dThreshold = combo.decayThreshold;
            grazeAtMs.value = frame.timestamp;
            grazeY.value = pos;
            grazeSeed.value = Math.random();
          }
        }
        if (left + len < -grazeDist) {
          p.active.value = 0; // back to the pool
        }
      }

      // Coins: generous pickup, pop window, release off-screen.
      const coinHalf = config.coins.radius * config.coins.pickupScale;
      for (let i = 0; i < coins.length; i++) {
        const c = coins[i];
        if (c.active.value === 0) continue;
        const screenX = c.worldX.value - scroll;
        if (c.collectedAtMs.value === 0) {
          if (
            !died &&
            rectsOverlap(
              hbLeft, hbTop, hbWidth, hbHeight,
              screenX - coinHalf, c.centerY.value - coinHalf,
              2 * coinHalf, 2 * coinHalf,
            )
          ) {
            c.collectedAtMs.value = frame.timestamp;
            coinsRun += c.value.value;
          }
        } else if (
          frame.timestamp - c.collectedAtMs.value >
          config.events.coinPopSeconds * MS_PER_SECOND
        ) {
          c.active.value = 0; // pop finished — back to the pool
        }
        if (screenX + coinHalf < 0) {
          c.active.value = 0;
        }
      }

      // Bank instantly at the current multiplier — the total only ever grows.
      // Points per METRE stay constant; points per second rise with the pace.
      runScore +=
        config.scoring.basePointsPerShu * tiers[tier] * speed * FIXED_DT;

      // Real-time decay pressure: one tier at a time, never a hard reset.
      const decayed = stepDecay(tier, dTimer, dThreshold, FIXED_DT);
      tier = decayed.tierIndex;
      dTimer = decayed.decayTimer;
      dThreshold = decayed.decayThreshold;

      if (died) {
        // Freeze exactly at the fatal step: no leftover time, no interpolation.
        acc = 0;
        prevPos = pos;
        prevScroll = scroll;
        break;
      }
    }

    posY.value = pos;
    velY.value = vel;
    scrollX.value = scroll;
    prevPosY.value = prevPos;
    prevScrollX.value = prevScroll;
    accumulator.value = acc;
    elapsed.value = now;

    // Zone crossings — once per frame is plenty (boundaries are metres apart).
    const zone = zoneIndexAt(scroll);
    if (zone !== zoneIndex.value) {
      prevZoneIndex.value = zoneIndex.value;
      zoneIndex.value = zone;
      zoneChangedAtMs.value = frame.timestamp;
    }

    // Retire finished effect windows: zeroed timestamps put the render
    // layer's event-driven derived values back on their idle paths.
    if (
      zoneChangedAtMs.value !== 0 &&
      frame.timestamp - zoneChangedAtMs.value >
        config.events.zoneTransitionSeconds * MS_PER_SECOND
    ) {
      prevZoneIndex.value = zoneIndex.value;
      zoneChangedAtMs.value = 0;
    }
    if (
      grazeAtMs.value !== 0 &&
      frame.timestamp - grazeAtMs.value >
        config.events.grazeEffectSeconds * MS_PER_SECOND
    ) {
      grazeAtMs.value = 0;
    }
    score.value = runScore;
    runCoins.value = coinsRun;
    tierIndex.value = tier;
    decayTimer.value = dTimer;
    decayThreshold.value = dThreshold;

    if (died) {
      phase.value = PHASE_DEAD;
      deathAtMs.value = frame.timestamp;
    }

    // Render between the last two physics states by the leftover fraction.
    const alpha = acc / FIXED_DT;
    renderY.value = prevPos + (pos - prevPos) * alpha;
    renderScrollX.value = prevScroll + (scroll - prevScroll) * alpha;
  });

  return {
    renderY,
    renderScrollX,
    scrollX,
    posY,
    targetY,
    velY,
    phase,
    score,
    tierIndex,
    decayTimer,
    decayThreshold,
    wallClockMs,
    deathAtMs,
    zoneIndex,
    zoneChangedAtMs,
    prevZoneIndex,
    grazeAtMs,
    grazeY,
    grazeSeed,
    rocks,
    pinches,
    coins,
    runCoins,
    resetRun,
  };
}
