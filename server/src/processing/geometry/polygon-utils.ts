export type Vec2 = [number, number];
export type SimplePolygon = Vec2[];
/** Axis-aligned bounding box used by poissonDiskSample and spatial queries. */
export interface Bounds2 { minX: number; minY: number; maxX: number; maxY: number; }

/**
 * Even-odd point-in-region test across multiple contours. Passing an outer
 * contour plus hole contours together yields true only inside the solid region
 * (a point inside a hole flips parity twice → outside).
 */
export function pointInPolygons(pt: Vec2, polygons: SimplePolygon[]): boolean {
  const [x, y] = pt;
  let inside = false;
  for (const poly of polygons) {
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const [xi, yi] = poly[i];
      const [xj, yj] = poly[j];
      const crosses = (yi > y) !== (yj > y) &&
        x < ((xj - xi) * (y - yi)) / (yj - yi) + xi;
      if (crosses) inside = !inside;
    }
  }
  return inside;
}

export type Rng = () => number;

/** Mulberry32 — small seedable PRNG so sampling is deterministic in tests. */
export function makeRng(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Bridson Poisson-disk sampling restricted to a polygon region (outer minus
 * holes). Returns points no two closer than `spacing`, evenly covering the
 * region. Works for both solid areas and thin ribbons. `bounds` is the sampling
 * rectangle (typically the region's bounds). `rng` defaults to Math.random.
 * @param k Candidate attempts per active point (Bridson). Default 30; values
 *   below ~15 risk coverage gaps.
 */
export function poissonDiskSample(
  polygons: SimplePolygon[],
  spacing: number,
  bounds: Bounds2,
  rng: Rng = Math.random,
  k = 30,
): Vec2[] {
  const r = spacing;
  const cell = r / Math.SQRT2;
  const W = bounds.maxX - bounds.minX;
  const H = bounds.maxY - bounds.minY;
  if (W <= 0 || H <= 0) return [];
  const gw = Math.max(1, Math.ceil(W / cell));
  const gh = Math.max(1, Math.ceil(H / cell));
  const grid: (Vec2 | null)[] = new Array(gw * gh).fill(null);
  const gxy = (p: Vec2) => ({
    gx: Math.min(gw - 1, Math.max(0, Math.floor((p[0] - bounds.minX) / cell))),
    gy: Math.min(gh - 1, Math.max(0, Math.floor((p[1] - bounds.minY) / cell))),
  });
  const fits = (p: Vec2): boolean => {
    if (p[0] < bounds.minX || p[0] > bounds.maxX || p[1] < bounds.minY || p[1] > bounds.maxY) return false;
    if (!pointInPolygons(p, polygons)) return false;
    const { gx, gy } = gxy(p);
    for (let yy = Math.max(0, gy - 2); yy <= Math.min(gh - 1, gy + 2); yy++) {
      for (let xx = Math.max(0, gx - 2); xx <= Math.min(gw - 1, gx + 2); xx++) {
        const q = grid[yy * gw + xx];
        if (q) {
          const dx = q[0] - p[0], dy = q[1] - p[1];
          if (dx * dx + dy * dy < r * r) return false;
        }
      }
    }
    return true;
  };
  // Each background-grid cell holds at most one point (Bridson invariant; fits()
  // guarantees no two accepted points share a cell), so a plain assignment is safe.
  const place = (p: Vec2) => { const { gx, gy } = gxy(p); grid[gy * gw + gx] = p; };

  const samples: Vec2[] = [];
  const active: Vec2[] = [];

  // Multi-seed on a coarse spacing-grid so every solid area gets coverage.
  for (let y = bounds.minY; y <= bounds.maxY; y += r)
    for (let x = bounds.minX; x <= bounds.maxX; x += r) {
      const p: Vec2 = [x, y];
      if (fits(p)) { samples.push(p); active.push(p); place(p); }
    }
  // Thin ribbons can fall between the coarse seeds; ensure at least one seed.
  if (samples.length === 0) {
    outer:
    for (let y = bounds.minY; y <= bounds.maxY; y += cell)
      for (let x = bounds.minX; x <= bounds.maxX; x += cell) {
        const p: Vec2 = [x, y];
        if (fits(p)) { samples.push(p); active.push(p); place(p); break outer; }
      }
  }
  if (samples.length === 0) return [];

  while (active.length > 0) {
    const idx = Math.floor(rng() * active.length);
    const origin = active[idx];
    let found = false;
    for (let n = 0; n < k; n++) {
      const ang = rng() * 2 * Math.PI;
      const rad = r * (1 + rng()); // r..2r
      const cand: Vec2 = [origin[0] + Math.cos(ang) * rad, origin[1] + Math.sin(ang) * rad];
      if (fits(cand)) { samples.push(cand); active.push(cand); place(cand); found = true; break; }
    }
    if (!found) { active[idx] = active[active.length - 1]; active.pop(); }
  }
  return samples;
}

/**
 * Walk each (closed) contour and emit a point every `spacing` mm of arc length.
 * Follows thin/curved ribbons along their length, which radial Poisson darts miss.
 */
export function sampleContoursByArcLength(polygons: SimplePolygon[], spacing: number): Vec2[] {
  const out: Vec2[] = [];
  for (const poly of polygons) {
    if (poly.length < 2) continue;
    out.push([poly[0][0], poly[0][1]]);
    let prev: Vec2 = poly[0];
    let acc = 0;
    for (let i = 1; i <= poly.length; i++) {
      const cur = poly[i % poly.length];
      let segLen = Math.hypot(cur[0] - prev[0], cur[1] - prev[1]);
      while (acc + segLen >= spacing && segLen > 1e-9) {
        const t = (spacing - acc) / segLen;
        const np: Vec2 = [prev[0] + (cur[0] - prev[0]) * t, prev[1] + (cur[1] - prev[1]) * t];
        out.push(np);
        prev = np;
        segLen = Math.hypot(cur[0] - prev[0], cur[1] - prev[1]);
        acc = 0;
      }
      acc += segLen;
      prev = cur;
    }
  }
  return out;
}

/**
 * Greedily keep points so no two kept points are closer than `spacing`. Keeps
 * earlier points in the input over later ones (so pass higher-priority points
 * first). Grid-accelerated.
 */
export function mergeWithMinSpacing(points: Vec2[], spacing: number, bounds: Bounds2): Vec2[] {
  const r = spacing;
  const cell = r / Math.SQRT2;
  const W = bounds.maxX - bounds.minX, H = bounds.maxY - bounds.minY;
  if (W <= 0 || H <= 0 || points.length === 0) return points.slice();
  const gw = Math.max(1, Math.ceil(W / cell));
  const gh = Math.max(1, Math.ceil(H / cell));
  const grid: (Vec2 | null)[] = new Array(gw * gh).fill(null);
  const gxy = (p: Vec2) => ({
    gx: Math.min(gw - 1, Math.max(0, Math.floor((p[0] - bounds.minX) / cell))),
    gy: Math.min(gh - 1, Math.max(0, Math.floor((p[1] - bounds.minY) / cell))),
  });
  const kept: Vec2[] = [];
  for (const p of points) {
    const { gx, gy } = gxy(p);
    let ok = true;
    for (let yy = Math.max(0, gy - 2); yy <= Math.min(gh - 1, gy + 2) && ok; yy++)
      for (let xx = Math.max(0, gx - 2); xx <= Math.min(gw - 1, gx + 2) && ok; xx++) {
        const q = grid[yy * gw + xx];
        if (q) {
          const dx = q[0] - p[0], dy = q[1] - p[1];
          if (dx * dx + dy * dy < r * r) ok = false;
        }
      }
    if (ok) { kept.push(p); grid[gy * gw + gx] = p; }
  }
  return kept;
}

/**
 * Even coverage of a polygon region for BOTH solid blobs and thin curved ribbons:
 * Poisson-disk interior fill plus arc-length contour sampling, merged under the
 * min-spacing rule (Poisson points kept first).
 */
export function coverRegion(polygons: SimplePolygon[], spacing: number, bounds: Bounds2, rng: Rng = Math.random): Vec2[] {
  const poisson = poissonDiskSample(polygons, spacing, bounds, rng);
  const boundary = sampleContoursByArcLength(polygons, spacing);
  // Merge with a looser threshold than `spacing`: along a CURVED seam, points
  // spaced `spacing` apart by ARC have a chord slightly under `spacing`, so a
  // strict Euclidean cull would wrongly delete them and over-thin curved seams.
  // 0.85·spacing keeps along-arc neighbours while still collapsing the two
  // opposite sides of a thin ribbon (which sit ~ribbon-width apart, much closer).
  return mergeWithMinSpacing([...poisson, ...boundary], spacing * 0.85, bounds);
}
