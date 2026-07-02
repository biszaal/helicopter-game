import { config } from '../config';

/**
 * The Close Call combo state. tierIndex indexes config.graze.multiplierTiers;
 * the multiplier is the *rate* points bank at — never a pot that can be lost.
 */
export interface ComboState {
  tierIndex: number;
  /** Seconds since the last graze (or last decay step). */
  decayTimer: number;
  /** Seconds the timer must reach before the next one-tier step down. */
  decayThreshold: number;
}

/** A fresh combo: ×1, decay idle. */
export function initialCombo(): ComboState {
  'worklet';
  return { tierIndex: 0, decayTimer: 0, decayThreshold: config.graze.decaySeconds };
}

/**
 * Register grazes: each one steps the multiplier up one tier (capped at the
 * top tier) and resets the decay countdown to the full grace window.
 */
export function applyGrazes(tierIndex: number, grazeCount: number): ComboState {
  'worklet';
  const maxTier = config.graze.multiplierTiers.length - 1;
  let next = tierIndex + grazeCount;
  if (next > maxTier) next = maxTier;
  return { tierIndex: next, decayTimer: 0, decayThreshold: config.graze.decaySeconds };
}

/**
 * Advance the real-time decay clock. When the threshold elapses the
 * multiplier steps DOWN ONE TIER (never a hard reset), and further tiers
 * drop every decayStepSeconds until a graze interrupts or ×1 is reached.
 */
export function stepDecay(
  tierIndex: number,
  decayTimer: number,
  decayThreshold: number,
  dt: number,
): ComboState {
  'worklet';
  if (tierIndex === 0) {
    return initialCombo();
  }
  let tier = tierIndex;
  let timer = decayTimer + dt;
  let threshold = decayThreshold;
  while (tier > 0 && timer >= threshold) {
    timer -= threshold;
    tier -= 1;
    threshold = config.graze.decayStepSeconds;
  }
  if (tier === 0) {
    return initialCombo();
  }
  return { tierIndex: tier, decayTimer: timer, decayThreshold: threshold };
}
