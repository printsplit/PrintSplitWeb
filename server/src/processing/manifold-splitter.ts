import * as fs from 'fs/promises';
import * as path from 'path';
import { ProcessingOptions, ProcessingResult } from './processing-service';

// Dynamic import types
type ManifoldToplevel = {
  Manifold: any;
  Mesh: any;
  setup: () => void;
};

export interface STLMesh {
  vertices: Float32Array;
  triangles: Uint32Array;
  bounds: {
    min: [number, number, number];
    max: [number, number, number];
  };
}

export class ManifoldSplitter {
  private manifold: ManifoldToplevel | null = null;

  private async initManifold(): Promise<ManifoldToplevel> {
    if (!this.manifold) {
      // Dynamic import for ES Module compatibility - use Function constructor to avoid TS compilation
      const importManifold = new Function('specifier', 'return import(specifier)');
      const manifoldModule = await importManifold('manifold-3d');
      const ManifoldModule = manifoldModule.default;
      const manifoldInstance = await ManifoldModule();
      manifoldInstance.setup();
      this.manifold = manifoldInstance;
    }
    return this.manifold!;
  }
  /**
   * Parse STL file and return mesh data
   */
  async parseSTLFile(filePath: string): Promise<STLMesh> {
    console.log('Parsing STL file:', filePath);

    const buffer = await fs.readFile(filePath);
    const dataView = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);

    // Check if binary STL (starts with 80-byte header + 4-byte triangle count)
    const triangleCount = dataView.getUint32(80, true);
    const expectedSize = 80 + 4 + (triangleCount * 50);

