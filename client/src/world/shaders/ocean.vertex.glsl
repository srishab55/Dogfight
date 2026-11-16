precision highp float;

attribute vec3 position;
uniform mat4 world;
uniform mat4 viewProjection;

// World position: waves, depth and fog are all computed from it, so moving
// the plane with the camera never makes the pattern swim.
varying vec3 vWorld;

void main() {
  vec4 worldPosition = world * vec4(position, 1.0);
  vWorld = worldPosition.xyz;
  gl_Position = viewProjection * worldPosition;
}
