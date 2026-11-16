import type { Scene } from '@babylonjs/core/scene';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import { Mesh } from '@babylonjs/core/Meshes/mesh';
import { VertexData } from '@babylonjs/core/Meshes/mesh.vertexData';
import { RawTexture } from '@babylonjs/core/Materials/Textures/rawTexture';
import { Texture } from '@babylonjs/core/Materials/Textures/texture';
import { Constants } from '@babylonjs/core/Engines/constants';
import { PBRCustomMaterial } from '@babylonjs/materials/custom/pbrCustomMaterial';
import { fbm, type Terrain } from '@dogfight/shared';
import { GROUND_CONFIG, TERRAIN_VISUAL_CONFIG } from '../config/graphics';
import { srgbHexToLinear } from '../rendering/materials';
import { createFarmlandTexture } from './proceduralTextures';

/**
 * The terrain mesh: one vertex per grid point of the shared terrain, and the
 * same two triangles per cell as `Terrain.heightAt`, so the ground you see
 * is exactly the ground you collide with.
 *
 * Material: physically based, with fields from the farmland texture, then
 * forest, rock and snow blended in by a "splat map" (a texture whose
 * channels hold how much of each to use). The splat map is computed from
 * height and slope, so rock appears on steep faces and snow on high peaks.
 */
export function createTerrainMesh(scene: Scene, terrain: Terrain): Mesh {
  const { resolution, origin, cellSize, heights } = terrain;
  const side = resolution + 1;
  const positions = new Float32Array(side * side * 3);
  const uvs = new Float32Array(side * side * 2);
  for (let j = 0; j < side; j++) {
    for (let i = 0; i < side; i++) {
      const v = j * side + i;
      positions[v * 3] = origin + i * cellSize;
      positions[v * 3 + 1] = heights[v] ?? 0;
      positions[v * 3 + 2] = origin + j * cellSize;
      uvs[v * 2] = i / resolution;
      uvs[v * 2 + 1] = j / resolution;
    }
  }
  // Two triangles per cell, split along the (1,0)-(0,1) diagonal: the same
  // split heightAt uses. Winding gives upward-facing normals.
  const indices = new Uint32Array(resolution * resolution * 6);
  let k = 0;
  for (let j = 0; j < resolution; j++) {
    for (let i = 0; i < resolution; i++) {
      const v00 = j * side + i;
      const v10 = v00 + 1;
      const v01 = v00 + side;
      const v11 = v01 + 1;
      // Order chosen so Babylon's (p1 - p2) x (p3 - p2) normal points up (+Y).
      indices.set([v00, v10, v01, v10, v11, v01], k);
      k += 6;
    }
  }
  const normals = new Float32Array(positions.length);
  VertexData.ComputeNormals(positions, indices, normals);

  const vertexData = new VertexData();
  vertexData.positions = positions;
  vertexData.indices = indices;
  vertexData.normals = normals;
  vertexData.uvs = uvs;
  const mesh = new Mesh('terrain', scene);
  vertexData.applyToMesh(mesh);
  // If the winding came out inverted the normals point down; flip the faces.
  if ((mesh.getVerticesData('normal')?.[1] ?? 1) < 0) mesh.flipFaces(true);
  mesh.isPickable = false;
  mesh.receiveShadows = true;
  mesh.material = createTerrainMaterial(scene, terrain);
  mesh.freezeWorldMatrix();
  return mesh;
}

function createTerrainMaterial(scene: Scene, terrain: Terrain): PBRCustomMaterial {
  const material = new PBRCustomMaterial('terrain-material', scene);
  const fields = createFarmlandTexture(scene);
  const repeats = terrain.size / GROUND_CONFIG.textureTileSize;
  fields.uScale = repeats;
  fields.vScale = repeats;
  material.albedoTexture = fields;
  material.roughness = 1;
  material.metallic = 0;

  const config = TERRAIN_VISUAL_CONFIG;
  material.AddUniform('terrainSplat', 'sampler2D', createSplatMap(scene, terrain));
  material.AddUniform('terrainGrain', 'sampler2D', createGrainTexture(scene));
  material.AddUniform('grainRepeats', 'float', terrain.size / config.grainTileSize);
  // World XZ -> 0-1 across the terrain: uv = xz * scale + offset.
  material.AddUniform('terrainUvScale', 'float', 1 / terrain.size);
  material.AddUniform('terrainUvOffset', 'float', -terrain.origin / terrain.size);
  // PBR maths runs in linear colour space.
  const linear = (hex: string) => {
    const c = srgbHexToLinear(hex);
    return new Vector3(c.r, c.g, c.b);
  };
  material.AddUniform('rockColor', 'vec3', linear(config.rockColor));
  material.AddUniform('snowColor', 'vec3', linear(config.snowColor));
  material.AddUniform('forestColor', 'vec3', linear(config.forestColor));
  // Injected into Babylon's PBR shader after the albedo texture is sampled:
  // blend forest, then rock, then snow over the fields, each with fine grain.
  // The splat coordinates come from the world position (vPositionW), which
  // the PBR shader always declares. The mesh's own UV varying (vMainUV1) is
  // only declared when some texture samples UV1 untransformed; the tiled
  // fields texture uses its own transformed varying, so vMainUV1 is absent.
  material.Fragment_Custom_Albedo(`
    vec2 terrainUv = vPositionW.xz * terrainUvScale + terrainUvOffset;
    vec4 splat = texture2D(terrainSplat, terrainUv);
    float grain = texture2D(terrainGrain, terrainUv * grainRepeats).r;
    surfaceAlbedo = mix(surfaceAlbedo, forestColor * (0.7 + 0.6 * grain), splat.b);
    surfaceAlbedo = mix(surfaceAlbedo, rockColor * (0.65 + 0.7 * grain), splat.r);
    surfaceAlbedo = mix(surfaceAlbedo, snowColor * (0.9 + 0.2 * grain), splat.g);
  `);
  return material;
}

