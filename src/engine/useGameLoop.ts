import {
  useFrameCallback,
  useSharedValue,
  type SharedValue,
} from 'react-native-reanimated';
import { config } from '../config';
import { stepPhysics } from './physics';

/** Fixed physics timestep (s). Physics only ever advances in these increments. */
const FIXED_DT = 1 / config.engine.physicsHz;
const MS_PER_SECOND = 1000;

export interface GameLoop {
  /** Interpolated helicopter centre (shu) — what the renderer should draw. */
  renderY: SharedValue<number>;
  /** Interpolated world scroll distance (shu) for the background. */
  renderScrollX: SharedValue<number>;
  /** Input flag — true while the player is touching the screen. */
  thrusting: SharedValue<boolean>;
}

/**
 * The game loop. Runs on the UI thread via useFrameCallback.
 *
 * Fixed-timestep accumulator: real frame time is accumulated, physics steps
 * in FIXED_DT increments, and the leftover fraction interpolates between the
 * last two physics states for rendering. Render framerate never touches the
 * simulation — a 60Hz and a 120Hz device produce identical motion.
 */
export function useGameLoop(): GameLoop {
  const posY = useSharedValue<number>(config.helicopter.startYRatio);
  const velY = useSharedValue(0);
  const prevPosY = useSharedValue<number>(config.helicopter.startYRatio);
  const scrollX = useSharedValue(0);
  const prevScrollX = useSharedValue(0);
  const accumulator = useSharedValue(0);
  const thrusting = useSharedValue(false);
  const renderY = useSharedValue<number>(config.helicopter.startYRatio);
  const renderScrollX = useSharedValue(0);

  useFrameCallback((frame) => {
    const deltaMs = frame.timeSincePreviousFrame;
    if (deltaMs === null) return;

    let acc =
      accumulator.value +
      Math.min(deltaMs / MS_PER_SECOND, config.engine.maxFrameDelta);

    let pos = posY.value;
    let vel = velY.value;
    let scroll = scrollX.value;
    let prevPos = prevPosY.value;
    let prevScroll = prevScrollX.value;

    while (acc >= FIXED_DT) {
      prevPos = pos;
      prevScroll = scroll;
      const next = stepPhysics(pos, vel, thrusting.value, FIXED_DT);
      pos = next.posY;
      vel = next.velY;
      scroll += config.world.baseScrollSpeed * FIXED_DT;
      acc -= FIXED_DT;
    }

    posY.value = pos;
    velY.value = vel;
    scrollX.value = scroll;
    prevPosY.value = prevPos;
    prevScrollX.value = prevScroll;
    accumulator.value = acc;

    // Render between the last two physics states by the leftover fraction.
    const alpha = acc / FIXED_DT;
    renderY.value = prevPos + (pos - prevPos) * alpha;
    renderScrollX.value = prevScroll + (scroll - prevScroll) * alpha;
  });

  return { renderY, renderScrollX, thrusting };
}