    if (buffer.length === expectedSize) {
      return this.parseBinarySTL(dataView);
    } else {
      return this.parseASCIISTL(buffer.toString('utf8'));
    }
  }

  private parseBinarySTL(dataView: DataView): STLMesh {
    const triangleCount = dataView.getUint32(80, true);
    console.log('Binary STL with', triangleCount, 'triangles');

    const vertices: number[] = [];
    const triangles: number[] = [];
    const vertexMap = new Map<string, number>();
    let vertexIndex = 0;

    let minX = Infinity, minY = Infinity, minZ = Infinity;
    let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;

    for (let i = 0; i < triangleCount; i++) {
      const offset = 84 + i * 50;

      // Skip normal vector (3 floats)
      // Read 3 vertices (9 floats total)
      for (let v = 0; v < 3; v++) {
        const vertexOffset = offset + 12 + v * 12;
        const x = dataView.getFloat32(vertexOffset, true);
        const y = dataView.getFloat32(vertexOffset + 4, true);
        const z = dataView.getFloat32(vertexOffset + 8, true);

        // Update bounds
        minX = Math.min(minX, x); maxX = Math.max(maxX, x);
        minY = Math.min(minY, y); maxY = Math.max(maxY, y);
        minZ = Math.min(minZ, z); maxZ = Math.max(maxZ, z);

        // Create unique key for vertex deduplication
        const key = `${x.toFixed(6)},${y.toFixed(6)},${z.toFixed(6)}`;

        let index = vertexMap.get(key);
        if (index === undefined) {
          index = vertexIndex++;
          vertexMap.set(key, index);
          vertices.push(x, y, z);
        }

        triangles.push(index);
      }
    }

    console.log('Parsed', vertices.length / 3, 'unique vertices,', triangles.length / 3, 'triangles');

    return {
      vertices: new Float32Array(vertices),
      triangles: new Uint32Array(triangles),
      bounds: {
        min: [minX, minY, minZ],
        max: [maxX, maxY, maxZ]
      }
    };
  }

  private parseASCIISTL(content: string): STLMesh {
    console.log('Parsing ASCII STL');

    const vertices: number[] = [];
    const triangles: number[] = [];
    const vertexMap = new Map<string, number>();
    let vertexIndex = 0;

    let minX = Infinity, minY = Infinity, minZ = Infinity;
    let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;

    const lines = content.split('\n');
    let triangleVertices: number[] = [];

    for (const line of lines) {
      const trimmed = line.trim().toLowerCase();

      if (trimmed.startsWith('vertex')) {
        const coords = trimmed.split(/\s+/).slice(1).map(Number);
        if (coords.length === 3) {
          const [x, y, z] = coords;

          // Update bounds
          minX = Math.min(minX, x); maxX = Math.max(maxX, x);
          minY = Math.min(minY, y); maxY = Math.max(maxY, y);
          minZ = Math.min(minZ, z); maxZ = Math.max(maxZ, z);

          const key = `${x.toFixed(6)},${y.toFixed(6)},${z.toFixed(6)}`;
          let index = vertexMap.get(key);
          if (index === undefined) {
            index = vertexIndex++;
            vertexMap.set(key, index);
            vertices.push(x, y, z);
          }

          triangleVertices.push(index);
        }
      } else if (trimmed === 'endfacet') {
        if (triangleVertices.length === 3) {
          triangles.push(...triangleVertices);
        }
        triangleVertices = [];
      }
    }

    console.log('Parsed', vertices.length / 3, 'unique vertices,', triangles.length / 3, 'triangles');

    return {
      vertices: new Float32Array(vertices),
      triangles: new Uint32Array(triangles),
      bounds: {
        min: [minX, minY, minZ],
        max: [maxX, maxY, maxZ]
      }
    };
  }

  /**
   * Write mesh data to STL file
   */
  async writeSTLFile(mesh: STLMesh, filePath: string): Promise<void> {
    const triangleCount = mesh.triangles.length / 3;
    const bufferSize = 80 + 4 + (triangleCount * 50);
    const buffer = Buffer.alloc(bufferSize);

    // Write header (80 bytes)
    buffer.write('Manifold STL Export', 0, 'ascii');

    // Write triangle count
    buffer.writeUInt32LE(triangleCount, 80);

    let offset = 84;
    for (let i = 0; i < triangleCount; i++) {
      const i0 = mesh.triangles[i * 3] * 3;
      const i1 = mesh.triangles[i * 3 + 1] * 3;
      const i2 = mesh.triangles[i * 3 + 2] * 3;

      const v0 = [mesh.vertices[i0], mesh.vertices[i0 + 1], mesh.vertices[i0 + 2]];
      const v1 = [mesh.vertices[i1], mesh.vertices[i1 + 1], mesh.vertices[i1 + 2]];
      const v2 = [mesh.vertices[i2], mesh.vertices[i2 + 1], mesh.vertices[i2 + 2]];

      // Calculate normal
      const u = [v1[0] - v0[0], v1[1] - v0[1], v1[2] - v0[2]];
      const v = [v2[0] - v0[0], v2[1] - v0[1], v2[2] - v0[2]];
      const normal = [
        u[1] * v[2] - u[2] * v[1],
        u[2] * v[0] - u[0] * v[2],
        u[0] * v[1] - u[1] * v[0]
      ];
      const len = Math.sqrt(normal[0] * normal[0] + normal[1] * normal[1] + normal[2] * normal[2]);
      if (len > 0) {
        normal[0] /= len; normal[1] /= len; normal[2] /= len;
      }

      // Write normal
      buffer.writeFloatLE(normal[0], offset);
      buffer.writeFloatLE(normal[1], offset + 4);
      buffer.writeFloatLE(normal[2], offset + 8);

      // Write vertices
      buffer.writeFloatLE(v0[0], offset + 12);
      buffer.writeFloatLE(v0[1], offset + 16);
      buffer.writeFloatLE(v0[2], offset + 20);
      buffer.writeFloatLE(v1[0], offset + 24);
      buffer.writeFloatLE(v1[1], offset + 28);
      buffer.writeFloatLE(v1[2], offset + 32);
      buffer.writeFloatLE(v2[0], offset + 36);
      buffer.writeFloatLE(v2[1], offset + 40);
      buffer.writeFloatLE(v2[2], offset + 44);

      // Skip attribute byte count (2 bytes)
      offset += 50;
    }

    await fs.writeFile(filePath, buffer);
    console.log('Wrote STL file:', filePath);
  }

  /**
   * Check if a hole position would break through the model boundaries
   * Returns true if the hole is safe to place, false if it would break through
   */
  private isHoleSafe(
    position: { y?: number; z?: number; x?: number },
    holeRadius: number,
    actualBounds: { min1: number; max1: number; min2: number; max2: number },
    axis: 'x' | 'y' | 'z'
  ): boolean {
    // Get the two perpendicular coordinates based on the cut axis
    let pos1: number, pos2: number;
    if (axis === 'x') {
      pos1 = position.y!;
      pos2 = position.z!;
    } else if (axis === 'y') {
      pos1 = position.x!;
      pos2 = position.z!;
    } else { // z
      pos1 = position.x!;
      pos2 = position.y!;
    }

    // Check if hole circle fits within bounds (with small safety margin)
    const safetyMargin = 0.1; // 0.1mm safety margin
    const minSafeDistance = holeRadius + safetyMargin;

    const distToMin1 = pos1 - actualBounds.min1;
    const distToMax1 = actualBounds.max1 - pos1;
    const distToMin2 = pos2 - actualBounds.min2;
    const distToMax2 = actualBounds.max2 - pos2;

    // All distances must be at least holeRadius + safety margin
    return distToMin1 >= minSafeDistance &&
           distToMax1 >= minSafeDistance &&
           distToMin2 >= minSafeDistance &&
           distToMax2 >= minSafeDistance;
  }

  /**
   * Find the actual geometry bounds at a cut plane by sampling with small test boxes
   */
  private findGeometryBoundsAtCutPlane(
    manifold: any,
    Manifold: any,
    cutPosition: number,
    axis: 'x' | 'y' | 'z',
    perpAxis1Range: [number, number],
    perpAxis2Range: [number, number]
  ): { min1: number; max1: number; min2: number; max2: number } | null {
    const sampleSize = 0.5; // mm - size of test boxes for sampling
    const sliceThickness = 0.1; // mm - thickness of the slice to test

    const [rangeMin1, rangeMax1] = perpAxis1Range;
    const [rangeMin2, rangeMax2] = perpAxis2Range;

    // Sample grid resolution
    const samples1 = Math.ceil((rangeMax1 - rangeMin1) / sampleSize);
    const samples2 = Math.ceil((rangeMax2 - rangeMin2) / sampleSize);

    let foundMin1 = rangeMax1;
    let foundMax1 = rangeMin1;
    let foundMin2 = rangeMax2;
    let foundMax2 = rangeMin2;
    let foundAny = false;

    // Sample the cut plane with small test boxes
    for (let i = 0; i < samples1; i++) {
      for (let j = 0; j < samples2; j++) {
        const pos1 = rangeMin1 + i * sampleSize;
        const pos2 = rangeMin2 + j * sampleSize;

        // Create a small test box at this position
        let testBox;
        if (axis === 'x') {
          testBox = Manifold.cube([sliceThickness, sampleSize, sampleSize])
            .translate([cutPosition - sliceThickness/2, pos1, pos2]);
        } else if (axis === 'y') {
          testBox = Manifold.cube([sampleSize, sliceThickness, sampleSize])
            .translate([pos1, cutPosition - sliceThickness/2, pos2]);
        } else { // z
          testBox = Manifold.cube([sampleSize, sampleSize, sliceThickness])
            .translate([pos1, pos2, cutPosition - sliceThickness/2]);
        }

        // Test if this box intersects the model
        const intersection = manifold.intersect(testBox);
        const hasGeometry = intersection.volume() > 0;

        // Clean up
        testBox.delete();
        intersection.delete();

        if (hasGeometry) {
          foundAny = true;
          foundMin1 = Math.min(foundMin1, pos1);
          foundMax1 = Math.max(foundMax1, pos1 + sampleSize);
          foundMin2 = Math.min(foundMin2, pos2);
          foundMax2 = Math.max(foundMax2, pos2 + sampleSize);
        }
      }
    }

    if (!foundAny) {
      return null;
    }

    return {
      min1: foundMin1,
      max1: foundMax1,
      min2: foundMin2,
      max2: foundMax2
    };
  }

  /**
   * Split STL using manifold-3d
   */
  async splitSTL(options: ProcessingOptions): Promise<ProcessingResult> {
    console.log('Starting Manifold STL splitting...');
    console.log('Options:', options);

    // Track objects that need cleanup (only Manifold objects, not Mesh)
    let manifold: any = null;
    let manifoldWithHoles: any = null;

    try {
      // Initialize manifold module
      const manifoldModule = await this.initManifold();
      const { Manifold } = manifoldModule;

      // Parse input STL
      const mesh = await this.parseSTLFile(options.inputPath);
      console.log('Mesh bounds:', mesh.bounds);

      // Create manifold from mesh
      console.log('Creating manifold...');

      // Create a mesh object first (Mesh objects don't need .delete(), they're JS objects)
      const meshObj = new manifoldModule.Mesh({
        vertProperties: mesh.vertices,
        triVerts: mesh.triangles,
        numProp: 3
      });

      manifold = new Manifold(meshObj);

      if (manifold.status() !== 'NoError') {
        // Clean up manifold before throwing
        if (manifold) manifold.delete();
        throw new Error(`Input mesh is not a valid manifold: ${manifold.status()}`);
      }

      console.log('Manifold created successfully. Volume:', manifold.volume());

      // Calculate split dimensions using balanced approach
      const bounds = mesh.bounds;
      const modelSize = [
        bounds.max[0] - bounds.min[0],
        bounds.max[1] - bounds.min[1],
        bounds.max[2] - bounds.min[2]
      ];

      // Calculate sections and actual piece sizes using balanced distribution (if enabled)
      const calculateBalancedSplit = (size: number, maxDim: number) => {
        const numSections = Math.max(1, Math.ceil(size / maxDim));

        if (options.balancedCutting) {
          const remainder = size % maxDim;
          const shouldBalance = remainder > 0 && remainder < maxDim * 0.5;

          // If we should balance, distribute evenly; otherwise use the naive approach
          const actualPieceSize = shouldBalance ? size / numSections : maxDim;
          return { numSections, pieceSize: actualPieceSize };
        } else {
          // Regular cutting: use max dimension
          return { numSections, pieceSize: maxDim };
        }
      };

      const xSplit = calculateBalancedSplit(modelSize[0], options.dimensions.x);
      const ySplit = calculateBalancedSplit(modelSize[1], options.dimensions.y);
      const zSplit = calculateBalancedSplit(modelSize[2], options.dimensions.z);

      const sections = {
        x: xSplit.numSections,
        y: ySplit.numSections,
        z: zSplit.numSections
      };

      const pieceSizes = {
        x: xSplit.pieceSize,
        y: ySplit.pieceSize,
        z: zSplit.pieceSize
      };

      console.log('Model size:', modelSize);
      console.log('Split sections:', sections);
      console.log('Piece sizes:', pieceSizes);

      // Create alignment holes BEFORE cutting if enabled
      manifoldWithHoles = manifold; // Start with reference to original

      if (options.alignmentHoles?.enabled) {
        console.log('Creating alignment holes before cutting...');
        const holeRadius = (options.alignmentHoles.diameter || 1.8) / 2;
        const holeDepth = options.alignmentHoles.depth || 3;
        const totalDepth = holeDepth * 2;
        const spacing = options.alignmentHoles.spacing || 'normal';

        // Strategic hole placement: corners + center + midpoints
        const minVolumeRatio = 0.8; // Require 80% of expected volume to be removed
        const edgeInset = holeRadius * 2.5; // Distance from edges for hole placement

        // Calculate expected volume for a full cylinder hole
        const expectedVolume = Math.PI * holeRadius * holeRadius * totalDepth;

        const spacingDesc = spacing === 'sparse' ? 'corners + center' :
                           spacing === 'normal' ? 'corners + center + midpoints' :
                           'corners + center + midpoints + 1/3 points';
        console.log(`Strategic hole placement (${spacing}): ${spacingDesc}`);
        console.log(`Expected volume per hole: ${expectedVolume.toFixed(2)} mm³`);
        console.log(`Quality thresholds: volume ≥${minVolumeRatio*100}%, edge inset ${edgeInset.toFixed(1)}mm, depth ratio ≥60%`);

        // For each cut plane, create holes for each section in perpendicular axes
        // X-axis cuts (creates YZ plane cuts)
        for (let i = 1; i < sections.x; i++) {
          const cutPosition = bounds.min[0] + i * pieceSizes.x;

          // Create holes for each Y and Z section
          for (let y = 0; y < sections.y; y++) {
            for (let z = 0; z < sections.z; z++) {
              let holesCreated = 0;
              let holesAttempted = 0;

              // Section bounds for this cut (grid cell boundaries)
              const yMin = bounds.min[1] + y * pieceSizes.y;
              const yMax = bounds.min[1] + (y + 1) * pieceSizes.y;
              const zMin = bounds.min[2] + z * pieceSizes.z;
              const zMax = bounds.min[2] + (z + 1) * pieceSizes.z;

              // Find actual geometry bounds at this cut plane within this section
              console.log(`  Finding geometry bounds for X-cut ${i} section (${y}, ${z})...`);
              const geometryBounds = this.findGeometryBoundsAtCutPlane(
                manifoldWithHoles,
                Manifold,
                cutPosition,
                'x',
                [yMin, yMax],
                [zMin, zMax]
              );

              if (!geometryBounds) {
                console.log(`  X-axis section (${i}, ${y}, ${z}): No geometry found at cut plane`);
                continue;
              }

              // Use actual geometry bounds for hole placement
              const actualYMin = geometryBounds.min1;
              const actualYMax = geometryBounds.max1;
              const actualZMin = geometryBounds.min2;
              const actualZMax = geometryBounds.max2;

              const sectionWidth = actualYMax - actualYMin;
              const sectionHeight = actualZMax - actualZMin;

              console.log(`  Actual geometry at cut: Y[${actualYMin.toFixed(1)}, ${actualYMax.toFixed(1)}] Z[${actualZMin.toFixed(1)}, ${actualZMax.toFixed(1)}]`);

              // Generate strategic hole positions based on spacing setting
              const strategicPositions: Array<{y: number, z: number, label: string}> = [];

              // Check if section is large enough for holes
              if (sectionWidth >= edgeInset * 2 && sectionHeight >= edgeInset * 2) {
                const centerY = (actualYMin + actualYMax) / 2;
                const centerZ = (actualZMin + actualZMax) / 2;

                // Always add 4 corners + center (sparse mode minimum)
                strategicPositions.push(
                  { y: actualYMin + edgeInset, z: actualZMin + edgeInset, label: 'corner-BL' },
                  { y: actualYMin + edgeInset, z: actualZMax - edgeInset, label: 'corner-TL' },
                  { y: actualYMax - edgeInset, z: actualZMin + edgeInset, label: 'corner-BR' },
                  { y: actualYMax - edgeInset, z: actualZMax - edgeInset, label: 'corner-TR' },
                  { y: centerY, z: centerZ, label: 'center' }
                );

                // Add edge midpoints for normal and dense modes (if section large enough)
                if (spacing !== 'sparse' && sectionWidth >= edgeInset * 4 && sectionHeight >= edgeInset * 4) {
                  strategicPositions.push(
                    { y: centerY, z: actualZMin + edgeInset, label: 'mid-bottom' },
                    { y: centerY, z: actualZMax - edgeInset, label: 'mid-top' },
                    { y: actualYMin + edgeInset, z: centerZ, label: 'mid-left' },
                    { y: actualYMax - edgeInset, z: centerZ, label: 'mid-right' }
                  );

                  // Add 1/3 points for dense mode
                  if (spacing === 'dense') {
                    const oneThirdY = actualYMin + (actualYMax - actualYMin) / 3;
                    const twoThirdY = actualYMin + 2 * (actualYMax - actualYMin) / 3;
                    const oneThirdZ = actualZMin + (actualZMax - actualZMin) / 3;
                    const twoThirdZ = actualZMin + 2 * (actualZMax - actualZMin) / 3;

                    strategicPositions.push(
                      { y: oneThirdY, z: actualZMin + edgeInset, label: '1/3-bottom-left' },
                      { y: twoThirdY, z: actualZMin + edgeInset, label: '1/3-bottom-right' },
                      { y: oneThirdY, z: actualZMax - edgeInset, label: '1/3-top-left' },
                      { y: twoThirdY, z: actualZMax - edgeInset, label: '1/3-top-right' }
                    );
                  }
                }
              }

              // Test each strategic position
              for (const pos of strategicPositions) {
                holesAttempted++;

                const gridY = pos.y;
                const gridZ = pos.z;

                // Check if hole would break through model boundaries
                const actualBounds = { min1: actualYMin, max1: actualYMax, min2: actualZMin, max2: actualZMax };
                if (!this.isHoleSafe({ y: gridY, z: gridZ }, holeRadius, actualBounds, 'x')) {
                  console.log(`    ✗ X-hole (${i},${y},${z}) ${pos.label}: Skipped (would break through model boundary)`);
                  continue;
                }

                // Create test cylinder
                const cylinder = Manifold.cylinder(totalDepth, holeRadius, holeRadius, 32)
                  .translate([0, 0, -totalDepth/2])
                  .rotate([0, 90, 0])
                  .translate([cutPosition, gridY, gridZ]);

                // Test volume removal
                const beforeVol = manifoldWithHoles.volume();
                const testManifold = manifoldWithHoles.subtract(cylinder);
                const volumeRemoved = beforeVol - testManifold.volume();
                const removalRatio = volumeRemoved / expectedVolume;

                // Only keep holes that remove sufficient volume
                if (removalRatio >= minVolumeRatio) {
                  // Smart depth checking: Skip for excellent holes (>90%), check borderline cases
                  let depthRatio = 1.0; // Default for excellent holes
                  let shouldKeep = true;

                  if (removalRatio < 0.9) {
                    // Borderline case - apply depth ratio check to detect through-wall penetration
                    const halfDepthCylinder = Manifold.cylinder(totalDepth/2, holeRadius, holeRadius, 32)
                      .translate([0, 0, -totalDepth/4])
                      .rotate([0, 90, 0])
                      .translate([cutPosition, gridY, gridZ]);

                    const halfDepthManifold = manifoldWithHoles.subtract(halfDepthCylinder);
                    const halfDepthRemoved = beforeVol - halfDepthManifold.volume();
                    depthRatio = halfDepthRemoved / volumeRemoved;

                    // Clean up intermediate objects
                    halfDepthCylinder.delete();
                    halfDepthManifold.delete();

                    // Reject if material is spread across both halves (indicates two-wall penetration)
                    if (depthRatio < 0.6) {
                      shouldKeep = false;
                    }
                  }

                  if (shouldKeep) {
                    // Delete old manifoldWithHoles if it's not the original
                    if (manifoldWithHoles !== manifold) {
                      manifoldWithHoles.delete();
                    }
                    manifoldWithHoles = testManifold;
                    holesCreated++;
                    console.log(`    ✓ X-hole (${i},${y},${z}) ${pos.label} at (${cutPosition.toFixed(1)}, ${gridY.toFixed(1)}, ${gridZ.toFixed(1)}): ${volumeRemoved.toFixed(1)} mm³ (${(removalRatio*100).toFixed(0)}%, depth: ${(depthRatio*100).toFixed(0)}%)`);
                  } else {
                    // Not keeping - clean up test manifold
                    testManifold.delete();
                  }
                } else {
                  // Didn't meet volume threshold - clean up test manifold
                  testManifold.delete();
                }

                // Always clean up cylinder
                cylinder.delete();
              }

              if (holesCreated > 0) {
                console.log(`  X-axis section (${i}, ${y}, ${z}): ${holesCreated}/${holesAttempted} holes created`);
              } else {
                console.log(`  X-axis section (${i}, ${y}, ${z}): No valid holes found (no geometry on cut plane)`);
              }
            }
          }
        }

        // Y-axis cuts (creates XZ plane cuts)
        for (let i = 1; i < sections.y; i++) {
          const cutPosition = bounds.min[1] + i * pieceSizes.y;

          // Create holes for each X and Z section
          for (let x = 0; x < sections.x; x++) {
            for (let z = 0; z < sections.z; z++) {
              let holesCreated = 0;
              let holesAttempted = 0;

              // Section bounds for this cut (grid cell boundaries)
              const xMin = bounds.min[0] + x * pieceSizes.x;
              const xMax = bounds.min[0] + (x + 1) * pieceSizes.x;
              const zMin = bounds.min[2] + z * pieceSizes.z;
              const zMax = bounds.min[2] + (z + 1) * pieceSizes.z;

              // Find actual geometry bounds at this cut plane within this section
              console.log(`  Finding geometry bounds for Y-cut ${i} section (${x}, ${z})...`);
              const geometryBounds = this.findGeometryBoundsAtCutPlane(
                manifoldWithHoles,
                Manifold,
                cutPosition,
                'y',
                [xMin, xMax],
                [zMin, zMax]
              );

              if (!geometryBounds) {
                console.log(`  Y-axis section (${x}, ${i}, ${z}): No geometry found at cut plane`);
                continue;
              }

              // Use actual geometry bounds for hole placement
              const actualXMin = geometryBounds.min1;
              const actualXMax = geometryBounds.max1;
              const actualZMin = geometryBounds.min2;
              const actualZMax = geometryBounds.max2;

              const sectionWidth = actualXMax - actualXMin;
              const sectionHeight = actualZMax - actualZMin;

              console.log(`  Actual geometry at cut: X[${actualXMin.toFixed(1)}, ${actualXMax.toFixed(1)}] Z[${actualZMin.toFixed(1)}, ${actualZMax.toFixed(1)}]`);

              // Generate strategic hole positions based on spacing setting
              const strategicPositions: Array<{x: number, z: number, label: string}> = [];

              // Check if section is large enough for holes
              if (sectionWidth >= edgeInset * 2 && sectionHeight >= edgeInset * 2) {
                const centerX = (actualXMin + actualXMax) / 2;
                const centerZ = (actualZMin + actualZMax) / 2;

                // Always add 4 corners + center (sparse mode minimum)
                strategicPositions.push(
                  { x: actualXMin + edgeInset, z: actualZMin + edgeInset, label: 'corner-BL' },
                  { x: actualXMin + edgeInset, z: actualZMax - edgeInset, label: 'corner-TL' },
                  { x: actualXMax - edgeInset, z: actualZMin + edgeInset, label: 'corner-BR' },
                  { x: actualXMax - edgeInset, z: actualZMax - edgeInset, label: 'corner-TR' },
                  { x: centerX, z: centerZ, label: 'center' }
                );

                // Add edge midpoints for normal and dense modes (if section large enough)
                if (spacing !== 'sparse' && sectionWidth >= edgeInset * 4 && sectionHeight >= edgeInset * 4) {
                  strategicPositions.push(
                    { x: centerX, z: actualZMin + edgeInset, label: 'mid-bottom' },
                    { x: centerX, z: actualZMax - edgeInset, label: 'mid-top' },
                    { x: actualXMin + edgeInset, z: centerZ, label: 'mid-left' },
                    { x: actualXMax - edgeInset, z: centerZ, label: 'mid-right' }
                  );

                  // Add 1/3 points for dense mode
                  if (spacing === 'dense') {
                    const oneThirdX = actualXMin + (actualXMax - actualXMin) / 3;
                    const twoThirdX = actualXMin + 2 * (actualXMax - actualXMin) / 3;
                    const oneThirdZ = actualZMin + (actualZMax - actualZMin) / 3;
                    const twoThirdZ = actualZMin + 2 * (actualZMax - actualZMin) / 3;

                    strategicPositions.push(
                      { x: oneThirdX, z: actualZMin + edgeInset, label: '1/3-bottom-left' },
                      { x: twoThirdX, z: actualZMin + edgeInset, label: '1/3-bottom-right' },
                      { x: oneThirdX, z: actualZMax - edgeInset, label: '1/3-top-left' },
                      { x: twoThirdX, z: actualZMax - edgeInset, label: '1/3-top-right' }
                    );
                  }
                }
              }

              // Test each strategic position
              for (const pos of strategicPositions) {
                holesAttempted++;

                const gridX = pos.x;
                const gridZ = pos.z;

                // Check if hole would break through model boundaries
                const actualBounds = { min1: actualXMin, max1: actualXMax, min2: actualZMin, max2: actualZMax };
                if (!this.isHoleSafe({ x: gridX, z: gridZ }, holeRadius, actualBounds, 'y')) {
                  console.log(`    ✗ Y-hole (${x},${i},${z}) ${pos.label}: Skipped (would break through model boundary)`);
                  continue;
                }

                const cylinder = Manifold.cylinder(totalDepth, holeRadius, holeRadius, 32)
                  .translate([0, 0, -totalDepth/2])
                  .rotate([90, 0, 0])
                  .translate([gridX, cutPosition, gridZ]);

                const beforeVol = manifoldWithHoles.volume();
                const testManifold = manifoldWithHoles.subtract(cylinder);
                const volumeRemoved = beforeVol - testManifold.volume();
                const removalRatio = volumeRemoved / expectedVolume;

                if (removalRatio >= minVolumeRatio) {
                  // Smart depth checking: Skip for excellent holes (>90%), check borderline cases
                  let depthRatio = 1.0; // Default for excellent holes
                  let shouldKeep = true;

                  if (removalRatio < 0.9) {
                    // Borderline case - apply depth ratio check to detect through-wall penetration
                    const halfDepthCylinder = Manifold.cylinder(totalDepth/2, holeRadius, holeRadius, 32)
                      .translate([0, 0, -totalDepth/4])
                      .rotate([90, 0, 0])
                      .translate([gridX, cutPosition, gridZ]);

                    const halfDepthManifold = manifoldWithHoles.subtract(halfDepthCylinder);
                    const halfDepthRemoved = beforeVol - halfDepthManifold.volume();
                    depthRatio = halfDepthRemoved / volumeRemoved;

                    // Clean up intermediate objects
                    halfDepthCylinder.delete();
                    halfDepthManifold.delete();

                    // Reject if material is spread across both halves (indicates two-wall penetration)
                    if (depthRatio < 0.6) {
                      shouldKeep = false;
                    }
                  }

                  if (shouldKeep) {
                    // Delete old manifoldWithHoles if it's not the original
                    if (manifoldWithHoles !== manifold) {
                      manifoldWithHoles.delete();
                    }
                    manifoldWithHoles = testManifold;
                    holesCreated++;
                    console.log(`    ✓ Y-hole (${x},${i},${z}) ${pos.label} at (${gridX.toFixed(1)}, ${cutPosition.toFixed(1)}, ${gridZ.toFixed(1)}): ${volumeRemoved.toFixed(1)} mm³ (${(removalRatio*100).toFixed(0)}%, depth: ${(depthRatio*100).toFixed(0)}%)`);
                  } else {
                    // Not keeping - clean up test manifold
                    testManifold.delete();
                  }
                } else {
                  // Didn't meet volume threshold - clean up test manifold
                  testManifold.delete();
                }

                // Always clean up cylinder
                cylinder.delete();
              }

              if (holesCreated > 0) {
                console.log(`  Y-axis section (${x}, ${i}, ${z}): ${holesCreated}/${holesAttempted} holes created`);
              } else {
                console.log(`  Y-axis section (${x}, ${i}, ${z}): No valid holes found (no geometry on cut plane)`);
              }
            }
          }
        }

        // Z-axis cuts (creates XY plane cuts)
        for (let i = 1; i < sections.z; i++) {
          const cutPosition = bounds.min[2] + i * pieceSizes.z;

          // Create holes for each X and Y section
          for (let x = 0; x < sections.x; x++) {
            for (let y = 0; y < sections.y; y++) {
              let holesCreated = 0;
              let holesAttempted = 0;

              // Section bounds for this cut (grid cell boundaries)
              const xMin = bounds.min[0] + x * pieceSizes.x;
              const xMax = bounds.min[0] + (x + 1) * pieceSizes.x;
              const yMin = bounds.min[1] + y * pieceSizes.y;
              const yMax = bounds.min[1] + (y + 1) * pieceSizes.y;

              // Find actual geometry bounds at this cut plane within this section
              console.log(`  Finding geometry bounds for Z-cut ${i} section (${x}, ${y})...`);
              const geometryBounds = this.findGeometryBoundsAtCutPlane(
                manifoldWithHoles,
                Manifold,
                cutPosition,
                'z',
                [xMin, xMax],
                [yMin, yMax]
              );

              if (!geometryBounds) {
                console.log(`  Z-axis section (${x}, ${y}, ${i}): No geometry found at cut plane`);
                continue;
              }

              // Use actual geometry bounds for hole placement
              const actualXMin = geometryBounds.min1;
              const actualXMax = geometryBounds.max1;
              const actualYMin = geometryBounds.min2;
              const actualYMax = geometryBounds.max2;

              const sectionWidth = actualXMax - actualXMin;
              const sectionHeight = actualYMax - actualYMin;

              console.log(`  Actual geometry at cut: X[${actualXMin.toFixed(1)}, ${actualXMax.toFixed(1)}] Y[${actualYMin.toFixed(1)}, ${actualYMax.toFixed(1)}]`);

              // Generate strategic hole positions based on spacing setting
              const strategicPositions: Array<{x: number, y: number, label: string}> = [];

              // Check if section is large enough for holes
              if (sectionWidth >= edgeInset * 2 && sectionHeight >= edgeInset * 2) {
                const centerX = (actualXMin + actualXMax) / 2;
                const centerY = (actualYMin + actualYMax) / 2;

                // Always add 4 corners + center (sparse mode minimum)
                strategicPositions.push(
                  { x: actualXMin + edgeInset, y: actualYMin + edgeInset, label: 'corner-BL' },
                  { x: actualXMin + edgeInset, y: actualYMax - edgeInset, label: 'corner-TL' },
                  { x: actualXMax - edgeInset, y: actualYMin + edgeInset, label: 'corner-BR' },
                  { x: actualXMax - edgeInset, y: actualYMax - edgeInset, label: 'corner-TR' },
                  { x: centerX, y: centerY, label: 'center' }
                );

                // Add edge midpoints for normal and dense modes (if section large enough)
                if (spacing !== 'sparse' && sectionWidth >= edgeInset * 4 && sectionHeight >= edgeInset * 4) {
                  strategicPositions.push(
                    { x: centerX, y: actualYMin + edgeInset, label: 'mid-bottom' },
                    { x: centerX, y: actualYMax - edgeInset, label: 'mid-top' },
                    { x: actualXMin + edgeInset, y: centerY, label: 'mid-left' },
                    { x: actualXMax - edgeInset, y: centerY, label: 'mid-right' }
                  );

                  // Add 1/3 points for dense mode
                  if (spacing === 'dense') {
                    const oneThirdX = actualXMin + (actualXMax - actualXMin) / 3;
                    const twoThirdX = actualXMin + 2 * (actualXMax - actualXMin) / 3;
                    const oneThirdY = actualYMin + (actualYMax - actualYMin) / 3;
                    const twoThirdY = actualYMin + 2 * (actualYMax - actualYMin) / 3;

                    strategicPositions.push(
                      { x: oneThirdX, y: actualYMin + edgeInset, label: '1/3-bottom-left' },
                      { x: twoThirdX, y: actualYMin + edgeInset, label: '1/3-bottom-right' },
                      { x: oneThirdX, y: actualYMax - edgeInset, label: '1/3-top-left' },
                      { x: twoThirdX, y: actualYMax - edgeInset, label: '1/3-top-right' }
                    );
                  }
                }
              }

              // Test each strategic position
              for (const pos of strategicPositions) {
                holesAttempted++;

                const gridX = pos.x;
                const gridY = pos.y;

                // Check if hole would break through model boundaries
                const actualBounds = { min1: actualXMin, max1: actualXMax, min2: actualYMin, max2: actualYMax };
                if (!this.isHoleSafe({ x: gridX, y: gridY }, holeRadius, actualBounds, 'z')) {
                  console.log(`    ✗ Z-hole (${x},${y},${i}) ${pos.label}: Skipped (would break through model boundary)`);
                  continue;
                }

                const cylinder = Manifold.cylinder(totalDepth, holeRadius, holeRadius, 32)
                  .translate([0, 0, -totalDepth/2])
                  .translate([gridX, gridY, cutPosition]);

                const beforeVol = manifoldWithHoles.volume();
                const testManifold = manifoldWithHoles.subtract(cylinder);
                const volumeRemoved = beforeVol - testManifold.volume();
                const removalRatio = volumeRemoved / expectedVolume;

                if (removalRatio >= minVolumeRatio) {
                  // Smart depth checking: Skip for excellent holes (>90%), check borderline cases
                  let depthRatio = 1.0; // Default for excellent holes
                  let shouldKeep = true;

                  if (removalRatio < 0.9) {
                    // Borderline case - apply depth ratio check to detect through-wall penetration
                    const halfDepthCylinder = Manifold.cylinder(totalDepth/2, holeRadius, holeRadius, 32)
                      .translate([0, 0, -totalDepth/4])
                      .translate([gridX, gridY, cutPosition]);

                    const halfDepthManifold = manifoldWithHoles.subtract(halfDepthCylinder);
                    const halfDepthRemoved = beforeVol - halfDepthManifold.volume();
                    depthRatio = halfDepthRemoved / volumeRemoved;

                    // Clean up intermediate objects
                    halfDepthCylinder.delete();
                    halfDepthManifold.delete();

                    // Reject if material is spread across both halves (indicates two-wall penetration)
                    if (depthRatio < 0.6) {
                      shouldKeep = false;
                    }
                  }

                  if (shouldKeep) {
                    // Delete old manifoldWithHoles if it's not the original
                    if (manifoldWithHoles !== manifold) {
                      manifoldWithHoles.delete();
                    }
                    manifoldWithHoles = testManifold;
                    holesCreated++;
                    console.log(`    ✓ Z-hole (${x},${y},${i}) ${pos.label} at (${gridX.toFixed(1)}, ${gridY.toFixed(1)}, ${cutPosition.toFixed(1)}): ${volumeRemoved.toFixed(1)} mm³ (${(removalRatio*100).toFixed(0)}%, depth: ${(depthRatio*100).toFixed(0)}%)`);
                  } else {
                    // Not keeping - clean up test manifold
                    testManifold.delete();
                  }
                } else {
                  // Didn't meet volume threshold - clean up test manifold
                  testManifold.delete();
                }

                // Always clean up cylinder
                cylinder.delete();
              }

              if (holesCreated > 0) {
                console.log(`  Z-axis section (${x}, ${y}, ${i}): ${holesCreated}/${holesAttempted} holes created`);
              } else {
                console.log(`  Z-axis section (${x}, ${y}, ${i}): No valid holes found (no geometry on cut plane)`);
              }
            }
          }
        }

        console.log('✅ Adaptive alignment holes created in original model');
      }

      const parts: Array<{ name: string; path: string; section: [number, number, number] }> = [];

      // Split the model using balanced piece sizes
      for (let x = 0; x < sections.x; x++) {
        for (let y = 0; y < sections.y; y++) {
          for (let z = 0; z < sections.z; z++) {
            const boxMin = [
              bounds.min[0] + x * pieceSizes.x,
              bounds.min[1] + y * pieceSizes.y,
              bounds.min[2] + z * pieceSizes.z
            ];
            const boxMax = [
              Math.min(bounds.max[0], bounds.min[0] + (x + 1) * pieceSizes.x),
              Math.min(bounds.max[1], bounds.min[1] + (y + 1) * pieceSizes.y),
              Math.min(bounds.max[2], bounds.min[2] + (z + 1) * pieceSizes.z)
            ];

            const boxSize = [
              boxMax[0] - boxMin[0],
              boxMax[1] - boxMin[1],
              boxMax[2] - boxMin[2]
            ];

            console.log(`Creating cutting box ${x},${y},${z}:`, boxMin, 'to', boxMax);

            // Create cutting box manifold
            const cuttingBox = Manifold.cube([boxSize[0], boxSize[1], boxSize[2]])
              .translate([boxMin[0], boxMin[1], boxMin[2]]);

            // Intersect with original (with holes already subtracted if enabled)
            console.log(`Intersecting part ${x + 1}_${y + 1}_${z + 1}...`);
            const partManifold = manifoldWithHoles.intersect(cuttingBox);

            // Clean up cutting box immediately
            cuttingBox.delete();

            if (partManifold.status() === 'NoError' && partManifold.volume() > 0.001) {
              // Convert back to mesh
              const partMesh = partManifold.getMesh();

              if (partMesh.vertProperties.length > 0) {
                // Convert manifold mesh to our STL format - will compute bounds properly below
                const stlMesh: STLMesh = {
                  vertices: partMesh.vertProperties,
                  triangles: partMesh.triVerts,
                  bounds: {
                    min: [0, 0, 0],
                    max: [0, 0, 0]
                  }
                };

                // Update bounds properly
                const vertices = partMesh.vertProperties;
                let minX = Infinity, minY = Infinity, minZ = Infinity;
                let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;

                for (let i = 0; i < vertices.length; i += 3) {
                  minX = Math.min(minX, vertices[i]);
                  maxX = Math.max(maxX, vertices[i]);
                  minY = Math.min(minY, vertices[i + 1]);
                  maxY = Math.max(maxY, vertices[i + 1]);
                  minZ = Math.min(minZ, vertices[i + 2]);
                  maxZ = Math.max(maxZ, vertices[i + 2]);
                }

                stlMesh.bounds = {
                  min: [minX, minY, minZ],
                  max: [maxX, maxY, maxZ]
                };

                // Write to file
                const partName = `part_${x + 1}_${y + 1}_${z + 1}.stl`;
                const partPath = path.join(options.outputDir, partName);

                await this.writeSTLFile(stlMesh, partPath);

                parts.push({
                  name: partName,
                  path: partPath,
                  section: [x + 1, y + 1, z + 1]
                });

                console.log(`✓ Created part: ${partName} (${partMesh.vertProperties.length / 3} vertices)`);
              }

              // Clean up part manifold (Mesh objects don't need .delete())
              partManifold.delete();
            } else {
              console.log(`⚠ Skipping empty part ${x + 1}_${y + 1}_${z + 1}`);
              // Clean up empty part manifold
              partManifold.delete();
            }
          }
        }
      }

      if (parts.length === 0) {
        return {
          success: false,
          error: 'No valid parts were generated. Model may be too small or outside the cutting bounds.'
        };
      }

      console.log(`✅ Manifold splitting complete! Generated ${parts.length} parts.`);

      return {
        success: true,
        parts,
        total_parts: parts.length,
        sections,
        original_dimensions: {
          x: modelSize[0],
          y: modelSize[1],
          z: modelSize[2]
        }
      };

    } catch (error) {
      console.error('Manifold splitting error:', error);
      return {
        success: false,
        error: `Manifold processing failed: ${error instanceof Error ? error.message : error}`
      };
    } finally {
      // Clean up main WASM objects (only Manifold objects need .delete())
      try {
        if (manifoldWithHoles && manifoldWithHoles !== manifold) {
          manifoldWithHoles.delete();
        }
        if (manifold) {
          manifold.delete();
        }
      } catch (cleanupError) {
        console.error('Error during WASM cleanup:', cleanupError);
      }
    }
  }
}