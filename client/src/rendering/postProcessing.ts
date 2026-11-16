import type { Scene } from '@babylonjs/core/scene';
import type { Camera } from '@babylonjs/core/Cameras/camera';
import { DefaultRenderingPipeline } from '@babylonjs/core/PostProcesses/RenderPipeline/Pipelines/defaultRenderingPipeline';
import { ImageProcessingConfiguration } from '@babylonjs/core/Materials/imageProcessingConfiguration';
import { POST_PROCESS_CONFIG } from '../config/graphics';

/**
 * Whole-screen post-processing, applied after the 3D scene is drawn:
 *  - renders into a high-dynamic-range buffer, so bright things (sun, tracers)
 *    can exceed "white" and bloom;
 *  - ACES filmic tone mapping squeezes that range back to the screen
 *    gracefully, keeping detail in both the bright sky and the dark ground;
 *  - bloom: light bleeding around the brightest pixels;
 *  - 4x MSAA on the off-screen buffer (the canvas's own anti-aliasing doesn't
 *    apply to off-screen rendering).
 *
 * Every material now outputs linear colour and the pipeline converts to the
 * display at the end; the custom sky shader does the same (see sky.ts).
 */
export function createPostProcessing(scene: Scene, cameras: Camera[]): DefaultRenderingPipeline | null {
  const config = POST_PROCESS_CONFIG;
  if (!config.enabled) return null;
  const pipeline = new DefaultRenderingPipeline('post-processing', true, scene, cameras);
  pipeline.samples = config.msaaSamples;

  pipeline.imageProcessingEnabled = true;
  const imageProcessing = pipeline.imageProcessing;
  imageProcessing.toneMappingEnabled = true;
  imageProcessing.toneMappingType = ImageProcessingConfiguration.TONEMAPPING_ACES;
  imageProcessing.exposure = config.exposure;
  imageProcessing.contrast = config.contrast;
  imageProcessing.vignetteEnabled = true;
  imageProcessing.vignetteWeight = config.vignetteWeight;

  pipeline.bloomEnabled = true;
  pipeline.bloomThreshold = config.bloomThreshold;
  pipeline.bloomWeight = config.bloomWeight;
  pipeline.bloomKernel = config.bloomKernel;
  pipeline.bloomScale = config.bloomScale;
  return pipeline;
}
