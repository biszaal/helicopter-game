// Mirrored in supabase/functions/_shared/leaderboardRules.ts for the Deno
// Edge Functions — if you change one, change both.

import { Filter } from 'bad-words';

const filter = new Filter();
// Ensure compound profanities are caught
filter.addWords('fuckface');

/** 3-16 chars, alphanumeric + underscore only. */
export function isValidUsernameFormat(username: string): boolean {
  return /^[a-zA-Z0-9_]{3,16}$/.test(username);
}

export function containsBlockedWord(username: string): boolean {
  return filter.isProfane(username);
}

export function isClaimableUsername(username: string): boolean {
  return isValidUsernameFormat(username) && !containsBlockedWord(username);
}

/**
 * Constants mirrored from src/config.ts (scoring.basePointsPerShu,
 * scoring.metersPerShu, graze.multiplierTiers, difficulty.scrollSpeed.cap).
 * This file exists so the plausibility math is unit-tested in one place —
 * the enforcement that actually matters runs server-side, in
 * supabase/functions/_shared/leaderboardRules.ts, which duplicates these
 * same functions for the Deno runtime. If you tune scoring/difficulty in
 * config.ts, update both copies.
 */
const BASE_POINTS_PER_SHU = 120;
const MAX_MULTIPLIER = 10;
const SCROLL_SPEED_CAP = 0.95; // shu/s
const METERS_PER_SHU = 100;
/** Generous slack around the theoretical ceiling for frame-timing jitter —
 * this is deliberately loose; it exists to reject fabricated submissions,
 * not to model the exact ramp. */
const SLACK = 1.05;
/** Absolute ceiling on a claimed run length — generous (no real run gets
 * anywhere close), exists purely to reject fabricated durations that would
 * otherwise make the linear score/distance ceilings meaningless. */
const MAX_DURATION_MS = 3_600_000; // 1 hour

export function maxScoreForDuration(durationMs: number): number {
  const seconds = durationMs / 1000;
  return BASE_POINTS_PER_SHU * MAX_MULTIPLIER * SCROLL_SPEED_CAP * seconds * SLACK;
}

export function maxMetersForDuration(durationMs: number): number {
  const seconds = durationMs / 1000;
  return SCROLL_SPEED_CAP * seconds * METERS_PER_SHU * SLACK;
}

export function isPlausibleRun(
  score: number,
  distanceMeters: number,
  durationMs: number,
): boolean {
  if (
    !Number.isFinite(score) ||
    !Number.isFinite(distanceMeters) ||
    !Number.isFinite(durationMs)
  ) {
    return false;
  }
  if (score < 0 || distanceMeters < 0 || durationMs <= 0) return false;
  if (durationMs > MAX_DURATION_MS) return false;
  if (score > maxScoreForDuration(durationMs)) return false;
  if (distanceMeters > maxMetersForDuration(durationMs)) return false;
  return true;
}
