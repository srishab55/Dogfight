precision highp float;

uniform vec3 color;
uniform float intensity;

varying float vHeight;
varying float vFacing;

void main() {
  // Strong at the base, fading out towards the top; soft at the edges, like a column of light.
  float fadeUp = pow(1.0 - vHeight, 0.9);
  float glow = pow(vFacing, 0.5);
  float a = clamp(intensity * fadeUp * glow, 0.0, 0.92);
  // Blended over what's behind it (not added: added to a bright hazy sky, the colour washes out to white).
  gl_FragColor = vec4(color, a);
}
