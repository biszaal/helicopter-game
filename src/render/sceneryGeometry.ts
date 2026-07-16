/**
 * Pure geometry for the per-zone scenery silhouettes (mountains, cityscape,
 * crystals). No Skia imports — everything here is plain data so it runs
 * under vitest; shapes.ts turns these layouts into SkPaths at mount.
 *
 * Conventions shared with makeRidgePath: one tile spans x ∈ [0, tileWidth],
 * the baseline sits at y = 0 and shapes extend to positive y (up to
 * maxHeight). Tiles are rendered hanging from the ceiling as-is, or rising
 * from the floor via the usual translateY(height) + scaleY(-1) mirror.
 * Profile height is equal (or zero) at both tile edges so copies butt
 * together seamlessly.
 */

export interface Pt {
  x: number;
  y: number;
}

export interface RectT {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Deterministic PRNG so silhouettes are identical on every mount/device. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface MountainLayout {
  /** Silhouette polyline from (0, edge) to (tileWidth, edge); the path
   * builder closes it along the baseline. */
  profile: Pt[];
  /** One triangle (3 points) per tall peak — the lighter "snow cap". */
  caps: Pt[][];
}

/**
 * A handful of tall, sharp peaks — fewer and steeper than the soft ridges,
 * so the layer reads as a distant mountain range rather than more cave.
 */
export function mountainLayout(
  tileWidth: number,
  maxHeight: number,
  seed: number,
): MountainLayout {
  const rng = mulberry32(seed);
  const edgeHeight = maxHeight * 0.28;
  const peaks = 3 + Math.floor(rng() * 2);
  const profile: Pt[] = [{ x: 0, y: edgeHeight }];
  const caps: Pt[][] = [];
  for (let i = 0; i < peaks; i++) {
    const slot = tileWidth / peaks;
    const valleyX = (i + 0.12 + rng() * 0.14) * slot;
    const peakX = (i + 0.4 + rng() * 0.25) * slot;
    const valleyY = maxHeight * (0.16 + rng() * 0.18);
    const peakY = maxHeight * (0.72 + rng() * 0.28);
    profile.push({ x: valleyX, y: valleyY });
    profile.push({ x: peakX, y: peakY });
    if (peakY >= maxHeight * 0.8) {
      // Snow cap: the peak tip plus two points partway down each slope.
      const capT = 0.3;
      const next: Pt =
        i === peaks - 1
          ? { x: tileWidth, y: edgeHeight }
          : { x: (i + 1.15) * slot, y: maxHeight * 0.25 };
      caps.push([
        { x: peakX, y: peakY },
        {
          x: peakX + (valleyX - peakX) * capT,
          y: peakY + (valleyY - peakY) * capT,
        },
        { x: peakX + (next.x - peakX) * capT, y: peakY + (next.y - peakY) * capT },
      ]);
    }
  }
  profile.push({ x: tileWidth, y: edgeHeight });
  return { profile, caps };
}

export interface CityLayout {
  /** Flat-topped building rectangles standing on the baseline. */
  buildings: RectT[];
  /** Lit windows, batched into a few flicker groups (one Skia path per
   * group — never one node per window). */
  windowGroups: RectT[][];
}

export const CITY_FLICKER_GROUPS = 3;

/**
 * A dark downtown block: building slabs of varying width/height with a
 * scatter of lit windows. Both tile edges are empty so tiles wrap cleanly.
 */
export function cityLayout(
  tileWidth: number,
  maxHeight: number,
  seed: number,
): CityLayout {
  const rng = mulberry32(seed);
  const buildings: RectT[] = [];
  const windowGroups: RectT[][] = Array.from(
    { length: CITY_FLICKER_GROUPS },
    () => [],
  );
  const win = maxHeight * 0.032;
  let x = maxHeight * 0.04 * rng();
  while (true) {
    const w = maxHeight * (0.28 + rng() * 0.34);
    if (x + w > tileWidth) break;
    const h = maxHeight * (0.42 + rng() * 0.58);
    buildings.push({ x, y: 0, w, h });
    // Window grid inside the slab, margin all around; ~1/3 of cells are lit.
    const margin = Math.min(w, h) * 0.16;
    const cols = Math.floor((w - 2 * margin) / (win * 2.2));
    const rows = Math.floor((h - 2 * margin) / (win * 2.6));
    for (let c = 0; c < cols; c++) {
      for (let r = 0; r < rows; r++) {
        if (rng() > 0.34) continue;
        const group = Math.floor(rng() * CITY_FLICKER_GROUPS);
        windowGroups[group].push({
          x: x + margin + c * win * 2.2,
          y: margin + r * win * 2.6,
          w: win,
          h: win * 1.35,
        });
      }
    }
    x += w + maxHeight * (0.03 + rng() * 0.09);
  }
  return { buildings, windowGroups };
}

export interface CrystalLayout {
  /** Sharp shard triangles (3 points each) growing off the baseline. */
  shards: Pt[][];
  /** Small bright triangles at some shard tips. */
  glints: Pt[][];
}

/** Clusters of jagged crystal shards for THE DEEP. */
export function crystalLayout(
  tileWidth: number,
  maxHeight: number,
  seed: number,
): CrystalLayout {
  const rng = mulberry32(seed);
  const shards: Pt[][] = [];
  const glints: Pt[][] = [];
  const clusters = 2 + Math.floor(rng() * 2);
  for (let c = 0; c < clusters; c++) {
    const slot = tileWidth / clusters;
    const centerX = (c + 0.3 + rng() * 0.4) * slot;
    const count = 3 + Math.floor(rng() * 3);
    for (let s = 0; s < count; s++) {
      const halfW = maxHeight * (0.045 + rng() * 0.055);
      const h = maxHeight * (s === Math.floor(count / 2) ? 0.6 + rng() * 0.4 : 0.25 + rng() * 0.4);
      const baseX = Math.min(
        Math.max(centerX + (rng() - 0.5) * slot * 0.5, halfW * 1.6),
        tileWidth - halfW * 1.6,
      );
      const tip: Pt = { x: baseX + (rng() - 0.5) * halfW, y: h };
      const left: Pt = { x: baseX - halfW, y: 0 };
      const right: Pt = { x: baseX + halfW, y: 0 };
      shards.push([left, tip, right]);
      if (rng() < 0.5) {
        // Glint: the top quarter of the shard, drawn in a brighter color.
        const t = 0.75;
        glints.push([
          { x: left.x + (tip.x - left.x) * t, y: left.y + (tip.y - left.y) * t },
          tip,
          { x: right.x + (tip.x - right.x) * t, y: right.y + (tip.y - right.y) * t },
        ]);
      }
    }
  }
  return { shards, glints };
}
