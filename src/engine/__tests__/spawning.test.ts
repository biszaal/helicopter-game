import { describe, expect, test } from 'vitest';
import {
  doublePinchCentres,
  placeWallGap,
  spursFor,
  wallSegments,
  pinchGapAt,
  pinchEntryX,
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

function makeRng(values: number[]): () => number {
  let i = 0;
  return () => (i < values.length ? values[i++] : 0.5);
}

describe('spursFor', () => {
  test('spur lengths and the gap tile the tunnel exactly', () => {
    const { topLen, botLen } = spursFor(0.4, 0.2);
    expect(topLen).toBeCloseTo(0.3);
    expect(botLen).toBeCloseTo(0.5);
    expect(topLen + 0.2 + botLen).toBeCloseTo(1);
  });
});

describe('doublePinchCentres', () => {
  test('second centre is pushed toward the other side', () => {
    // rng 1 → first centre jitters fully down-screen (0.5 + 0.15 = 0.65)
    const c = doublePinchCentres(0, makeRng([1]));
    expect(c.first).toBeCloseTo(0.65);
    expect(c.second).toBeCloseTo(0.65 - 0.22);
  });
  test('a first centre above mid pushes the second the other way', () => {
    const c = doublePinchCentres(0, makeRng([0]));
    expect(c.first).toBeCloseTo(0.35);
    expect(c.second).toBeCloseTo(0.35 + 0.22);
  });
  test('both centres keep spurs inside the playfield at the gap floor', () => {
    // 10000 shu → gap at floor 0.18; extreme jitter must still clamp.
    const c = doublePinchCentres(10_000, makeRng([1]));
    const wall = 0.045;
    for (const centre of [c.first, c.second]) {
      expect(centre - c.gap / 2).toBeGreaterThanOrEqual(wall);
      expect(centre + c.gap / 2).toBeLessThanOrEqual(1 - wall);
    }
  });
});

describe('pinchEntryX', () => {
  // config.pinch.rockFreeMargin = 0.18.
  test('an empty tunnel keeps the desired entry x', () => {
    expect(pinchEntryX(2.16, [])).toBe(2.16);
  });
  test('a rock inside the left margin pushes the pinch past it', () => {
    // Rock spawned a moment ago, still within margin of the entry point.
    const rocks = [{ x1: 2.0, x2: 2.1, y1: 0.4, y2: 0.6 }];
    expect(pinchEntryX(2.16, rocks)).toBeCloseTo(2.28);
  });
  test('the farthest conflicting rock wins', () => {
    const rocks = [
      { x1: 2.0, x2: 2.1, y1: 0.4, y2: 0.6 },
      { x1: 2.05, x2: 2.2, y1: 0.1, y2: 0.3 },
    ];
    expect(pinchEntryX(2.16, rocks)).toBeCloseTo(2.38);
  });
  test('rocks already clear of the margin do not shift anything', () => {
    const rocks = [{ x1: 1.5, x2: 1.6, y1: 0.4, y2: 0.6 }];
    expect(pinchEntryX(2.16, rocks)).toBe(2.16);
  });
  test('every rock ends up outside the returned span and its margins', () => {
    const rocks = [
      { x1: 1.9, x2: 2.05, y1: 0.4, y2: 0.6 },
      { x1: 2.1, x2: 2.24, y1: 0.1, y2: 0.3 },
    ];
    const entry = pinchEntryX(2.16, rocks);
    for (const r of rocks) {
      expect(r.x2).toBeLessThanOrEqual(entry - 0.18 + 1e-9);
    }
  });
});

describe('placeWallGap', () => {
  test('accepts a spot clear of nearby blockers', () => {
    // rng 0.5 → gap centre mid-tunnel; nothing occupied.
    expect(placeWallGap(1, 1.1, 0.11, [], makeRng([0.5]))).toBeCloseTo(0.5);
  });
  test('rejects spots overlapping a blocker, then retries', () => {
    // A blocker at mid-tunnel in the same x window; first try (0.5)
    // collides, second try (0.1) is clear.
    const occupied = [{ x1: 1, x2: 1.1, y1: 0.45, y2: 0.55 }];
    const y = placeWallGap(1, 1.1, 0.05, occupied, makeRng([0.5, 0.1]));
    expect(y).not.toBeNull();
    expect(Math.abs((y as number) - 0.5)).toBeGreaterThan(0.1);
  });
  test('returns null when every try is blocked', () => {
    const occupied = [{ x1: 1, x2: 1.1, y1: 0, y2: 1 }];
    expect(placeWallGap(1, 1.1, 0.11, occupied, makeRng([]))).toBeNull();
  });
  test('far-away blockers are ignored', () => {
    const occupied = [{ x1: 5, x2: 5.1, y1: 0, y2: 1 }];
    expect(placeWallGap(1, 1.1, 0.11, occupied, makeRng([0.5]))).not.toBeNull();
  });
});

describe('wallSegments', () => {
  const wall = 0.045;
  test('tiles both bands exactly, never entering the gap', () => {
    const segs = wallSegments(0.5, 0.11, 0.055);
    expect(segs.length).toBeGreaterThan(0);
    for (const s of segs) {
      const top = s.centerY - s.halfH;
      const bottom = s.centerY + s.halfH;
      expect(top).toBeGreaterThanOrEqual(wall - 1e-9);
      expect(bottom).toBeLessThanOrEqual(1 - wall + 1e-9);
      const inGap = top < 0.5 + 0.11 - 1e-9 && bottom > 0.5 - 0.11 + 1e-9;
      expect(inGap).toBe(false);
    }
    // Coverage: total segment height equals tunnel height minus the gap.
    const covered = segs.reduce((sum, s) => sum + 2 * s.halfH, 0);
    expect(covered).toBeCloseTo(1 - 2 * wall - 0.22);
  });
  test('a gap flush against a wall leaves that band empty', () => {
    const segs = wallSegments(wall + 0.11, 0.11, 0.055);
    for (const s of segs) {
      expect(s.centerY - s.halfH).toBeGreaterThanOrEqual(wall + 0.22 - 1e-9);
    }
  });
});
