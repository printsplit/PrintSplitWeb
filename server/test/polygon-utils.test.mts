import assert from 'node:assert/strict';
import { pointInPolygons, poissonDiskSample, coverRegion, sampleContoursByArcLength, mergeWithMinSpacing, makeRng, type SimplePolygon } from '../src/processing/geometry/polygon-utils';

let passed = 0;
let failed = 0;
function test(name: string, fn: () => void) {
  try { fn(); passed++; console.log('ok  -', name); }
  catch (e) { failed++; console.error('FAIL -', name); console.error(e); }
}

// A 10x10 square with a 4x4 square hole in the middle (a ring).
const ring: SimplePolygon[] = [
  [[0, 0], [10, 0], [10, 10], [0, 10]],   // outer
  [[3, 3], [7, 3], [7, 7], [3, 7]],        // hole
];

test('point in the solid ring is inside', () => {
  assert.equal(pointInPolygons([1, 1], ring), true);
});
test('point in the hole is outside', () => {
  assert.equal(pointInPolygons([5, 5], ring), false);
});
test('point outside the outer boundary is outside', () => {
  assert.equal(pointInPolygons([20, 20], ring), false);
});
test('point with no polygons is outside', () => {
  assert.equal(pointInPolygons([5, 5], []), false);
});

function minPairDist(pts: [number, number][]): number {
  let m = Infinity;
  for (let i = 0; i < pts.length; i++)
    for (let j = i + 1; j < pts.length; j++) {
      const dx = pts[i][0] - pts[j][0], dy = pts[i][1] - pts[j][1];
      m = Math.min(m, Math.hypot(dx, dy));
    }
  return m;
}

const square: SimplePolygon[] = [[[0, 0], [100, 0], [100, 100], [0, 100]]];
const thin: SimplePolygon[] = [[[0, 0], [100, 0], [100, 2], [0, 2]]];

test('fills a solid square with min-spacing honored', () => {
  const pts = poissonDiskSample(square, 10, { minX: 0, minY: 0, maxX: 100, maxY: 100 }, makeRng(1));
  assert.ok(pts.length > 30, `expected many points, got ${pts.length}`);
  assert.ok(minPairDist(pts) >= 10 - 1e-6, `min spacing violated: ${minPairDist(pts)}`);
  assert.ok(pts.every(p => pointInPolygons(p, square)), 'all points inside');
});

test('strings points along a thin ribbon across its full length', () => {
  const pts = poissonDiskSample(thin, 5, { minX: 0, minY: 0, maxX: 100, maxY: 2 }, makeRng(1));
  assert.ok(pts.length >= 8, `expected a line of points, got ${pts.length}`);
  const xs = pts.map(p => p[0]);
  assert.ok(Math.max(...xs) - Math.min(...xs) > 80, 'points span the ribbon length');
  assert.ok(minPairDist(pts) >= 5 - 1e-6, `spacing violated in ribbon: ${minPairDist(pts)}`);
  assert.ok(pts.every(p => pointInPolygons(p, thin)), 'all points inside');
});

test('returns empty for a zero-area sampling region', () => {
  const pts = poissonDiskSample(square, 10, { minX: 0, minY: 0, maxX: 0, maxY: 0 }, makeRng(1));
  assert.equal(pts.length, 0);
});

test('is deterministic for a fixed seed', () => {
  const a = poissonDiskSample(square, 12, { minX: 0, minY: 0, maxX: 100, maxY: 100 }, makeRng(42));
  const b = poissonDiskSample(square, 12, { minX: 0, minY: 0, maxX: 100, maxY: 100 }, makeRng(42));
  assert.deepEqual(a, b);
});

test('coverRegion strings many points along a thin ribbon (poisson alone cannot)', () => {
  const pts = coverRegion(thin, 14, { minX: 0, minY: 0, maxX: 100, maxY: 2 }, makeRng(1));
  assert.ok(pts.length >= 6, `expected >=6 along 100mm ribbon at S=14, got ${pts.length}`);
  const xs = pts.map(p => p[0]);
  assert.ok(Math.max(...xs) - Math.min(...xs) > 80, 'covers the ribbon length');
  assert.ok(minPairDist(pts) >= 14 - 1e-6, `min spacing violated: ${minPairDist(pts)}`);
});

test('coverRegion fills a solid square and honors spacing', () => {
  const pts = coverRegion(square, 14, { minX: 0, minY: 0, maxX: 100, maxY: 100 }, makeRng(1));
  assert.ok(pts.length > 20, `expected many, got ${pts.length}`);
  assert.ok(minPairDist(pts) >= 14 - 1e-6, `min spacing violated: ${minPairDist(pts)}`);
});

test('coverRegion is deterministic for a fixed seed', () => {
  const a = coverRegion(thin, 14, { minX: 0, minY: 0, maxX: 100, maxY: 2 }, makeRng(7));
  const b = coverRegion(thin, 14, { minX: 0, minY: 0, maxX: 100, maxY: 2 }, makeRng(7));
  assert.deepEqual(a, b);
});

test('sampleContoursByArcLength spaces points along a square perimeter', () => {
  const pts = sampleContoursByArcLength(square, 25);
  assert.ok(pts.length >= 12, `expected ~16 around a 400mm perimeter at 25, got ${pts.length}`);
});

// A half-annulus ribbon (curved): outer radius 50, inner 46 → ~4mm wide,
// centerline radius 48 → centerline arc length ≈ π·48 ≈ 150mm.
function halfAnnulus(R: number, r: number, n: number): SimplePolygon {
  const pts: [number, number][] = [];
  for (let i = 0; i <= n; i++) { const a = (Math.PI * i) / n; pts.push([R * Math.cos(a), R * Math.sin(a)]); }
  for (let i = n; i >= 0; i--) { const a = (Math.PI * i) / n; pts.push([r * Math.cos(a), r * Math.sin(a)]); }
  return pts;
}

test('coverRegion populates a CURVED thin ribbon along its full arc (not over-culled)', () => {
  const curved: SimplePolygon[] = [halfAnnulus(50, 46, 60)];
  const pts = coverRegion(curved, 14, { minX: -50, minY: 0, maxX: 50, maxY: 50 }, makeRng(1));
  // centerline arc ≈ 150mm at spacing 14 → expect ~10 points. A strict euclidean
  // merge over-culls the curve to 8; the loosened (0.85·spacing) merge recovers ~10.
  assert.ok(pts.length >= 9, `curved ribbon should get ~10 points along the arc, got ${pts.length}`);
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
