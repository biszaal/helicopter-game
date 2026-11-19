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

/**
 * How long a run takes to reach `meters`. Scroll speed depends only on
 * distance (rampAt), never on the player, so this is exact: the integral of
 * 1/speed over distance — logarithmic while the linear ramp climbs, then
 * constant at the cap. It lets the client send a real duration alongside a
 * saved best score, which never stored its own (leaderboard sync).
 */
export function runDurationMsForDistance(meters: number): number {
  const { start, perShu, cap } = config.difficulty.scrollSpeed;
  const shu = meters / config.scoring.metersPerShu;
  const rampEndShu = (cap - start) / perShu; // where speed reaches its cap
  const rampShu = Math.min(shu, rampEndShu);
  const rampSeconds = Math.log((start + perShu * rampShu) / start) / perShu;
  const capSeconds = Math.max(0, shu - rampEndShu) / cap;
  return (rampSeconds + capSeconds) * 1000;
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

/** Clamp a corridor centre so both spurs stay inside the playfield. */
function clampCentre(centre: number, gap: number): number {
  'worklet';
  const wall = config.world.wallThickness;
  const minCentre = wall + gap / 2;
  const maxCentre = 1 - wall - gap / 2;
  if (centre < minCentre) return minCentre;
  if (centre > maxCentre) return maxCentre;
  return centre;
}

/** Spur lengths for a corridor of `gap` centred at `centre`. */
export function spursFor(
  centre: number,
  gap: number,
): { topLen: number; botLen: number } {
  'worklet';
  return { topLen: centre - gap / 2, botLen: 1 - (centre + gap / 2) };
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
  const centre = clampCentre(
    0.5 + (rng() * 2 - 1) * config.pinch.centerJitter,
    gap,
  );
  return spursFor(centre, gap);
}

/**
 * Corridor centres for an S-curve pinch pair (zone "THE DEEP"): the first
 * is jittered like a single pinch, the second is pushed centerOffset toward
 * the other side of the tunnel. Both clamped inside the playfield.
 */
export function doublePinchCentres(
  distanceShu: number,
  rng: () => number,
): { gap: number; first: number; second: number } {
  'worklet';
  const gap = pinchGapAt(distanceShu);
  const first = clampCentre(
    0.5 + (rng() * 2 - 1) * config.pinch.centerJitter,
    gap,
  );
  const offset = config.behaviors.doublePinch.centerOffset;
  const second = clampCentre(
    first >= 0.5 ? first - offset : first + offset,
    gap,
  );
  return { gap, first, second };
}

/**
 * Where a pinch about to spawn must actually enter the world.
 *
 * Rocks and pinches both spawn at the right screen edge, and a rock never
 * knows a pinch is coming — so a rock spawned moments ago can already be
 * sitting inside the incoming pinch's rock-free margin, at any y, including
 * dead centre of the corridor. That is an unflyable seal.
 *
 * Rocks refuse to spawn inside an ACTIVE pinch's span, so the fix is
 * one-directional too: slide the pinch right until every rock in the world
 * clears its left margin. The pinch is off-screen at this point, so the
 * shift is invisible; rocks only ever exist to the LEFT of the farthest one,
 * so a single pass is enough.
 */
export function pinchEntryX(desiredX: number, rocks: OccupiedRect[]): number {
  'worklet';
  const margin = config.pinch.rockFreeMargin;
  let entry = desiredX;
  for (let i = 0; i < rocks.length; i++) {
    const needed = rocks[i].x2 + margin;
    if (needed > entry) entry = needed;
  }
  return entry;
}

/**
 * Pick a y for a rock wall's gap so the gap band clears every blocker near
 * the wall's x span. Returns null when nothing fits — the wall is skipped
 * (the tunnel is never sealed).
 */
export function placeWallGap(
  x1: number,
  x2: number,
  gapHalf: number,
  occupied: OccupiedRect[],
  rng: () => number,
): number | null {
  'worklet';
  const wall = config.world.wallThickness;
  const xWindow = config.obstacles.xClearWindow;
  const minY = wall + gapHalf;
  const maxY = 1 - wall - gapHalf;
  if (maxY <= minY) return null;

  const tries = config.behaviors.rockWall.placementTries;
  for (let attempt = 0; attempt < tries; attempt++) {
    const y = minY + rng() * (maxY - minY);
    let blocked = false;
    for (let i = 0; i < occupied.length; i++) {
      const o = occupied[i];
      if (
        o.x1 < x2 + xWindow &&
        o.x2 > x1 - xWindow &&
        o.y1 < y + gapHalf &&
        o.y2 > y - gapHalf
      ) {
        blocked = true;
        break;
      }
    }
    if (!blocked) return y;
  }
  return null;
}

/**
 * Tile the tunnel above and below a wall gap with rock segments. Segments
 * split each band evenly (≈ segmentHalfH each) and never enter the gap.
 * Called at spawn time — allocation is fine there.
 */
export function wallSegments(
  gapCenter: number,
  gapHalf: number,
  segmentHalfH: number,
): { centerY: number; halfH: number }[] {
  'worklet';
  const wall = config.world.wallThickness;
  const segments: { centerY: number; halfH: number }[] = [];
  const bandY1 = [wall, gapCenter + gapHalf];
  const bandY2 = [gapCenter - gapHalf, 1 - wall];
  for (let b = 0; b < 2; b++) {
    const height = bandY2[b] - bandY1[b];
    if (height <= 1e-6) continue;
    const count = Math.max(1, Math.ceil(height / (2 * segmentHalfH)));
    const halfH = height / (2 * count);
    for (let i = 0; i < count; i++) {
      segments.push({ centerY: bandY1[b] + (2 * i + 1) * halfH, halfH });
    }
  }
  return segments;
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
