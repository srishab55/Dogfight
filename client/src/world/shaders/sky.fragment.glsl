precision highp float;

varying vec3 vDirection;

uniform vec3 zenithColor;
uniform vec3 horizonColor;
uniform float gradientSharpness;
uniform vec3 sunDirection;   // unit vector pointing towards the sun
uniform vec3 sunColor;
uniform float sunDiscCosine; // cos(angular radius of the sun disc)
uniform float sunGlowIntensity;
// 1 when a post-process applies tone mapping and gamma itself: output linear colour.
uniform float outputLinear;

void main() {
  vec3 direction = normalize(vDirection);

  // Elevation: 0 at the horizon, 1 straight up. Below the horizon we hold the
  // horizon colour, which is also the fog colour, so the hazy far edge of the
  // ground blends straight into the sky with no visible seam.
  float elevation = max(direction.y, 0.0);
  // 1 - (1 - e)^k rises quickly off the horizon (thin haze band) but, unlike
  // e^k with k < 1, has a finite slope at e = 0, so there is no visible crease
  // line along the horizon.
  float zenithBlend = 1.0 - pow(1.0 - elevation, gradientSharpness);
  vec3 color = mix(horizonColor, zenithColor, zenithBlend);

  // Sun disc with a slightly soft edge, plus two glow lobes: a tight halo and
  // a broad warm haze that is strongest near the horizon.
  float cosToSun = dot(direction, sunDirection);
  float disc = smoothstep(sunDiscCosine - 0.00004, sunDiscCosine, cosToSun);
  float halo = pow(max(cosToSun, 0.0), 300.0);
  float haze = pow(max(cosToSun, 0.0), 8.0) * (1.0 - elevation);
  color += sunColor * (disc + sunGlowIntensity * (halo + 0.35 * haze));

  // Tiny noise breaks up 8-bit colour banding in the smooth gradient.
  float noise = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453);
  color += (noise - 0.5) / 255.0;

  // The colours above are sRGB (display) values. With whole-screen tone mapping,
  // everything must be linear first; the post-process converts back for display.
  color = mix(color, pow(max(color, vec3(0.0)), vec3(2.2)), outputLinear);
  gl_FragColor = vec4(color, 1.0);
}
