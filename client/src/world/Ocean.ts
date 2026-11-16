import type { Scene } from '@babylonjs/core/scene';
import { Color3 } from '@babylonjs/core/Maths/math.color';
import type { Vector3 } from '@babylonjs/core/Maths/math.vector';
import type { Mesh } from '@babylonjs/core/Meshes/mesh';
import { CreateGround } from '@babylonjs/core/Meshes/Builders/groundBuilder';
import { ShaderMaterial } from '@babylonjs/core/Materials/shaderMaterial';
import { RawTexture } from '@babylonjs/core/Materials/Textures/rawTexture';
import { Texture } from '@babylonjs/core/Materials/Textures/texture';
import { Constants } from '@babylonjs/core/Engines/constants';
import { WORLD_CONFIG, type Terrain } from '@dogfight/shared';
import { POST_PROCESS_CONFIG, SKY_CONFIG, WATER_CONFIG } from '../config/graphics';
import { degreesToRadians } from '../math/orientation';
import oceanVertexShader from './shaders/ocean.vertex.glsl?raw';
import oceanFragmentShader from './shaders/ocean.fragment.glsl?raw';

/**
 * The sea surface at WORLD_CONFIG.seaLevel.
 *
 * A flat plane larger than the view distance, kept centred under the camera
 * so the sea always reaches the horizon. All shading is computed from world
 * position, so moving it never makes the waves swim.
 *
 * Why a custom shader rather than Babylon's WaterMaterial: WaterMaterial
 * re-renders the scene into reflection and refraction textures every frame,
 * which roughly doubles the draw cost, too much for a MacBook Air. Here the
 * reflection is the sky gradient itself (computed in the shader from the
 * same formula as the sky), and the water's colour comes from a depth map
 * baked once from the terrain: one draw call, no extra passes.
 *
 * Depth precision: the sea plane and the sea bed just below it are almost
 * the same distance from the camera, and far away the depth buffer can't
 * tell them apart, which flickers. So the terrain mesh draws sea bed more
 * than 1.5 m down much deeper than it really is (see terrainMesh.ts). A
 * polygon offset on the water would be simpler, but at the grazing angles
 * seen from altitude it pulls the sea over low coastal land.
 */
export class Ocean {
  readonly mesh: Mesh;
  private readonly material: ShaderMaterial;
  private time = 0;

  constructor(scene: Scene, terrain: Terrain, directionToSun: Vector3) {
    const config = WATER_CONFIG;
    this.mesh = CreateGround('ocean', { width: config.size, height: config.size, subdivisions: 1 }, scene);
    this.mesh.position.y = WORLD_CONFIG.seaLevel;
    this.mesh.isPickable = false;
    // It always surrounds the camera; skip frustum culling.
    this.mesh.alwaysSelectAsActiveMesh = true;

    this.material = new ShaderMaterial(
      'ocean-material',
      scene,
      { vertexSource: oceanVertexShader, fragmentSource: oceanFragmentShader },
      {
        attributes: ['position'],
        uniforms: [
          'world',
          'viewProjection',
          'cameraPosition',
          'time',
          'zenithColor',
          'horizonColor',
          'gradientSharpness',
          'sunDirection',
          'sunColor',
          'deepColor',
          'shallowColor',
          'foamColor',
          'shallowDepth',
          'foamDepth',
          'depthMapScale',
          'depthMapOffset',
          'depthMapRange',
          'waves',
          'fresnelF0',
          'sunGlintPower',
          'sunGlintIntensity',
          'sheenPower',
          'sheenIntensity',
          'fogDensity',
          'fogColor',
          'outputLinear',
        ],
        samplers: ['depthMap'],
      },
    );
    const m = this.material;
    m.setColor3('zenithColor', Color3.FromHexString(SKY_CONFIG.zenithColor));
    m.setColor3('horizonColor', Color3.FromHexString(SKY_CONFIG.horizonColor));
    m.setFloat('gradientSharpness', SKY_CONFIG.gradientSharpness);
    m.setVector3('sunDirection', directionToSun);
    m.setColor3('sunColor', Color3.FromHexString(SKY_CONFIG.sunColor));
    m.setColor3('deepColor', Color3.FromHexString(config.deepColor));
    m.setColor3('shallowColor', Color3.FromHexString(config.shallowColor));
    m.setColor3('foamColor', Color3.FromHexString(config.foamColor));
    m.setFloat('shallowDepth', config.shallowDepth);
    m.setFloat('foamDepth', config.foamDepth);
    m.setTexture('depthMap', createDepthMap(scene, terrain));
    m.setFloat('depthMapScale', 1 / terrain.size);
    m.setFloat('depthMapOffset', -terrain.origin / terrain.size);
    m.setFloat('depthMapRange', config.depthMapRange);
    m.setArray4(
      'waves',
      config.waves.flatMap((wave) => {
        const direction = degreesToRadians(wave.directionDeg);
        return [Math.sin(direction), Math.cos(direction), (2 * Math.PI) / wave.wavelength, wave.amplitude];
      }),
    );
    m.setFloat('fresnelF0', config.fresnelF0);
    m.setFloat('sunGlintPower', config.sunGlintPower);
    m.setFloat('sunGlintIntensity', config.sunGlintIntensity);
    m.setFloat('sheenPower', config.sheenPower);
    m.setFloat('sheenIntensity', config.sheenIntensity);
    m.setFloat('fogDensity', scene.fogDensity);
    m.setColor3('fogColor', scene.fogColor);
    m.setFloat('outputLinear', POST_PROCESS_CONFIG.enabled ? 1 : 0);
    this.mesh.material = m;
  }

  /** Keep the sea under the camera and advance the waves. */
  update(deltaSeconds: number, cameraPosition: Vector3): void {
    this.time += deltaSeconds;
    this.mesh.position.x = cameraPosition.x;
    this.mesh.position.z = cameraPosition.z;
    this.material.setFloat('time', this.time);
    this.material.setVector3('cameraPosition', cameraPosition);
  }
}

/**
 * Water depth over the terrain, baked once: each texel holds how far below
 * the sea surface the terrain lies there, 0 (dry land or the waterline) to
 * 1 (depthMapRange metres or deeper). Clamped at the edges, which are open
 * sea, so the map reads "deep" everywhere beyond the terrain.
 */
function createDepthMap(scene: Scene, terrain: Terrain): RawTexture {
  const size = WATER_CONFIG.depthMapResolution;
  const range = WATER_CONFIG.depthMapRange;
  const data = new Uint8Array(size * size * 4);
  for (let row = 0; row < size; row++) {
    for (let col = 0; col < size; col++) {
      const x = terrain.origin + ((col + 0.5) / size) * terrain.size;
      const z = terrain.origin + ((row + 0.5) / size) * terrain.size;
      const depth = Math.max(0, Math.min(1, (WORLD_CONFIG.seaLevel - terrain.heightAt(x, z)) / range));
      const o = (row * size + col) * 4;
      data[o] = data[o + 1] = data[o + 2] = Math.round(depth * 255);
      data[o + 3] = 255;
    }
  }
  const texture = RawTexture.CreateRGBATexture(data, size, size, scene, false, false, Constants.TEXTURE_BILINEAR_SAMPLINGMODE);
  texture.wrapU = Texture.CLAMP_ADDRESSMODE;
  texture.wrapV = Texture.CLAMP_ADDRESSMODE;
  return texture;
}
