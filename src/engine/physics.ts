import { config } from '../config';

export interface PhysicsSnapshot {
  /** Helicopter centre, shu from the top of the playfield. */
  posY: number;
  /** Vertical velocity, shu/s. Positive = downward. */
  velY: number;
}

/**
 * Advance the helicopter by one fixed timestep. Pure function of its inputs —
 * the same (state, input, dt) always produces the same result, which is what
 * makes motion identical on 60Hz and 120Hz devices.
 *
 * No gravity: with no input the helicopter settles and flies dead straight.
 * Steering spring-chases targetY, so direction changes carry momentum and a
 * slight overshoot (springDamping is set below critical on purpose).
 */
export function stepPhysics(
  posY: number,
  velY: number,
  targetY: number,
  dt: number,
): PhysicsSnapshot {
  'worklet';
  const { springStiffness, springDamping, maxSpeed } = config.physics;

  const accel = springStiffness * (targetY - posY) - springDamping * velY;
  let nextVel = velY + accel * dt;
  if (nextVel > maxSpeed) nextVel = maxSpeed;
  if (nextVel < -maxSpeed) nextVel = -maxSpeed;

  const nextPos = posY + nextVel * dt;

  return { posY: nextPos, velY: nextVel };
}
