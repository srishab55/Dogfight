precision highp float;

attribute vec3 position;
uniform mat4 worldViewProjection;

// The sky box is centred on the camera (infiniteDistance), so a vertex's local
// position is also the view direction from the camera through that vertex.
varying vec3 vDirection;

void main() {
  vDirection = position;
  gl_Position = worldViewProjection * vec4(position, 1.0);
}
