import { describe, expect, it } from 'vitest';
import { config } from '../../config';
import { theme } from '../theme';
import {
  CITY_FLICKER_GROUPS,
  cityLayout,
  crystalLayout,
  mountainLayout,
  type Pt,
  type RectT,
} from '../sceneryGeometry';

const TILE = 1.5;
const MAX_H = 0.3;

function expectPtInBounds(pt: Pt) {
  expect(pt.x).toBeGreaterThanOrEqual(0);
  expect(pt.x).toBeLessThanOrEqual(TILE);
  expect(pt.y).toBeGreaterThanOrEqual(0);
  expect(pt.y).toBeLessThanOrEqual(MAX_H);
}

function expectRectInBounds(r: RectT) {
  expect(r.x).toBeGreaterThanOrEqual(0);
  expect(r.x + r.w).toBeLessThanOrEqual(TILE);
  expect(r.y).toBeGreaterThanOrEqual(0);
  expect(r.y + r.h).toBeLessThanOrEqual(MAX_H);
}

describe('zone tables', () => {
  it('scenery, palette, and zone tables stay index-aligned', () => {
    expect(theme.scenery).toHaveLength(config.zones.length);
    expect(theme.zones).toHaveLength(config.zones.length);
  });
});

describe('mountainLayout', () => {
  it('is deterministic for a seed and varies across seeds', () => {
    expect(mountainLayout(TILE, MAX_H, 7)).toEqual(mountainLayout(TILE, MAX_H, 7));
    expect(mountainLayout(TILE, MAX_H, 7)).not.toEqual(
      mountainLayout(TILE, MAX_H, 8),
    );
  });

  it('has equal edge heights so tiles wrap seamlessly', () => {
    for (const seed of [1, 42, 999]) {
      const { profile } = mountainLayout(TILE, MAX_H, seed);
      expect(profile[0].x).toBe(0);
      expect(profile[profile.length - 1].x).toBe(TILE);
      expect(profile[0].y).toBeCloseTo(profile[profile.length - 1].y, 10);
    }
  });

  it('keeps every point (profile and caps) inside the tile box', () => {
    for (const seed of [1, 42, 999]) {
      const { profile, caps } = mountainLayout(TILE, MAX_H, seed);
      profile.forEach(expectPtInBounds);
      caps.flat().forEach(expectPtInBounds);
    }
  });
});

describe('cityLayout', () => {
  it('is deterministic for a seed', () => {
    expect(cityLayout(TILE, MAX_H, 7)).toEqual(cityLayout(TILE, MAX_H, 7));
  });

  it('keeps buildings and windows inside the tile box', () => {
    for (const seed of [1, 42, 999]) {
      const { buildings, windowGroups } = cityLayout(TILE, MAX_H, seed);
      expect(buildings.length).toBeGreaterThan(0);
      buildings.forEach(expectRectInBounds);
      expect(windowGroups).toHaveLength(CITY_FLICKER_GROUPS);
      windowGroups.flat().forEach(expectRectInBounds);
    }
  });

  it('leaves both tile edges clear so copies butt seamlessly', () => {
    for (const seed of [1, 42, 999]) {
      const { buildings } = cityLayout(TILE, MAX_H, seed);
      const last = buildings[buildings.length - 1];
      expect(buildings[0].x).toBeGreaterThanOrEqual(0);
      expect(last.x + last.w).toBeLessThanOrEqual(TILE);
    }
  });

  it('puts every window inside its building slab', () => {
    const { buildings, windowGroups } = cityLayout(TILE, MAX_H, 42);
    for (const win of windowGroups.flat()) {
      const host = buildings.find(
        (b) =>
          win.x >= b.x &&
          win.x + win.w <= b.x + b.w &&
          win.y >= b.y &&
          win.y + win.h <= b.y + b.h,
      );
      expect(host).toBeDefined();
    }
  });
});

describe('crystalLayout', () => {
  it('is deterministic for a seed', () => {
    expect(crystalLayout(TILE, MAX_H, 7)).toEqual(crystalLayout(TILE, MAX_H, 7));
  });

  it('keeps shards and glints inside the tile box, rooted on the baseline', () => {
    for (const seed of [1, 42, 999]) {
      const { shards, glints } = crystalLayout(TILE, MAX_H, seed);
      expect(shards.length).toBeGreaterThan(0);
      shards.flat().forEach(expectPtInBounds);
      glints.flat().forEach(expectPtInBounds);
      for (const [left, , right] of shards) {
        expect(left.y).toBe(0);
        expect(right.y).toBe(0);
      }
    }
  });
});
