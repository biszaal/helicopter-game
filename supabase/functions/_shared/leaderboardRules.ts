// Deno-runtime duplicate of src/net/leaderboardRules.ts. Edge Functions
// deploy independently of the RN app and can't import from src/, so this
// is a manual copy — if you change one, change both. The only difference
// from the client copy is the `npm:` import specifier Deno needs.
import Filter from 'npm:bad-words@^4';

const filter = new Filter();
// Ensure compound profanities are caught
filter.addWords('fuckface');

export function isValidUsernameFormat(username: string): boolean {
  return /^[a-zA-Z0-9_]{3,16}$/.test(username);
}

export function containsBlockedWord(username: string): boolean {
  return filter.isProfane(username);
}

export function isClaimableUsername(username: string): boolean {
  return isValidUsernameFormat(username) && !containsBlockedWord(username);
}

const BASE_POINTS_PER_SHU = 120;
const MAX_MULTIPLIER = 10;
const SCROLL_SPEED_CAP = 0.95;
const METERS_PER_SHU = 100;
const SLACK = 1.05;

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
  if (score > maxScoreForDuration(durationMs)) return false;
  if (distanceMeters > maxMetersForDuration(durationMs)) return false;
  return true;
}
