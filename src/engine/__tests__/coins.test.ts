import { describe, expect, test } from 'vitest';
import {
  coinFits,
  coinTrailPoints,
  gateClusterPoints,
  pinchClusterPoints,
  rockClusterPoints,
} from '../spawning';

describe('coinTrailPoints', () => {
  test('line template is flat at centerY with even spacing', () => {
    const pts = coinTrailPoints(5, 0.09, 0.5, 0.1, 0, 0.1, 0.9);
    expect(pts).toHaveLength(5);
    for (const [i, p] of pts.entries()) {
      expect(p.x).toBeCloseTo(i * 0.09);
      expect(p.y).toBeCloseTo(0.5);
    }
  });

  test('sine template stays within amp of centerY', () => {
    const pts = coinTrailPoints(8, 0.09, 0.5, 0.1, 1, 0.1, 0.9);
    for (const p of pts) {
      expect(Math.abs(p.y - 0.5)).toBeLessThanOrEqual(0.1 + 1e-9);
    }
    expect(pts.some((p) => Math.abs(p.y - 0.5) > 0.05)).toBe(true);
  });

  test('arc template peaks mid-trail and returns to centerY at the ends', () => {
    const pts = coinTrailPoints(7, 0.09, 0.5, 0.1, 2, 0.1, 0.9);
    expect(pts[0].y).toBeCloseTo(0.5);
    expect(pts[6].y).toBeCloseTo(0.5);
    expect(pts[3].y).toBeCloseTo(0.5 - 0.1);
  });

  test('clamps every point into [minY, maxY]', () => {
    const pts = coinTrailPoints(8, 0.09, 0.12, 0.12, 1, 0.1, 0.9);
    for (const p of pts) {
      expect(p.y).toBeGreaterThanOrEqual(0.1);
      expect(p.y).toBeLessThanOrEqual(0.9);
    }
  });
});

describe('coinFits', () => {
  const rect = { x1: 1, x2: 1.2, y1: 0.4, y2: 0.6 };

  test('rejects a coin whose pickup box clips a blocker', () => {
    expect(coinFits(1.21, 0.5, 0.03, [rect])).toBe(false);
  });

  test('accepts a coin clear of every blocker', () => {
    expect(coinFits(1.3, 0.5, 0.03, [rect])).toBe(true);
    expect(coinFits(1.1, 0.1, 0.03, [rect])).toBe(true);
  });
});

describe('cluster points', () => {
  test('rock trio hugs the right edge at the given offset', () => {
    const pts = rockClusterPoints(2.0, 0.5, 0.06, 0.0175);
    expect(pts).toHaveLength(3);
    for (const p of pts) expect(p.x).toBeCloseTo(2.0175);
    expect(pts.map((p) => p.y)).toEqual([0.44, 0.5, 0.56]);
  });

  test('gate trio spans half the gap around its centre', () => {
    const pts = gateClusterPoints(3.0, 0.5, 0.11);
    expect(pts.map((p) => p.y)).toEqual([0.445, 0.5, 0.555]);
  });

  test('pinch trio sits at 30/50/70% of the span on the corridor centre', () => {
    const pts = pinchClusterPoints(4.0, 0.5, 0.35);
    expect(pts.map((p) => p.x)).toEqual([4.15, 4.25, 4.35]);
    for (const p of pts) expect(p.y).toBe(0.35);
  });
});
