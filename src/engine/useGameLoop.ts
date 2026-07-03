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
  pinchSpurs,
  placeRock,
  sizeScaleAt,
  type OccupiedRect,
} from './spawning';
import { useRockPool, type RockSlot } from './useRockPool';
import { usePinchPool, type PinchSlot } from './usePinchPool';

/** Fixed physics timestep (s). Physics only ever advances in these increments. */
const FIXED_DT = 1 / config.engine.physicsHz;
export const MS_PER_SECOND = 1000;

export const PHASE_PLAYING = 0;
export const PHASE_DEAD = 1;

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
  /** Pooled world objects, for rendering. */
  rocks: RockSlot[];
  pinches: PinchSlot[];
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

  /** Run time (s) — drives the size ramp and the pinch schedule. */
  const elapsed = useSharedValue(0);
  const nextRockAt = useSharedValue<number>(
    config.obstacles.firstSpawnDelaySeconds,
  );
  const nextPinchAt = useSharedValue<number>(config.pinch.firstAtSeconds);

  const score = useSharedValue(0);
  const tierIndex = useSharedValue(0);
  const decayTimer = useSharedValue(0);
  const decayThreshold = useSharedValue<number>(config.graze.decaySeconds);

  const rocks = useRockPool();
  const pinches = usePinchPool();

  const spawnPinch = (scroll: number, now: number) => {
    'worklet';
    for (let i = 0; i < pinches.length; i++) {
      const p = pinches[i];
      if (p.active.value === 0) {
        const spurs = pinchSpurs(now, Math.random);
        p.worldX.value = scroll + aspectRatio;
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

  const spawnRock = (scroll: number, now: number) => {
    'worklet';
    const { baseWidth, baseHeight, sizeJitter } = config.obstacles;
    const scale = sizeScaleAt(now);
    const halfW =
      (baseWidth / 2) * scale * (1 + (Math.random() * 2 - 1) * sizeJitter);
    const halfH =
      (baseHeight / 2) * scale * (1 + (Math.random() * 2 - 1) * sizeJitter);
    const centreX = scroll + aspectRatio + halfW;

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
    const occupied: OccupiedRect[] = [];
    for (let i = 0; i < rocks.length; i++) {
      const r = rocks[i];
      if (r.active.value === 0) continue;
      occupied.push({
        x1: r.worldX.value - r.halfW.value,
        x2: r.worldX.value + r.halfW.value,
        y1: r.centerY.value - r.halfH.value,
        y2: r.centerY.value + r.halfH.value,
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

    const y = placeRock(
      centreX - halfW,
      centreX + halfW,
      halfH,
      occupied,
      Math.random,
    );
    if (y === null) return; // never seal the tunnel — skip instead

    for (let i = 0; i < rocks.length; i++) {
      const r = rocks[i];
      if (r.active.value === 0) {
        r.worldX.value = centreX;
        r.centerY.value = y;
        r.halfW.value = halfW;
        r.halfH.value = halfH;
        r.cleared.value = 0;
        r.armed.value = 0;
        r.seed.value = Math.random(); // cosmetic: shape variant
        r.active.value = 1;
        return;
      }
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
    for (let i = 0; i < rocks.length; i++) {
      rocks[i].active.value = 0;
    }
    for (let i = 0; i < pinches.length; i++) {
      pinches[i].active.value = 0;
    }
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
      scroll += config.world.baseScrollSpeed * FIXED_DT;
      now += FIXED_DT;
      acc -= FIXED_DT;

      // Spawning — absolute-time schedules with jittered rescheduling.
      if (now >= nextRockAt.value) {
        const { spawnIntervalBase, spawnIntervalJitter } = config.obstacles;
        nextRockAt.value =
          now +
          spawnIntervalBase *
            (1 + (Math.random() * 2 - 1) * spawnIntervalJitter);
        spawnRock(scroll, now);
      }
      if (now >= nextPinchAt.value) {
        const { intervalSeconds, intervalJitter } = config.pinch;
        nextPinchAt.value =
          now +
          intervalSeconds * (1 + (Math.random() * 2 - 1) * intervalJitter);
        spawnPinch(scroll, now);
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
          }
        }
        if (left + len < -grazeDist) {
          p.active.value = 0; // back to the pool
        }
      }

      // Bank instantly at the current multiplier — the total only ever grows.
      runScore +=
        config.scoring.basePointsPerShu *
        tiers[tier] *
        config.world.baseScrollSpeed *
        FIXED_DT;

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
    score.value = runScore;
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
    rocks,
    pinches,
    resetRun,
  };
}
