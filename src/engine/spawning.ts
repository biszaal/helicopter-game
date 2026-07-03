import { config } from '../config';

/** An axis-aligned blocker already in the world (rock or pinch spur), shu. */
export interface OccupiedRect {
  x1: number;
  x2: number;
  y1: number;
  y2: number;
}

/** A linear-with-cap difficulty dial: value = start + perShu·distance,
 * clamped at cap. perShu may be negative — then cap is a floor. */
export interface Ramp {
  start: number;
  perShu: number;
  cap: number;
}

/** Dial value after d shu of scroll — every difficulty curve in the game. */
export function rampAt(d: number, ramp: Ramp): number {
  'worklet';
  const v = ramp.start + ramp.perShu * d;
  return ramp.perShu >= 0 ? Math.min(v, ramp.cap) : Math.max(v, ramp.cap);
}

/** Which zone (index into config.zones) a run at this distance is in. */
export function zoneIndexAt(distanceShu: number): number {
  'worklet';
  const meters = distanceShu * config.scoring.metersPerShu;
  let index = 0;
  for (let i = 1; i < config.zones.length; i++) {
    if (meters >= config.zones[i].atMeters) index = i;
  }
  return index;
}

/** "Rocks get bigger the deeper you go": size multiplier at a run distance. */
export function sizeScaleAt(distanceShu: number): number {
  'worklet';
  return rampAt(distanceShu, config.difficulty.sizeScale);
}

/** "Pinches get narrower the further you go": corridor height at a distance. */
export function pinchGapAt(distanceShu: number): number {
  'worklet';
  return rampAt(distanceShu, config.difficulty.pinchGap);
}

/**
 * Stalactite/stalagmite lengths for a pinch spawned at the given run
 * distance. The corridor centre is jittered but clamped so both spurs stay
 * inside the playfield (a spur may degenerate to wall thickness — a mild
 * pinch).
 */
export function pinchSpurs(
  distanceShu: number,
  rng: () => number,
): { topLen: number; botLen: number } {
  'worklet';
  const gap = pinchGapAt(distanceShu);
  const wall = config.world.wallThickness;
  const minCentre = wall + gap / 2;
  const maxCentre = 1 - wall - gap / 2;
  let centre = 0.5 + (rng() * 2 - 1) * config.pinch.centerJitter;
  if (centre < minCentre) centre = minCentre;
  if (centre > maxCentre) centre = maxCentre;
  return { topLen: centre - gap / 2, botLen: 1 - (centre + gap / 2) };
}

/**
 * Find a centre-y for a rock spanning [x1, x2] such that a vertical corridor
 * of at least minVerticalClearance survives through everything nearby.
 *
 * Blockers whose x-range comes within xClearWindow of the candidate count as
 * the same "wall". The candidate is validated by merging all blocked
 * y-intervals (walls included) and checking the widest remaining free gap.
 *
 * The clearance is passed in by the caller because it ramps with distance.
 *
 * Returns null when no valid spot is found — the caller skips the spawn
 * rather than ever sealing the tunnel shut.
 */
export function placeRock(
  x1: number,
  x2: number,
  halfH: number,
  occupied: OccupiedRect[],
  rng: () => number,
  clearance: number,
): number | null {
  'worklet';
  const wall = config.world.wallThickness;
  const xWindow = config.obstacles.xClearWindow;

  const minY = wall + halfH;
  const maxY = 1 - wall - halfH;
  if (maxY <= minY) return null;

  // Blockers relevant to this x span (walls always are).
  const starts: number[] = [0];
  const ends: number[] = [wall];
  for (let i = 0; i < occupied.length; i++) {
    const o = occupied[i];
    if (o.x1 < x2 + xWindow && o.x2 > x1 - xWindow) {
      starts.push(o.y1);
      ends.push(o.y2);
    }
  }
  starts.push(1 - wall);
  ends.push(1);

  for (let attempt = 0; attempt < config.obstacles.placementTries; attempt++) {
    const y = minY + rng() * (maxY - minY);

    // Merge all blocked intervals including the candidate, then measure the
    // widest free gap left inside [0, 1].
    const bStarts: number[] = starts.slice();
    const bEnds: number[] = ends.slice();
    bStarts.push(y - halfH);
    bEnds.push(y + halfH);

    // insertion sort by interval start (tiny N, worklet-friendly)
    for (let i = 1; i < bStarts.length; i++) {
      const s = bStarts[i];
      const e = bEnds[i];
      let j = i - 1;
      while (j >= 0 && bStarts[j] > s) {
        bStarts[j + 1] = bStarts[j];
        bEnds[j + 1] = bEnds[j];
        j--;
      }
      bStarts[j + 1] = s;
      bEnds[j + 1] = e;
    }

    let widestGap = 0;
    let coveredTo = bEnds[0];
    for (let i = 1; i < bStarts.length; i++) {
      if (bStarts[i] > coveredTo) {
        const gap = bStarts[i] - coveredTo;
        if (gap > widestGap) widestGap = gap;
      }
      if (bEnds[i] > coveredTo) coveredTo = bEnds[i];
    }

    if (widestGap >= clearance) return y;
  }
  return null;
}
