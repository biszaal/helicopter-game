import { config } from '../config';

/** An axis-aligned blocker already in the world (rock or pinch spur), shu. */
export interface OccupiedRect {
  x1: number;
  x2: number;
  y1: number;
  y2: number;
}

/** "Rocks get bigger over time": size multiplier at a given run time. */
export function sizeScaleAt(elapsedSeconds: number): number {
  'worklet';
  const scale = 1 + config.difficulty.sizeGrowthPerSecond * elapsedSeconds;
  return Math.min(scale, config.difficulty.sizeScaleMax);
}

/** "Pinches get narrower the further you go": corridor height at run time. */
export function pinchGapAt(elapsedSeconds: number): number {
  'worklet';
  const gap =
    config.pinch.gapStart - config.pinch.gapShrinkPerSecond * elapsedSeconds;
  return Math.max(gap, config.pinch.gapMin);
}

/**
 * Stalactite/stalagmite lengths for a pinch spawned at the given run time.
 * The corridor centre is jittered but clamped so both spurs stay inside the
 * playfield (a spur may degenerate to wall thickness — a mild pinch).
 */
export function pinchSpurs(
  elapsedSeconds: number,
  rng: () => number,
): { topLen: number; botLen: number } {
  'worklet';
  const gap = pinchGapAt(elapsedSeconds);
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
 * Returns null when no valid spot is found — the caller skips the spawn
 * rather than ever sealing the tunnel shut.
 */
export function placeRock(
  x1: number,
  x2: number,
  halfH: number,
  occupied: OccupiedRect[],
  rng: () => number,
): number | null {
  'worklet';
  const wall = config.world.wallThickness;
  const clearance = config.obstacles.minVerticalClearance;
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
