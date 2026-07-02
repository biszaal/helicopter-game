/**
 * AABB helpers, all in shu. Pure worklets — usable from the UI-thread loop.
 */
export function rectsOverlap(
  ax: number,
  ay: number,
  aw: number,
  ah: number,
  bx: number,
  by: number,
  bw: number,
  bh: number,
): boolean {
  'worklet';
  return ax < bx + bw && ax + aw > bx && ay < by + bh && ay + ah > by;
}
