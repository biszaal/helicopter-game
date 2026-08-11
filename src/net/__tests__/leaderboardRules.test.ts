import { describe, expect, test } from 'vitest';
import {
  isValidUsernameFormat,
  containsBlockedWord,
  isClaimableUsername,
  maxScoreForDuration,
  maxMetersForDuration,
  isPlausibleRun,
} from '../leaderboardRules';

describe('isValidUsernameFormat', () => {
  test('accepts alphanumeric + underscore, 3-16 chars', () => {
    expect(isValidUsernameFormat('Pilot_482')).toBe(true);
  });
  test('rejects too short', () => {
    expect(isValidUsernameFormat('ab')).toBe(false);
  });
  test('rejects too long', () => {
    expect(isValidUsernameFormat('a'.repeat(17))).toBe(false);
  });
  test('rejects symbols and spaces', () => {
    expect(isValidUsernameFormat('pilot 482')).toBe(false);
    expect(isValidUsernameFormat('pilot!')).toBe(false);
  });
});

describe('containsBlockedWord', () => {
  test('flags an obvious profane name', () => {
    expect(containsBlockedWord('fuckface')).toBe(true);
  });
  test('allows a clean name', () => {
    expect(containsBlockedWord('SkyPilot42')).toBe(false);
  });
});

describe('isClaimableUsername', () => {
  test('valid and clean passes', () => {
    expect(isClaimableUsername('SkyPilot42')).toBe(true);
  });
  test('valid format but profane fails', () => {
    expect(isClaimableUsername('fuckface')).toBe(false);
  });
  test('invalid format fails regardless of content', () => {
    expect(isClaimableUsername('ab')).toBe(false);
  });
});

describe('maxScoreForDuration', () => {
  test('matches the documented formula', () => {
    expect(maxScoreForDuration(1000)).toBeCloseTo(120 * 10 * 0.95 * 1.05);
  });
  test('scales linearly with duration', () => {
    expect(maxScoreForDuration(2000)).toBeCloseTo(maxScoreForDuration(1000) * 2);
  });
});

describe('maxMetersForDuration', () => {
  test('matches the documented formula', () => {
    expect(maxMetersForDuration(1000)).toBeCloseTo(0.95 * 100 * 1.05);
  });
});

describe('isPlausibleRun', () => {
  test('accepts a realistic run', () => {
    expect(isPlausibleRun(8000, 6000, 90000)).toBe(true);
  });
  test('rejects a score far beyond the theoretical ceiling', () => {
    expect(isPlausibleRun(999999, 6000, 90000)).toBe(false);
  });
  test('rejects a distance far beyond the theoretical ceiling', () => {
    expect(isPlausibleRun(8000, 999999, 90000)).toBe(false);
  });
  test('rejects non-finite, negative, or zero-duration inputs', () => {
    expect(isPlausibleRun(NaN, 100, 1000)).toBe(false);
    expect(isPlausibleRun(-1, 100, 1000)).toBe(false);
    expect(isPlausibleRun(100, 100, 0)).toBe(false);
  });
  test('rejects a duration beyond the absolute ceiling even with an otherwise-plausible score', () => {
    expect(isPlausibleRun(100, 100, 3_600_001)).toBe(false);
  });
});
