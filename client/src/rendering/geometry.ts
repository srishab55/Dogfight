import type { Scene } from '@babylonjs/core/scene';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import { Mesh } from '@babylonjs/core/Meshes/mesh';
import { VertexData } from '@babylonjs/core/Meshes/mesh.vertexData';
import { VertexBuffer } from '@babylonjs/core/Buffers/buffer';

/** One spanwise cross-section of a flat aerodynamic panel (wing, stabiliser, fin). */
export interface PanelSection {
  leadingEdge: Vector3;
  trailingEdge: Vector3;
  /** Thickness at the leading edge (m). */
  thickness: number;
}

/**
 * Builds a closed, flat-shaded panel between two cross-sections: a tapered
 * slab with a blunt leading edge that thins towards the trailing edge, a cheap
 * stand-in for an airfoil.
 *
 * @param thicknessAxis direction of thickness: +Y for wings, +X for a vertical fin.
 * @param trailingEdgeThicknessRatio trailing-edge thickness as a fraction of the leading edge.
 */
export function createPanelMesh(
  name: string,
  scene: Scene,
  root: PanelSection,
  tip: PanelSection,
  thicknessAxis: Vector3,
  trailingEdgeThicknessRatio = 0.3,
): Mesh {
  // Corner index = edge + 2 * side + 4 * section, where
  //   edge:    0 leading,  1 trailing
  //   side:    0 lower,    1 upper (along thicknessAxis)
  //   section: 0 root,     1 tip
  const corners: Vector3[] = [];
  for (const section of [root, tip]) {
    for (const side of [-0.5, 0.5]) {
      corners.push(section.leadingEdge.add(thicknessAxis.scale(side * section.thickness)));
      corners.push(section.trailingEdge.add(thicknessAxis.scale(side * section.thickness * trailingEdgeThicknessRatio)));
    }
  }

  // Each face lists its four corners in order around its edge. Which way round
  // (clockwise or not) is fixed automatically below, so only adjacency matters.
  const faces: ReadonlyArray<readonly [number, number, number, number]> = [
    [0, 2, 6, 4], // leading edge
    [1, 5, 7, 3], // trailing edge
    [0, 4, 5, 1], // lower surface
    [2, 3, 7, 6], // upper surface
    [0, 1, 3, 2], // root cap
    [4, 6, 7, 5], // tip cap
  ];

  const centroid = corners.reduce((sum, corner) => sum.addInPlace(corner), Vector3.Zero()).scaleInPlace(1 / corners.length);
  const positions: number[] = [];
  const indices: number[] = [];
  const uvs: number[] = [];

  for (const face of faces) {
    const quad = face.map((index) => cornerAt(corners, index));
    const [a, b, c] = quad as [Vector3, Vector3, Vector3, Vector3];
    // Babylon's ComputeNormals treats (p1 - p2) x (p3 - p2) as a triangle's
    // outward normal. If that points into the panel, reverse the quad.
    const normal = Vector3.Cross(a.subtract(b), c.subtract(b));
    const faceCenter = quad.reduce((sum, corner) => sum.addInPlace(corner), Vector3.Zero()).scaleInPlace(0.25);
    if (Vector3.Dot(normal, faceCenter.subtract(centroid)) < 0) quad.reverse();

    // Four unshared vertices per face give crisp, flat-shaded edges.
    const base = positions.length / 3;
    for (const corner of quad) positions.push(corner.x, corner.y, corner.z);
    uvs.push(0, 0, 1, 0, 1, 1, 0, 1);
    indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }

  const normals: number[] = [];
  VertexData.ComputeNormals(positions, indices, normals);

  const vertexData = new VertexData();
  vertexData.positions = positions;
  vertexData.indices = indices;
  vertexData.normals = normals;
  vertexData.uvs = uvs;

  const mesh = new Mesh(name, scene);
  vertexData.applyToMesh(mesh);
  return mesh;
}

/**
 * A closed, flat-shaded mesh from quads (each four corners in order around
 * its edge, either way round). Each quad is turned to face away from
 * `inside`, a point inside the shape, so the shape must be convex about it.
 */
export function createQuadMesh(name: string, scene: Scene, quads: ReadonlyArray<readonly Vector3[]>, inside: Vector3): Mesh {
  const positions: number[] = [];
  const indices: number[] = [];
  const uvs: number[] = [];
  for (const face of quads) {
    const quad = face.map((corner) => corner.clone());
    const [a, b, c] = quad as [Vector3, Vector3, Vector3, Vector3];
    // Babylon's ComputeNormals treats (p1 - p2) x (p3 - p2) as a triangle's outward normal.
    const normal = Vector3.Cross(a.subtract(b), c.subtract(b));
    const faceCenter = quad.reduce((sum, corner) => sum.addInPlace(corner), Vector3.Zero()).scaleInPlace(1 / quad.length);
    if (Vector3.Dot(normal, faceCenter.subtract(inside)) < 0) quad.reverse();
    const base = positions.length / 3;
    for (const corner of quad) positions.push(corner.x, corner.y, corner.z);
    uvs.push(0, 0, 1, 0, 1, 1, 0, 1);
    indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }
  const normals: number[] = [];
  VertexData.ComputeNormals(positions, indices, normals);
  const vertexData = new VertexData();
  vertexData.positions = positions;
  vertexData.indices = indices;
  vertexData.normals = normals;
  vertexData.uvs = uvs;
  const mesh = new Mesh(name, scene);
  vertexData.applyToMesh(mesh);
  return mesh;
}

/**
 * Makes sure a closed mesh's triangles face outwards. Builders such as
 * CreateLathe set their winding from the order of the profile points, which
 * is easy to get backwards; inside-out meshes are invisible from outside.
 */
export function ensureOutwardFacing(mesh: Mesh): void {
  const positions = mesh.getVerticesData(VertexBuffer.PositionKind);
  const normals = mesh.getVerticesData(VertexBuffer.NormalKind);
  if (!positions || !normals) return;

  const vertexCount = positions.length / 3;
  let centerX = 0;
  let centerY = 0;
  let centerZ = 0;
  for (let i = 0; i < positions.length; i += 3) {
    centerX += positions[i] ?? 0;
    centerY += positions[i + 1] ?? 0;
    centerZ += positions[i + 2] ?? 0;
  }
  centerX /= vertexCount;
  centerY /= vertexCount;
  centerZ /= vertexCount;

  // On a closed shape, outward normals point away from the centre on average.
  let alignment = 0;
  for (let i = 0; i < positions.length; i += 3) {
    alignment +=
      ((positions[i] ?? 0) - centerX) * (normals[i] ?? 0) +
      ((positions[i + 1] ?? 0) - centerY) * (normals[i + 1] ?? 0) +
      ((positions[i + 2] ?? 0) - centerZ) * (normals[i + 2] ?? 0);
  }
  if (alignment < 0) mesh.flipFaces(true);
}

function cornerAt(corners: readonly Vector3[], index: number): Vector3 {
  const corner = corners[index];
  if (!corner) throw new Error(`Panel corner ${index} is missing`);
  return corner.clone();
}
