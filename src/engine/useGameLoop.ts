import {
  useFrameCallback,
  useSharedValue,
  type SharedValue,
} from 'react-native-reanimated';
import { config } from '../config';
import { stepPhysics } from './physics';
import { rectsOverlap } from './collision';
import { applyGrazes, stepDecay } from './scoring';
import { useObstaclePool, type ObstacleSlot } from './useObstaclePool';

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
  /** Input flag — true while the player is touching the screen. */
  thrusting: SharedValue<boolean>;
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
  /** The pooled obstacles, for rendering. */
  slots: ObstacleSlot[];
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
  const scrollX = useSharedValue(0);
  const prevScrollX = useSharedValue(0);
  const accumulator = useSharedValue(0);
  const thrusting = useSharedValue(false);
  const renderY = useSharedValue<number>(config.helicopter.startYRatio);
  const renderScrollX = useSharedValue(0);

  const phase = useSharedValue(PHASE_PLAYING);
  const wallClockMs = useSharedValue(0);
  const deathAtMs = useSharedValue(0);
  const spawnTimer = useSharedValue<number>(
    config.obstacles.spawnIntervalBase - config.obstacles.firstSpawnDelaySeconds,
  );

  const score = useSharedValue(0);
  const tierIndex = useSharedValue(0);
  const decayTimer = useSharedValue(0);
  const decayThreshold = useSharedValue<number>(config.graze.decaySeconds);

  const slots = useObstaclePool();

  const spawnObstacle = (scroll: number) => {
    'worklet';
    const { gapSizeBase, gapPositionJitter, width, minRockLength } =
      config.obstacles;
    const wall = config.world.wallThickness;
    const halfGap = gapSizeBase / 2;

    // Keep both rocks at least minRockLength long inside the walls.
    const minCentre = wall + minRockLength + halfGap;
    const maxCentre = 1 - wall - minRockLength - halfGap;
    let centre = 0.5 + (Math.random() * 2 - 1) * gapPositionJitter;
    if (centre < minCentre) centre = minCentre;
    if (centre > maxCentre) centre = maxCentre;

    for (let i = 0; i < slots.length; i++) {
      const slot = slots[i];
      if (slot.active.value === 0) {
        slot.topLen.value = centre - halfGap;
        slot.botLen.value = 1 - (centre + halfGap);
        slot.worldX.value = scroll + aspectRatio + width / 2;
        slot.cleared.value = 0;
        slot.armedTop.value = 0;
        slot.armedBottom.value = 0;
        slot.active.value = 1;
        return;
      }
    }
  };

  const resetRun = () => {
    'worklet';
    posY.value = config.helicopter.startYRatio;
    velY.value = 0;
    prevPosY.value = config.helicopter.startYRatio;
    scrollX.value = 0;
    prevScrollX.value = 0;
    accumulator.value = 0;
    renderY.value = config.helicopter.startYRatio;
    renderScrollX.value = 0;
    spawnTimer.value =
      config.obstacles.spawnIntervalBase -
      config.obstacles.firstSpawnDelaySeconds;
    for (let i = 0; i < slots.length; i++) {
      slots[i].active.value = 0;
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
    let timer = spawnTimer.value;
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
    const rockWidth = config.obstacles.width;
    const wall = config.world.wallThickness;
    const grazeDist = config.graze.grazeDistance;
    const tiers = config.graze.multiplierTiers;

    while (acc >= FIXED_DT) {
      prevPos = pos;
      prevScroll = scroll;
      const next = stepPhysics(pos, vel, thrusting.value, FIXED_DT);
      pos = next.posY;
      vel = next.velY;
      scroll += config.world.baseScrollSpeed * FIXED_DT;
      acc -= FIXED_DT;

      // Spawning — interval-based, from the fixed timestep so it's exact.
      timer += FIXED_DT;
      if (timer >= config.obstacles.spawnIntervalBase) {
        timer -= config.obstacles.spawnIntervalBase;
        spawnObstacle(scroll);
      }

      const hbTop = pos - hbHeight / 2;

      // Cave walls: one touch = dead.
      if (hbTop < wall || hbTop + hbHeight > 1 - wall) {
        died = true;
      }

      // Obstacles: collide, arm grazes, then bank them as rocks are cleared.
      for (let i = 0; i < slots.length; i++) {
        const slot = slots[i];
        if (slot.active.value === 0) continue;
        const screenX = slot.worldX.value - scroll;
        const rockLeft = screenX - rockWidth / 2;
        const topLen = slot.topLen.value;
        const botLen = slot.botLen.value;

        if (!died) {
          if (
            rectsOverlap(hbLeft, hbTop, hbWidth, hbHeight, rockLeft, 0, rockWidth, topLen) ||
            rectsOverlap(hbLeft, hbTop, hbWidth, hbHeight, rockLeft, 1 - botLen, rockWidth, botLen)
          ) {
            died = true;
          } else if (!slot.cleared.value) {
            // Graze arming: hitbox inside a rock's band (rock inflated by
            // grazeDistance) without touching it. Banks when the rock clears.
            if (
              slot.armedTop.value === 0 &&
              rectsOverlap(
                hbLeft, hbTop, hbWidth, hbHeight,
                rockLeft - grazeDist, -grazeDist,
                rockWidth + 2 * grazeDist, topLen + 2 * grazeDist,
              )
            ) {
              slot.armedTop.value = 1;
            }
            if (
              slot.armedBottom.value === 0 &&
              rectsOverlap(
                hbLeft, hbTop, hbWidth, hbHeight,
                rockLeft - grazeDist, 1 - botLen - grazeDist,
                rockWidth + 2 * grazeDist, botLen + 2 * grazeDist,
              )
            ) {
              slot.armedBottom.value = 1;
            }
          }
        }

        if (!slot.cleared.value && screenX + rockWidth / 2 < hbLeft) {
          slot.cleared.value = 1;
          const grazes = slot.armedTop.value + slot.armedBottom.value;
          if (grazes > 0 && !died) {
            const combo = applyGrazes(tier, grazes);
            tier = combo.tierIndex;
            dTimer = combo.decayTimer;
            dThreshold = combo.decayThreshold;
          }
        }
        if (screenX + rockWidth / 2 < -rockWidth) {
          slot.active.value = 0; // back to the pool
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
    spawnTimer.value = timer;
    score.value = runScore;
    tierIndex.value = tier;
    decayTimer.value = dTimer;
    decayThreshold.value = dThreshold;

    if (died) {
      phase.value = PHASE_DEAD;
      deathAtMs.value = frame.timestamp;
      thrusting.value = false;
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
    thrusting,
    phase,
    score,
    tierIndex,
    decayTimer,
    decayThreshold,
    wallClockMs,
    deathAtMs,
    slots,
    resetRun,
  };
}
