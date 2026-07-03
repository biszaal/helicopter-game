import { describe, expect, test } from 'vitest';
import { rampAt, zoneIndexAt } from '../spawning';

describe('rampAt', () => {
  const up = { start: 0.55, perShu: 0.008, cap: 0.95 };
  const down = { start: 0.9, perShu: -0.008, cap: 0.5 };

  test('returns start at zero distance', () => {
    expect(rampAt(0, up)).toBe(0.55);
  });
  test('rises linearly with distance', () => {
    expect(rampAt(10, up)).toBeCloseTo(0.63);
  });
  test('clamps a rising ramp at its cap', () => {
    expect(rampAt(1000, up)).toBe(0.95);
  });
  test('falls linearly when perShu is negative', () => {
    expect(rampAt(10, down)).toBeCloseTo(0.82);
  });
  test('clamps a falling ramp at its floor', () => {
    expect(rampAt(1000, down)).toBe(0.5);
  });
});

describe('zoneIndexAt', () => {
  // config.zones boundaries: 0 / 1500 / 4000 / 7000 m; 1 shu = 100 m.
  test('run start is the first zone', () => {
    expect(zoneIndexAt(0)).toBe(0);
  });
  test('stays in the previous zone just before a boundary', () => {
    expect(zoneIndexAt(14.9)).toBe(0);
  });
  test('crossing a boundary enters the zone', () => {
    expect(zoneIndexAt(15)).toBe(1);
  });
  test('deep runs stay in the last zone forever', () => {
    expect(zoneIndexAt(1000)).toBe(3);
  });
});
