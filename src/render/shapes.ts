import { Skia, type SkPath } from '@shopify/react-native-skia';
import {
  cityLayout,
  crystalLayout,
  mountainLayout,
  mulberry32,
  type Pt,
} from './sceneryGeometry';

/**
 * Procedural path factories for every visual in the game. All functions are
 * pure and deterministic (seeded PRNG) and are called once at mount — no
 * paths are ever built while the game runs. Scenery layouts live in
 * sceneryGeometry.ts (Skia-free, unit-tested); this file only converts
 * them to SkPaths.
 */

export { mulberry32 };

export const ROCK_VARIANTS = 6;

/**
 * Irregular rock outlines drawn in a unit box (0..1 × 0..1). The outline is
 * inscribed in the box — never larger than the hitbox rect it is fitted to,
 * so with the helicopter's own hitbox margin every death reads fair.
 */
export function makeRockPaths(): SkPath[] {
  const paths: SkPath[] = [];
  for (let v = 0; v < ROCK_VARIANTS; v++) {
    const rng = mulberry32(1000 + v * 7919);
    const p = Skia.Path.Make();
    const sides = 8 + Math.floor(rng() * 4);
    for (let i = 0; i < sides; i++) {
      const angle =
        (i / sides) * Math.PI * 2 + (rng() - 0.5) * (Math.PI / sides);
      const radius = 0.34 + rng() * 0.16; // ≤ 0.5: stays inside the box
      const x = 0.5 + Math.cos(angle) * radius;
      const y = 0.5 + Math.sin(angle) * radius;
      if (i === 0) p.moveTo(x, y);
      else p.lineTo(x, y);
    }
    p.close();
    paths.push(p);
  }
  return paths;
}

/**
 * One repeating tile of jagged teeth hanging off a wall/pinch shelf.
 * Spans x ∈ [0, tileWidth], baseline at y = 0, tips reaching +depth.
 * Start and end sit on the baseline so tiles butt together seamlessly.
 */
export function makeToothEdgePath(
  tileWidth: number,
  depth: number,
  seed: number,
): SkPath {
  const rng = mulberry32(seed);
  const p = Skia.Path.Make();
  p.moveTo(0, 0);
  let x = 0;
  while (x < tileWidth) {
    const toothW = depth * (1.4 + rng() * 1.6);
    const tipX = Math.min(x + toothW * 0.55, tileWidth);
    p.lineTo(tipX, depth * (0.5 + rng() * 0.5));
    x = Math.min(tipX + toothW * 0.45, tileWidth);
    p.lineTo(x, depth * rng() * 0.12);
  }
  p.lineTo(tileWidth, 0);
  p.close();
  return p;
}

/**
 * One repeating tile of a distant ridge silhouette hanging from y = 0 down
 * to peaks of maxHeight. Both ends share the same height so tiles wrap
 * seamlessly. Mirror with a scaleY(-1) group for the floor-side ridge.
 */
export function makeRidgePath(
  tileWidth: number,
  maxHeight: number,
  seed: number,
): SkPath {
  const rng = mulberry32(seed);
  const p = Skia.Path.Make();
  const edgeHeight = maxHeight * 0.4;
  const segments = 7 + Math.floor(rng() * 3);
  p.moveTo(0, 0);
  p.lineTo(0, edgeHeight);
  for (let i = 1; i < segments; i++) {
    const x = (i / segments) * tileWidth + (rng() - 0.5) * (tileWidth * 0.06);
    const y = maxHeight * (0.35 + rng() * 0.65);
    p.lineTo(x, y);
  }
  p.lineTo(tileWidth, edgeHeight);
  p.lineTo(tileWidth, 0);
  p.close();
  return p;
}

/** Closed polygon from a point list. */
function polygonPath(points: Pt[], into?: SkPath): SkPath {
  const p = into ?? Skia.Path.Make();
  points.forEach((pt, i) => (i === 0 ? p.moveTo(pt.x, pt.y) : p.lineTo(pt.x, pt.y)));
  p.close();
  return p;
}

/**
 * One repeating tile of a mountain-range silhouette hanging from y = 0
 * (same contract as makeRidgePath — mirror with scaleY(-1) for the floor).
 * `caps` holds the lighter snow-cap triangles, drawn over the silhouette.
 */
export function makeMountainPaths(
  tileWidth: number,
  maxHeight: number,
  seed: number,
): { silhouette: SkPath; caps: SkPath } {
  const layout = mountainLayout(tileWidth, maxHeight, seed);
  const silhouette = Skia.Path.Make();
  silhouette.moveTo(0, 0);
  for (const pt of layout.profile) silhouette.lineTo(pt.x, pt.y);
  silhouette.lineTo(tileWidth, 0);
  silhouette.close();
  const caps = Skia.Path.Make();
  for (const cap of layout.caps) polygonPath(cap, caps);
  return { silhouette, caps };
}

/**
 * One repeating tile of a dark city block hanging from y = 0. Lit windows
 * are batched into one path per flicker group so the whole skyline costs a
 * handful of Skia nodes regardless of window count.
 */
export function makeCityscapePaths(
  tileWidth: number,
  maxHeight: number,
  seed: number,
): { silhouette: SkPath; windowGroups: SkPath[] } {
  const layout = cityLayout(tileWidth, maxHeight, seed);
  const silhouette = Skia.Path.Make();
  for (const b of layout.buildings) {
    silhouette.addRect(Skia.XYWHRect(b.x, b.y, b.w, b.h));
  }
  const windowGroups = layout.windowGroups.map((group) => {
    const p = Skia.Path.Make();
    for (const w of group) p.addRect(Skia.XYWHRect(w.x, w.y, w.w, w.h));
    return p;
  });
  return { silhouette, windowGroups };
}

