precision highp float;

// A base beacon: an open cylinder from y = -0.5 to 0.5, scaled to its height.
attribute vec3 position;
attribute vec3 normal;

uniform mat4 world;
uniform mat4 viewProjection;
uniform vec3 cameraPosition;

// 0 at the base, 1 at the top.
varying float vHeight;
// How squarely this part of the column faces the camera: 1 in the middle, 0 at its edges.
varying float vFacing;

void main() {
  vec4 worldPosition = world * vec4(position, 1.0);
  vHeight = position.y + 0.5;
  vec3 worldNormal = normalize(mat3(world) * normal);
  vec3 toCamera = normalize(cameraPosition - worldPosition.xyz);
  vFacing = abs(dot(worldNormal, toCamera));
  gl_Position = viewProjection * worldPosition;
}
