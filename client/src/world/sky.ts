import { Scene } from '@babylonjs/core/scene';
import { Color3, Color4 } from '@babylonjs/core/Maths/math.color';
import type { Vector3 } from '@babylonjs/core/Maths/math.vector';
import type { Mesh } from '@babylonjs/core/Meshes/mesh';
import { CreateBox } from '@babylonjs/core/Meshes/Builders/boxBuilder';
import { ShaderMaterial } from '@babylonjs/core/Materials/shaderMaterial';
import { FOG_CONFIG, POST_PROCESS_CONFIG, RENDER_CONFIG, SKY_CONFIG } from '../config/graphics';
import { degreesToRadians } from '../math/orientation';
import skyVertexShader from './shaders/sky.vertex.glsl?raw';
import skyFragmentShader from './shaders/sky.fragment.glsl?raw';

/**
 * Procedural gradient sky with a sun disc, drawn on a box that follows the
 * camera.
 *
 * Why a custom shader rather than Babylon's SkyMaterial: SkyMaterial models
 * atmospheric scattering, but its horizon colour depends on many parameters and
 * cannot be matched exactly to the fog colour, which leaves a visible seam
 * where the ground's far edge meets the sky. Here the horizon colour *is* the
 * fog colour. It is also one less dependency (@babylonjs/materials).
 */
export function createSky(scene: Scene, directionToSun: Vector3): Mesh {
  // The box must fit inside the camera's far plane even at its corners, which
  // are sqrt(3) times further away than its faces: 0.55 * sqrt(3) = 0.95 of
  // the far plane. Its faces must also be far enough away for the ground they
  // hide to be fully fogged (16.5 km at the default settings: >99.5% haze).
  const halfExtent = RENDER_CONFIG.cameraFarPlane * 0.55;
  const sky = CreateBox('sky', { size: halfExtent * 2 }, scene);
  sky.infiniteDistance = true; // keep the box centred on the camera
  sky.applyFog = false; // the shader already draws the haze
  sky.isPickable = false;
  sky.alwaysSelectAsActiveMesh = true; // skip frustum culling; it always surrounds the camera

  const material = new ShaderMaterial(
    'sky-material',
    scene,
    { vertexSource: skyVertexShader, fragmentSource: skyFragmentShader },
    {
      attributes: ['position'],
      uniforms: [
        'worldViewProjection',
        'zenithColor',
        'horizonColor',
        'gradientSharpness',
        'sunDirection',
        'sunColor',
        'sunDiscCosine',
        'sunGlowIntensity',
        'outputLinear',
      ],
    },
  );
  material.setFloat('outputLinear', POST_PROCESS_CONFIG.enabled ? 1 : 0);
  // We look at the box from inside, so its inward-facing back faces must draw.
  material.backFaceCulling = false;
  material.setColor3('zenithColor', Color3.FromHexString(SKY_CONFIG.zenithColor));
  material.setColor3('horizonColor', Color3.FromHexString(SKY_CONFIG.horizonColor));
  material.setFloat('gradientSharpness', SKY_CONFIG.gradientSharpness);
  material.setVector3('sunDirection', directionToSun);
  material.setColor3('sunColor', Color3.FromHexString(SKY_CONFIG.sunColor));
  material.setFloat('sunDiscCosine', Math.cos(degreesToRadians(SKY_CONFIG.sunDiscRadiusDegrees)));
  material.setFloat('sunGlowIntensity', SKY_CONFIG.sunGlowIntensity);
  sky.material = material;

  return sky;
}

/**
 * Exponential-squared distance fog in the horizon colour.
 *
 * EXP2 fog keeps fraction f = exp(-(density * d)^2) of an object's colour at
 * distance d. Solving for "95% hidden" (f = 0.05) at the configured
 * visibility distance gives density = sqrt(-ln 0.05) / visibility.
 */
export function applyAtmosphere(scene: Scene): void {
  const horizon = Color3.FromHexString(SKY_CONFIG.horizonColor);
  scene.fogMode = Scene.FOGMODE_EXP2;
  scene.fogColor = horizon;
  scene.fogDensity = Math.sqrt(-Math.log(0.05)) / FOG_CONFIG.visibilityDistance;
  // Only visible for a frame before the sky draws, but keeps resizes seamless.
  scene.clearColor = new Color4(horizon.r, horizon.g, horizon.b, 1);
}
