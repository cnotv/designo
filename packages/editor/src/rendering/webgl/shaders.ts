// Shared by both programs: a node's box, turned around its centre, mapped from world units to
// clip space through the viewport.
const PLACE_IN_VIEW = /* glsl */ `
uniform vec3 u_viewport;
uniform vec2 u_size;

vec4 placeInView(vec2 center, vec2 local, float rotation) {
  float cosine = cos(rotation);
  float sine = sin(rotation);
  vec2 world = center + vec2(local.x * cosine - local.y * sine, local.x * sine + local.y * cosine);
  vec2 screen = world * u_viewport.z + u_viewport.xy;
  vec2 clip = screen / u_size * 2.0 - 1.0;
  return vec4(clip.x, -clip.y, 0.0, 1.0);
}
`

export const SHAPE_VERTEX_SHADER = /* glsl */ `#version 300 es
layout(location = 0) in vec2 a_corner;
layout(location = 1) in vec4 a_centerAndHalfSize;
layout(location = 2) in vec4 a_rotationRadiusKindStroke;
layout(location = 3) in float a_opacity;
layout(location = 4) in vec4 a_fill;
layout(location = 5) in vec4 a_stroke;
${PLACE_IN_VIEW}
out vec2 v_local;
out vec2 v_halfSize;
out float v_radius;
out float v_kind;
out float v_strokeWidth;
out float v_opacity;
out vec4 v_fill;
out vec4 v_stroke;

void main() {
  vec2 halfSize = a_centerAndHalfSize.zw;
  float strokeWidth = a_rotationRadiusKindStroke.w;
  // Room for the outer half of the stroke and two CSS pixels of anti-aliasing.
  float padding = strokeWidth * 0.5 + 2.0 / u_viewport.z;
  v_local = a_corner * (halfSize + padding);
  v_halfSize = halfSize;
  v_radius = a_rotationRadiusKindStroke.y;
  v_kind = a_rotationRadiusKindStroke.z;
  v_strokeWidth = strokeWidth;
  v_opacity = a_opacity;
  v_fill = a_fill;
  v_stroke = a_stroke;
  gl_Position = placeInView(a_centerAndHalfSize.xy, v_local, a_rotationRadiusKindStroke.x);
}
`

export const SHAPE_FRAGMENT_SHADER = /* glsl */ `#version 300 es
precision highp float;

in vec2 v_local;
in vec2 v_halfSize;
in float v_radius;
in float v_kind;
in float v_strokeWidth;
in float v_opacity;
in vec4 v_fill;
in vec4 v_stroke;
uniform bool u_clipPass;
out vec4 outColor;

float boxDistance(vec2 point, vec2 halfSize, float radius) {
  vec2 corner = abs(point) - halfSize + radius;
  return length(max(corner, 0.0)) + min(max(corner.x, corner.y), 0.0) - radius;
}

// An approximation that is exact on the outline, which is all the edge and stroke need.
float ellipseDistance(vec2 point, vec2 radii) {
  radii = max(radii, vec2(1e-4));
  float scaled = length(point / radii);
  float gradient = length(point / (radii * radii));
  return scaled < 1e-6 ? -min(radii.x, radii.y) : scaled * (scaled - 1.0) / gradient;
}

void main() {
  float distance = v_kind > 0.5
    ? ellipseDistance(v_local, v_halfSize)
    : boxDistance(v_local, v_halfSize, v_radius);
  float pixel = max(fwidth(distance), 1e-4);
  float fillCoverage = clamp(0.5 - distance / pixel, 0.0, 1.0);
  if (u_clipPass) {
    if (fillCoverage < 0.5) discard;
    outColor = vec4(0.0);
    return;
  }
  float strokeCoverage = v_strokeWidth > 0.0
    ? clamp(0.5 - (abs(distance) - v_strokeWidth * 0.5) / pixel, 0.0, 1.0)
    : 0.0;
  // Canvas 2D paints the fill, then the stroke over it, each faded by the opacity.
  float fillAlpha = v_fill.a * fillCoverage * v_opacity;
  float strokeAlpha = v_stroke.a * strokeCoverage * v_opacity;
  vec3 color = v_stroke.rgb * strokeAlpha + v_fill.rgb * fillAlpha * (1.0 - strokeAlpha);
  outColor = vec4(color, strokeAlpha + fillAlpha * (1.0 - strokeAlpha));
}
`

export const TEXTURE_VERTEX_SHADER = /* glsl */ `#version 300 es
layout(location = 0) in vec2 a_corner;
${PLACE_IN_VIEW}
uniform vec2 u_center;
uniform vec2 u_nodeHalfSize;
uniform vec2 u_textureSize;
uniform float u_rotation;
out vec2 v_uv;

void main() {
  v_uv = a_corner * 0.5 + 0.5;
  // The texture starts at the node's top-left corner and may run past its box, as text can.
  vec2 local = -u_nodeHalfSize + v_uv * u_textureSize;
  gl_Position = placeInView(u_center, local, u_rotation);
}
`

export const TEXTURE_FRAGMENT_SHADER = /* glsl */ `#version 300 es
precision highp float;

in vec2 v_uv;
uniform sampler2D u_texture;
uniform float u_opacity;
out vec4 outColor;

void main() {
  outColor = texture(u_texture, v_uv) * u_opacity;
}
`
