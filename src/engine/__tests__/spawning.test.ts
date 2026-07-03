import { describe, expect, test } from 'vitest';
import {
  pinchGapAt,
  placeRock,
  rampAt,
  sizeScaleAt,
  zoneIndexAt,
} from '../spawning';

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

describe('sizeScaleAt (distance-driven)', () => {
  test('rocks start at 1×', () => {
    expect(sizeScaleAt(0)).toBe(1);
  });
  test('rocks grow with distance', () => {
    expect(sizeScaleAt(10)).toBeCloseTo(1.22);
  });
  test('growth caps', () => {
    expect(sizeScaleAt(10_000)).toBe(2.2);
  });
});

describe('pinchGapAt (distance-driven)', () => {
  test('first pinches are wide', () => {
    expect(pinchGapAt(0)).toBe(0.4);
  });
  test('pinches narrow with distance', () => {
    expect(pinchGapAt(10)).toBeCloseTo(0.36);
  });
  test('the gap never drops below its floor', () => {
    expect(pinchGapAt(10_000)).toBe(0.18);
  });
});

describe('placeRock clearance parameter', () => {
  // One rock mid-tunnel leaves ~0.4 shu of free space above and below it.
  const occupied = [{ x1: 0, x2: 0.2, y1: 0.45, y2: 0.55 }];
  const rng = () => 0.5; // deterministic candidate: centre of the valid band

  test('placement succeeds when a corridor of the passed clearance survives', () => {
    expect(placeRock(0, 0.2, 0.05, occupied, rng, 0.16)).not.toBeNull();
  });
  test('placement is rejected when the demanded clearance cannot survive', () => {
    expect(placeRock(0, 0.2, 0.05, occupied, rng, 1.5)).toBeNull();
  });
});
