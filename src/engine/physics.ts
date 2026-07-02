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

  // No position clamping since Phase 2 — the cave walls are collidable and
  // the loop's collision pass turns wall contact into death.
  const nextPos = posY + nextVel * dt;

  return { posY: nextPos, velY: nextVel };
}