/**
 * One repeating tile of crystal shard clusters growing off y = 0, with a
 * brighter glint path over the tallest tips.
 */
export function makeCrystalPaths(
  tileWidth: number,
  maxHeight: number,
  seed: number,
): { shards: SkPath; glints: SkPath } {
  const layout = crystalLayout(tileWidth, maxHeight, seed);
  const shards = Skia.Path.Make();
  for (const shard of layout.shards) polygonPath(shard, shards);
  const glints = Skia.Path.Make();
  for (const glint of layout.glints) polygonPath(glint, glints);
  return { shards, glints };
}

export interface HelicopterPaths {
  /** Fuselage + tail boom + tail fin, one filled silhouette. */
  body: SkPath;
  /** Cockpit glass — drawn with a warm glow. */
  canopy: SkPath;
  /** Landing skids — stroked, not filled. */
  skids: SkPath;
  /** Rotor mast connecting cabin to the main rotor. */
  mast: SkPath;
  /** Main rotor blade, centred on the origin (animated via scaleX). */
  rotorBlade: SkPath;
  /** Faint full-sweep rotor disc under the blade (motion blur feel). */
  rotorDisc: SkPath;
  /** Tail rotor blade, centred on the origin (animated via rotate). */
  tailRotorBlade: SkPath;
  /** Forward searchlight cone (filled with a fading gradient). */
  searchlight: SkPath;
  /** Where the rotor hub sits, in the body's local space. */
  rotorHub: { x: number; y: number };
  /** Where the tail rotor spins, in the body's local space. */
  tailHub: { x: number; y: number };
  /** Nav light position (tail fin tip). */
  navLight: { x: number; y: number };
}

/**
 * Side-view helicopter facing right, built in pixel space centred on the
 * sprite centre. w/h are the sprite's pixel dimensions; the rotor extends
 * above the sprite box (visual only — bigger than the hitbox is fair).
 */
export function makeHelicopterPaths(w: number, h: number): HelicopterPaths {
  const body = Skia.Path.Make();
  // Fuselage: nose at +x, cabin, tapering boom to -x.
  body.moveTo(0.5 * w, -0.05 * h);
  body.quadTo(0.42 * w, -0.42 * h, 0.1 * w, -0.48 * h);
  body.quadTo(-0.02 * w, -0.5 * h, -0.08 * w, -0.3 * h);
  body.lineTo(-0.42 * w, -0.2 * h);
  body.lineTo(-0.42 * w, 0.02 * h);
  body.lineTo(-0.08 * w, 0.12 * h);
  body.quadTo(0.05 * w, 0.48 * h, 0.3 * w, 0.4 * h);
  body.quadTo(0.48 * w, 0.28 * h, 0.5 * w, -0.05 * h);
  body.close();
  // Tail fin, a second contour of the same silhouette.
  body.moveTo(-0.42 * w, -0.18 * h);
  body.lineTo(-0.48 * w, -0.62 * h);
  body.lineTo(-0.38 * w, -0.56 * h);
  body.lineTo(-0.34 * w, -0.18 * h);
  body.close();

  const canopy = Skia.Path.Make();
  canopy.addOval(Skia.XYWHRect(0.14 * w, -0.4 * h, 0.3 * w, 0.44 * h));

  const skids = Skia.Path.Make();
  skids.moveTo(-0.12 * w, 0.68 * h);
  skids.lineTo(0.38 * w, 0.68 * h);
  skids.moveTo(0.0 * w, 0.36 * h);
  skids.lineTo(0.02 * w, 0.68 * h);
  skids.moveTo(0.26 * w, 0.32 * h);
  skids.lineTo(0.29 * w, 0.68 * h);

  const mast = Skia.Path.Make();
  mast.addRect(Skia.XYWHRect(0.05 * w, -0.72 * h, 0.03 * w, 0.26 * h));

  const rotorHub = { x: 0.065 * w, y: -0.74 * h };
  const bladeThickness = Math.max(2, 0.07 * h);
  const rotorBlade = Skia.Path.Make();
  rotorBlade.addRect(
    Skia.XYWHRect(-0.56 * w, -bladeThickness / 2, 1.12 * w, bladeThickness),
  );
  const rotorDisc = Skia.Path.Make();
  rotorDisc.addOval(
    Skia.XYWHRect(-0.56 * w, -bladeThickness, 1.12 * w, 2 * bladeThickness),
  );

  const tailHub = { x: -0.44 * w, y: -0.38 * h };
  const tailRotorBlade = Skia.Path.Make();
  tailRotorBlade.addRect(
    Skia.XYWHRect(-0.02 * w, -0.28 * h, 0.04 * w, 0.56 * h),
  );

  const navLight = { x: -0.47 * w, y: -0.62 * h };

  const searchlight = Skia.Path.Make();
  searchlight.moveTo(0.42 * w, -0.08 * h);
  searchlight.lineTo(2.9 * w, -1.6 * h);
  searchlight.lineTo(2.9 * w, 1.5 * h);
  searchlight.lineTo(0.42 * w, 0.16 * h);
  searchlight.close();

  return {
    body,
    canopy,
    skids,
    mast,
    rotorBlade,
    rotorDisc,
    tailRotorBlade,
    searchlight,
    rotorHub,
    tailHub,
    navLight,
  };
}
