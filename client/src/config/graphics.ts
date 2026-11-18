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
  /** Shadow map resolution in texels (the Medium setting; High doubles it). */
  mapSize: 1024,
  /**
   * Width of the square the shadow map covers around the aircraft (m):
   * 1024 texels over 160 m is 16 cm each. Fitting the map to the casters
   * instead stretched it over every building on the map, and the aircraft's
   * shadow shrank to nothing.
   */
  frustumSize: 160,
  /** Only casters whose bounds come within this of the aircraft are drawn into the map (m): half the square plus a margin. */
  cullRadius: 160,
  /** How often that list is rebuilt (s): at 150 m/s nothing crosses the margin in between. */
  cullInterval: 0.25,
  /** How far the shadow "camera" sits behind the aircraft, along the sun direction (m). */
  lightDistance: 300,
  /** Depth range of the shadow camera (m). The ground only receives the shadow while within this range. */
  depthRange: 900,
  bias: 0.0005,
  normalBias: 0.02,
} as const;

/** The procedural farmland texture on the islands' plains. */
export const GROUND_CONFIG = {
  /** World size covered by one repeat of the procedural ground texture (m). */
  textureTileSize: 400,
  /** Resolution of the procedural ground texture in pixels. */
  textureResolution: 1024,
  /** Field colours for the procedural farmland texture. */
  fieldColors: ['#5d7a3a', '#6b8640', '#4f6e34', '#7a8a45', '#8a8550', '#6f6a40', '#587436'],
  hedgeColor: '#3c5228',
} as const;

/**
 * The sea: a large plane that follows the camera, shaded by a custom shader
 * (world/shaders/ocean.*.glsl). Colour comes from depth (turquoise shallows,
 * deep blue offshore, surf on the beaches); the surface reflects the sky
 * through a Fresnel term and glints with the sun.
 */
export const WATER_CONFIG = {
  /** Side of the sea plane (m): it reaches past the far plane from any camera position. */
  size: 64_000,
  deepColor: '#0b2c47',
  shallowColor: '#2a8c97',
  foamColor: '#eef5f4',
  /** Depth (m) over which the colour goes from shallow to deep. */
  shallowDepth: 16,
  /** Surf shows where the water is shallower than this (m). */
  foamDepth: 0.9,
  /** The depth map stores 0 to this many metres (deeper reads as this). */
  depthMapRange: 30,
  depthMapResolution: 512,
  /**
   * Swell and chop: directional waves, longest first. Only their slopes are
   * drawn (the surface itself stays flat); each fades out with distance
   * before it gets small enough on screen to shimmer.
   */
  waves: [
    { wavelength: 83, amplitude: 0.75, directionDeg: 25 },
    { wavelength: 51, amplitude: 0.42, directionDeg: -18 },
    { wavelength: 31, amplitude: 0.22, directionDeg: 67 },
    { wavelength: 19, amplitude: 0.11, directionDeg: 4 },
    { wavelength: 11.3, amplitude: 0.055, directionDeg: -52 },
    { wavelength: 6.9, amplitude: 0.03, directionDeg: 38 },
    { wavelength: 4.1, amplitude: 0.015, directionDeg: 101 },
    { wavelength: 2.4, amplitude: 0.008, directionDeg: -11 },
  ],
  /** Fraction of light reflected looking straight down (water: about 2%). */
  fresnelF0: 0.02,
  /** The sun's mirror glint: sharpness and brightness (HDR, so it blooms). */
  sunGlintPower: 900,
  sunGlintIntensity: 7,
  /** Broad sheen around the glint. */
  sheenPower: 60,
  sheenIntensity: 0.12,
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
  /**
   * Multisample anti-aliasing of the off-screen render. 2x is enough on a
   * Retina screen (already rendered at twice the resolution) and measured
   * about 1 ms a frame cheaper than 4x.
   */
  msaaSamples: 2,
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
  /** Impact shake at full trauma (m), and how fast trauma fades (per second: a full-trauma punch settles in under a second). */
  traumaShake: 1.1,
  traumaDecayPerSecond: 1.3,
} as const;

/** How the terrain is painted. Its shape comes from shared/src/config/terrain.ts. */
export const TERRAIN_VISUAL_CONFIG = {
  /** Resolution of the rock/sand/forest weight map over the whole terrain (texels per side). */
  splatResolution: 512,
  /** Fine grain on rock, sand and forest: one repeat per this many metres. */
  grainTileSize: 75,
  rockColor: '#7a7062',
  sandColor: '#d6c69c',
  forestColor: '#2c4426',
  /** Slope (rise over run) where grass gives way to rock. */
  rockSlopeStart: 0.4,
  rockSlopeEnd: 0.8,
  /** Height above the sea (m) where bare rock takes over the mountain tops. */
  rockAltitudeStart: 480,
  /** Beaches: sand up to this height above the sea (m), on slopes gentler than this. */
  sandMaxHeight: 3.5,
  sandMaxSlope: 0.3,
  /** Forest patch noise: wavelength (m) and the share of the plains covered (higher threshold = less forest). */
  forestWavelength: 800,
  forestThreshold: 0.15,
  /** Hillsides steeper than this are wooded (fields stay on gentler ground). */
  forestSlopeStart: 0.12,
  forestSlopeEnd: 0.3,
  /**
   * Sea bed deeper than this (m below the surface) is drawn deeper still,
   * by this factor. It's never seen (the sea is opaque), and keeping it
   * well below the water surface stops the two flickering in the depth
   * buffer far away. Physics uses the true heights.
   */
  hiddenSeabedDepth: 1.5,
  hiddenSeabedStretch: 4,
} as const;

/** Anchored aircraft carriers. Their size and layout come from shared/src/config/world.ts. */
export const CARRIER_VISUAL_CONFIG = {
  hullColor: '#58616a',
  deckColor: '#7b7264',
  deckPlankColor: '#71685b',
  deckMarkingColor: '#e8e4d8',
  islandColor: '#646d77',
  darkColor: '#2a2e33',
  /** Hull draft below the sea (m): hidden, but stops the waterline showing a gap. */
  draft: 9,
  /** Flight deck thickness (m). */
  deckThickness: 1.2,
  /** Deck texture: pixels per metre along the deck. */
  deckTexturePixelsPerMetre: 4,
  /** Distance from the stern of the large white hull number painted on the bow end of the deck (m). */
  deckNumberFromBow: 30,
} as const;

export const RUNWAY_VISUAL_CONFIG = {
  asphaltColor: '#3a3c3e',
  markingColor: '#e8e8e2',
  /** Height of the runway surface above the ground (m). Just enough to stay on top visually. */
  surfaceOffset: 0.03,
} as const;
