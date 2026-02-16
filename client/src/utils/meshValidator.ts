/**
 * Lightweight client-side STL mesh validation.
 * Checks for boundary edges (open holes) that indicate a non-manifold mesh.
 */

export interface MeshValidation {
  isValid: boolean;
  vertices: number;
  triangles: number;
  boundaryEdges: number;
}

export async function validateSTLMesh(file: File): Promise<MeshValidation> {
  const buffer = await file.arrayBuffer();
  const dataView = new DataView(buffer);

  // Determine if binary or ASCII
  const triangleCount = dataView.getUint32(80, true);
  const expectedSize = 80 + 4 + triangleCount * 50;
  const isBinary = buffer.byteLength === expectedSize;

  let vertices: number[];
  let triangleIndices: number[];

  if (isBinary) {
    ({ vertices, triangleIndices } = parseBinarySTL(dataView, triangleCount));
  } else {
    const text = new TextDecoder().decode(buffer);
    ({ vertices, triangleIndices } = parseASCIISTL(text));
  }

  const numVerts = vertices.length / 3;
  const numTris = triangleIndices.length / 3;

  // Count boundary edges: directed edges where the reverse doesn't exist
  const directedEdges = new Set<string>();

  for (let i = 0; i < numTris; i++) {
    const v0 = triangleIndices[i * 3];
    const v1 = triangleIndices[i * 3 + 1];
    const v2 = triangleIndices[i * 3 + 2];

    directedEdges.add(`${v0}>${v1}`);
    directedEdges.add(`${v1}>${v2}`);
    directedEdges.add(`${v2}>${v0}`);
  }

  let boundaryEdges = 0;
  for (const key of directedEdges) {
    const sep = key.indexOf('>');
    const from = key.substring(0, sep);
    const to = key.substring(sep + 1);
    if (!directedEdges.has(`${to}>${from}`)) {
      boundaryEdges++;
    }
  }

  return {
    isValid: boundaryEdges === 0,
    vertices: numVerts,
    triangles: numTris,
    boundaryEdges,
  };
}

function parseBinarySTL(
  dataView: DataView,
  triangleCount: number
): { vertices: number[]; triangleIndices: number[] } {
  const vertices: number[] = [];
  const triangleIndices: number[] = [];
  const vertexMap = new Map<string, number>();
  let vertexIndex = 0;

  for (let i = 0; i < triangleCount; i++) {
    const offset = 84 + i * 50;
    for (let v = 0; v < 3; v++) {
      const vo = offset + 12 + v * 12;
      const x = dataView.getFloat32(vo, true);
      const y = dataView.getFloat32(vo + 4, true);
      const z = dataView.getFloat32(vo + 8, true);

      const key = `${x.toFixed(6)},${y.toFixed(6)},${z.toFixed(6)}`;
      let idx = vertexMap.get(key);
      if (idx === undefined) {
        idx = vertexIndex++;
        vertexMap.set(key, idx);
        vertices.push(x, y, z);
      }
      triangleIndices.push(idx);
    }
  }

  return { vertices, triangleIndices };
}

function parseASCIISTL(content: string): { vertices: number[]; triangleIndices: number[] } {
  const vertices: number[] = [];
  const triangleIndices: number[] = [];
  const vertexMap = new Map<string, number>();
  let vertexIndex = 0;
  const triVerts: number[] = [];

  for (const line of content.split('\n')) {
    const trimmed = line.trim().toLowerCase();
    if (trimmed.startsWith('vertex')) {
      const coords = trimmed.split(/\s+/).slice(1).map(Number);
      if (coords.length === 3) {
        const [x, y, z] = coords;
        const key = `${x.toFixed(6)},${y.toFixed(6)},${z.toFixed(6)}`;
        let idx = vertexMap.get(key);
        if (idx === undefined) {
          idx = vertexIndex++;
          vertexMap.set(key, idx);
          vertices.push(x, y, z);
        }
        triVerts.push(idx);
      }
    } else if (trimmed === 'endfacet') {
      if (triVerts.length >= 3) {
        triangleIndices.push(triVerts[triVerts.length - 3], triVerts[triVerts.length - 2], triVerts[triVerts.length - 1]);
      }
      triVerts.length = 0;
    }
  }

  return { vertices, triangleIndices };
}