/** RGBA weights per texel: R = rock, G = snow, B = forest. Row 0 is the terrain's south edge (v = 0). */
function createSplatMap(scene: Scene, terrain: Terrain): RawTexture {
  const config = TERRAIN_VISUAL_CONFIG;
  const size = config.splatResolution;
  const data = new Uint8Array(size * size * 4);
  const step = terrain.size / size;
  const probe = terrain.cellSize;
  for (let row = 0; row < size; row++) {
    for (let col = 0; col < size; col++) {
      const x = terrain.origin + (col + 0.5) * step;
      const z = terrain.origin + (row + 0.5) * step;
      const h = terrain.heightAt(x, z);
      // Slope from central differences over one grid cell.
      const dhdx = (terrain.heightAt(x + probe, z) - terrain.heightAt(x - probe, z)) / (2 * probe);
      const dhdz = (terrain.heightAt(x, z + probe) - terrain.heightAt(x, z - probe)) / (2 * probe);
      const slope = Math.hypot(dhdx, dhdz);
      const variation = fbm(x / 400, z / 400, 3, 77) * 120; // ragged snow and rock lines
      const rock = clamp01(smoothstep(config.rockSlopeStart, config.rockSlopeEnd, slope) + 0.7 * smoothstep(config.rockAltitudeStart, config.rockAltitudeStart + 300, h + variation));
      const snow = smoothstep(config.snowAltitudeStart, config.snowAltitudeEnd, h + variation) * (1 - 0.6 * smoothstep(0.8, 1.2, slope));
      // Forest patches on natural ground only: not on the dead-flat airfields.
      const natural = smoothstep(0.003, 0.02, slope);
      const forest = smoothstep(config.forestThreshold, config.forestThreshold + 0.2, fbm(x / config.forestWavelength, z / config.forestWavelength, 4, 313)) * natural * (1 - rock) * (1 - snow);
      const o = (row * size + col) * 4;
      data[o] = Math.round(rock * 255);
      data[o + 1] = Math.round(snow * 255);
      data[o + 2] = Math.round(forest * 255);
      data[o + 3] = 255;
    }
  }
  const texture = RawTexture.CreateRGBATexture(data, size, size, scene, true, false, Constants.TEXTURE_TRILINEAR_SAMPLINGMODE);
  texture.wrapU = Texture.CLAMP_ADDRESSMODE;
  texture.wrapV = Texture.CLAMP_ADDRESSMODE;
  return texture;
}

/** Tiling greyscale noise for close-up grain on rock, snow and forest. */
function createGrainTexture(scene: Scene): RawTexture {
  const size = 256;
  const data = new Uint8Array(size * size * 4);
  for (let row = 0; row < size; row++) {
    for (let col = 0; col < size; col++) {
      // Periodic noise: sample on a torus-like wrap so the tile repeats seamlessly.
      const value = 0.5 + 0.5 * (0.6 * tileNoise(col, row, size, 16) + 0.4 * tileNoise(col, row, size, 64));
      const o = (row * size + col) * 4;
      const byte = Math.round(clamp01(value) * 255);
      data[o] = byte;
      data[o + 1] = byte;
      data[o + 2] = byte;
      data[o + 3] = 255;
    }
  }
  const texture = RawTexture.CreateRGBATexture(data, size, size, scene, true, false, Constants.TEXTURE_TRILINEAR_SAMPLINGMODE);
  texture.wrapU = Texture.WRAP_ADDRESSMODE;
  texture.wrapV = Texture.WRAP_ADDRESSMODE;
  return texture;
}

/** Value noise with `cells` lattice cells per tile that wraps exactly at the tile edge. */
function tileNoise(x: number, y: number, size: number, cells: number): number {
  const gx = (x / size) * cells;
  const gy = (y / size) * cells;
  const ix = Math.floor(gx);
  const iy = Math.floor(gy);
  const fx = gx - ix;
  const fy = gy - iy;
  const u = fx * fx * (3 - 2 * fx);
  const v = fy * fy * (3 - 2 * fy);
  const lattice = (a: number, b: number) => {
    const wa = ((a % cells) + cells) % cells;
    const wb = ((b % cells) + cells) % cells;
    let h = Math.imul(wa, 374_761_393) + Math.imul(wb, 668_265_263) + Math.imul(cells, 1_442_695_041);
    h = Math.imul(h ^ (h >>> 13), 1_274_126_177);
    return (((h ^ (h >>> 16)) >>> 0) / 4_294_967_295) * 2 - 1;
  };
  const a = lattice(ix, iy);
  const b = lattice(ix + 1, iy);
  const c = lattice(ix, iy + 1);
  const d = lattice(ix + 1, iy + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = clamp01((x - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
}

function clamp01(x: number): number {
  return Math.max(0, Math.min(1, x));
}
