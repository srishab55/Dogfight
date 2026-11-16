/**
 * Visual settings. Nothing here affects gameplay, so the server never reads it.
 *
 * Colours are sRGB hex strings, the same values a colour picker shows. Code that
 * feeds physically based (PBR) materials converts them to linear space.
 */

export const RENDER_CONFIG = {
  antialias: true,
  /**
   * Upper limit on the device pixel ratio. Retina screens report 2; rendering at
   * 2x means four times the pixels of 1x. Lower this to 1.5 or 1 if profiling
   * shows the GPU is the bottleneck.
   */
  maxDevicePixelRatio: 2,
  /**
   * Largest frame delta passed to update code, in seconds. When a backgrounded tab
   * resumes, the real delta can be many seconds; clamping avoids a giant jump.
   */
  maxFrameDeltaSeconds: 0.1,
  /**
   * Camera clip planes (m). Depth precision depends mostly on the near plane,
   * so it is as large as possible. The far plane sets how far away the sky box
   * can be (see sky.ts).
   */
  cameraNearPlane: 1,
  cameraFarPlane: 30_000,
} as const;

export const SKY_CONFIG = {
  zenithColor: '#2e62a8',
  /** Also used as the fog colour, so distant terrain dissolves seamlessly into the sky. */
  horizonColor: '#bfd3e6',
  /** How quickly the sky turns from horizon haze to zenith blue as you look up. Higher = thinner haze band. */
  gradientSharpness: 3.5,
  sunColor: '#fff1d6',
  /** Angular radius of the visible sun disc in degrees (the real sun is about 0.27). */
  sunDiscRadiusDegrees: 0.7,
  /** Strength of the glow around the sun. */
  sunGlowIntensity: 0.55,
} as const;

export const SUN_CONFIG = {
  /** Sun height above the horizon in degrees. */
  elevationDegrees: 38,
  /** Compass direction of the sun in degrees clockwise from +Z (north). */
  azimuthDegrees: 215,
} as const;

export const FOG_CONFIG = {
  /** Distance (m) at which objects are 95% hidden by haze. */
  visibilityDistance: 12_000,
} as const;

export const LIGHTING_CONFIG = {
  sunIntensity: 1.7,
  sunColor: '#fff4e3',
  /** Sky fill light (hemispheric): blue from above, warm bounce from below. */
  ambientIntensity: 0.55,
  ambientSkyColor: '#c4d8f0',
  /**
   * Sunlit grass reflects roughly 20% of the light hitting it, so surfaces
   * facing the ground (wing undersides, an inverted aircraft's top) get a
   * noticeable warm fill. Too dark here makes your own aircraft unreadable.
   */
  ambientGroundColor: '#a89f88',
} as const;

export const SHADOW_CONFIG = {
  enabled: true,
  /** Shadow map resolution in texels. The map covers only the aircraft, so 1024 is very sharp. */
  mapSize: 1024,
  /** How far the shadow "camera" sits behind the aircraft, along the sun direction (m). */
  lightDistance: 300,
  /** Depth range of the shadow camera (m). The ground only receives the shadow while within this range. */
  depthRange: 900,
  bias: 0.0005,
  normalBias: 0.02,
} as const;

export const GROUND_CONFIG = {
  /**
   * Visual ground size (m). Much larger than the 12 km playable area, so from
   * anywhere a player can fly the ground reaches past the sky box (16.5 km
   * away) and its edge is never seen.
   */
  visualSize: 50_000,
  /** World size covered by one repeat of the procedural ground texture (m). */
  textureTileSize: 400,
  /** Resolution of the procedural ground texture in pixels. */
  textureResolution: 1024,
  /** Field colours for the procedural farmland texture. */
  fieldColors: ['#5d7a3a', '#6b8640', '#4f6e34', '#7a8a45', '#8a8550', '#6f6a40', '#587436'],
  hedgeColor: '#3c5228',
} as const;

/** Cumulus clouds built from soft billboard puffs. Purely visual: they don't block bullets or the server's view. */
export const CLOUD_CONFIG = {
  enabled: true,
  count: 40,
  seed: 77,
  /** Clouds are spread over this square around the map centre (m). */
  areaSize: 18_000,
  baseAltitudeMin: 1_100,
  baseAltitudeMax: 1_650,
  puffsMin: 8,
  puffsMax: 16,
  /** Horizontal and vertical spread of a cloud's puffs (m). */
  clusterRadius: [220, 520] as const,
  clusterHeight: [60, 160] as const,
  puffSize: [140, 330] as const,
  topColor: '#ffffff',
  baseColor: '#b9c3cf',
  opacity: 0.85,
  /** Puffs fade out between these distances from the camera when you fly into them (m). */
  fadeStart: 260,
  fadeEnd: 60,
} as const;

/**
 * Whole-screen post-processing: tone mapping (filmic ACES, so bright sky and
 * dark ground both keep detail), bloom (tracers, sun and explosions glow)
 * and multisample anti-aliasing for the off-screen render.
 */
export const POST_PROCESS_CONFIG = {
  enabled: true,
  msaaSamples: 4,
  exposure: 1.15,
  contrast: 1.08,
  bloomThreshold: 0.85,
  bloomWeight: 0.35,
  bloomKernel: 64,
  bloomScale: 0.5,
  vignetteWeight: 1.2,
} as const;

/** Small camera effects that sell speed and violence. */
export const CAMERA_EFFECTS_CONFIG = {
  /** Field of view widens with speed above this (m/s)... */
  fovSpeedStart: 90,
  /** ...by this many degrees per 100 m/s, up to the maximum. */
  fovDegreesPer100: 6,
  fovMaxExtraDegrees: 9,
  /** Camera shake amplitude (m) at full stall buffet, while firing, and per g above 4 g. */
  stallShake: 0.18,
  firingShake: 0.05,
  gShakePerG: 0.025,
  /** How fast the shake jitters (Hz). */
  shakeFrequency: 17,
} as const;

/** How the terrain is painted. Its shape comes from shared/src/config/terrain.ts. */
export const TERRAIN_VISUAL_CONFIG = {
  /** Resolution of the rock/snow/forest weight map over the whole terrain (texels per side). */
  splatResolution: 512,
  /** Fine grain on rock, snow and forest: one repeat per this many metres. */
  grainTileSize: 75,
  rockColor: '#7d7467',
  snowColor: '#eef2f6',
  forestColor: '#2f4527',
  /** Slope (rise over run) where grass gives way to rock. */
  rockSlopeStart: 0.35,
  rockSlopeEnd: 0.7,
  /** Altitude (m) where rock and then snow take over. */
  rockAltitudeStart: 650,
  snowAltitudeStart: 1_000,
  snowAltitudeEnd: 1_250,
  /** Forest patch noise: wavelength (m) and the share of hillsides covered (higher threshold = less forest). */
  forestWavelength: 1_100,
  forestThreshold: 0.12,
  /** The flat far ground sits this far below the terrain so the two never flicker against each other (m). */
  outerGroundDrop: 3,
} as const;

export const RUNWAY_VISUAL_CONFIG = {
  asphaltColor: '#3a3c3e',
  markingColor: '#e8e8e2',
  /** Height of the runway surface above the ground (m). Just enough to stay on top visually. */
  surfaceOffset: 0.03,
} as const;
