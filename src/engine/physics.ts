import { config } from '../config';

export interface PhysicsSnapshot {
  /** Helicopter centre, shu from the top of the playfield. */
  posY: number;
  /** Vertical velocity, shu/s. Positive = falling. */
  velY: number;
}

/**
 * Advance the helicopter by one fixed timestep. Pure function of its inputs —
 * the same (state, input, dt) always produces the same result, which is what
 * makes motion identical on 60Hz and 120Hz devices.
 */
export function stepPhysics(
  posY: number,
  velY: number,
  thrusting: boolean,
  dt: number,
): PhysicsSnapshot {
  'worklet';
  const { gravity, thrustAccel, maxFallSpeed, maxRiseSpeed } = config.physics;

  // Gravity always pulls; thrust fights it while the screen is held.
  const accel = thrusting ? gravity - thrustAccel : gravity;
  let nextVel = velY + accel * dt;
  if (nextVel > maxFallSpeed) nextVel = maxFallSpeed;
  if (nextVel < -maxRiseSpeed) nextVel = -maxRiseSpeed;

  let nextPos = posY + nextVel * dt;

  // Soft screen bounds (Phase 1: clamp, don't kill). Kill the velocity into
  // the wall so the helicopter doesn't stick when reversing away from it.
  const halfHeight = config.helicopter.spriteSize.height / 2;
  const minY = halfHeight;
  const maxY = 1 - halfHeight;
  if (nextPos < minY) {
    nextPos = minY;
    if (nextVel < 0) nextVel = 0;
  } else if (nextPos > maxY) {
    nextPos = maxY;
    if (nextVel > 0) nextVel = 0;
  }

  return { posY: nextPos, velY: nextVel };
}
