precision highp float;

varying vec3 vWorld;

uniform vec3 cameraPosition;
uniform float time;

// Sky gradient: the same formula and colours as the sky shader, so the sea
// reflects the sky you actually see.
uniform vec3 zenithColor;
uniform vec3 horizonColor;
uniform float gradientSharpness;
uniform vec3 sunDirection;   // unit vector towards the sun
uniform vec3 sunColor;

uniform vec3 deepColor;
uniform vec3 shallowColor;
uniform vec3 foamColor;
uniform float shallowDepth;
uniform float foamDepth;

// Water depth over the terrain, 0-1 of depthMapRange metres. uv = xz * scale + offset.
uniform sampler2D depthMap;
uniform float depthMapScale;
uniform float depthMapOffset;
uniform float depthMapRange;

// xy: unit direction of travel; z: wave number k = 2 pi / wavelength; w: amplitude (m).
uniform vec4 waves[8];

uniform float fresnelF0;
uniform float sunGlintPower;
uniform float sunGlintIntensity;
uniform float sheenPower;
uniform float sheenIntensity;

uniform float fogDensity;
uniform vec3 fogColor;
// 1 when a post-process applies tone mapping and gamma itself: output linear colour.
uniform float outputLinear;

vec3 toLinear(vec3 c) {
  return pow(max(c, vec3(0.0)), vec3(2.2));
}

vec3 skyColor(vec3 direction) {
  float elevation = max(direction.y, 0.0);
  float zenithBlend = 1.0 - pow(1.0 - elevation, gradientSharpness);
  return mix(horizonColor, zenithColor, zenithBlend);
}

void main() {
  vec3 toCamera = cameraPosition - vWorld;
  float dist = length(toCamera);
  vec3 view = toCamera / dist;

  // Surface slope from a sum of travelling sine waves. Deep-water waves
  // travel at omega = sqrt(g k). Each wave fades out with distance before it
  // shrinks to a few pixels, where it would only shimmer.
  // A slow warp of the sampling position bends the wave crests, so the
  // sum of straight sine waves doesn't read as a regular grid.
  vec2 p = vWorld.xz;
  p += 6.0 * vec2(sin(p.y * 0.011 + 1.3), sin(p.x * 0.013 + 0.4));
  vec2 slope = vec2(0.0);
  for (int i = 0; i < 8; i++) {
    vec4 wave = waves[i];
    float k = wave.z;
    float phase = k * dot(wave.xy, p) - sqrt(9.81 * k) * time + float(i) * 1.7;
    // Gone by about 40 wavelengths away: further off, it would alias into moire rings.
    float fade = clamp(1.0 - dist * k / 250.0, 0.0, 1.0);
    slope += wave.xy * (wave.w * k * cos(phase) * fade);
  }
  vec3 normal = normalize(vec3(-slope.x, 1.0, -slope.y));

  float depth = texture2D(depthMap, vWorld.xz * depthMapScale + depthMapOffset).r * depthMapRange;

  // Fresnel (Schlick): water mirrors the sky at grazing angles and shows its own colour looking down.
  float facing = max(dot(normal, view), 0.0);
  float fresnel = fresnelF0 + (1.0 - fresnelF0) * pow(1.0 - facing, 5.0);
  vec3 reflected = reflect(-view, normal);
  reflected.y = abs(reflected.y); // waves can't reflect what's below the horizon
  vec3 sky = toLinear(skyColor(reflected));

  // Body colour: turquoise over sand in the shallows, deep blue offshore.
  float shallow = 1.0 - smoothstep(0.0, shallowDepth, depth);
  vec3 body = mix(toLinear(deepColor), toLinear(shallowColor), shallow * shallow);
  body *= clamp(sunDirection.y * 1.4 + 0.25, 0.25, 1.0);

  vec3 color = mix(body, sky, fresnel);

  // Sun glint: a sharp mirror highlight (bright enough to bloom) and a broad sheen.
  float towardsSun = max(dot(reflected, sunDirection), 0.0);
  color += toLinear(sunColor) * (pow(towardsSun, sunGlintPower) * sunGlintIntensity + pow(towardsSun, sheenPower) * sheenIntensity);

  // Surf on the beaches, broken into moving bands.
  float surf = 1.0 - smoothstep(0.0, foamDepth, depth);
  float bands = 0.55 + 0.45 * sin(dot(vWorld.xz, vec2(0.31, 0.23)) + time * 1.4);
  color = mix(color, toLinear(foamColor), clamp(surf * bands, 0.0, 1.0));

  // Haze: the scene's EXP2 fog, in the horizon colour, exactly as the sky fades to it.
  float fog = exp(-pow(fogDensity * dist, 2.0));
  color = mix(toLinear(fogColor), color, fog);

  color = mix(pow(color, vec3(1.0 / 2.2)), color, outputLinear);
  gl_FragColor = vec4(color, 1.0);
}
