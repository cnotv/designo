// Shared by both programs: a node's box, turned around its centre, mapped from world units to
// clip space through the viewport.
const PLACE_IN_VIEW = /* glsl */ `
uniform vec3 u_viewport;
uniform vec2 u_size;

vec4 placeInViewTurned(vec2 center, vec2 local, float cosine, float sine) {
  vec2 world = center + vec2(local.x * cosine - local.y * sine, local.x * sine + local.y * cosine);
  vec2 screen = world * u_viewport.z + u_viewport.xy;
  vec2 clip = screen / u_size * 2.0 - 1.0;
  return vec4(clip.x, -clip.y, 0.0, 1.0);
}

vec4 placeInView(vec2 center, vec2 local, float rotation) {
  return placeInViewTurned(center, local, cos(rotation), sin(rotation));
}
`

export const SHAPE_VERTEX_SHADER = /* glsl */ `#version 300 es
layout(location = 0) in vec2 a_corner;
layout(location = 1) in vec4 a_centerAndHalfSize;
layout(location = 2) in vec4 a_rotationRadiusKindStroke;
layout(location = 3) in float a_opacity;
layout(location = 4) in vec4 a_fill;
layout(location = 5) in vec4 a_stroke;
layout(location = 6) in vec4 a_blurAndGradient;
layout(location = 7) in vec4 a_shadowAndBlend;
layout(location = 8) in vec4 a_shadowColor;
${PLACE_IN_VIEW}
out vec2 v_local;
out vec2 v_halfSize;
out float v_radius;
out float v_kind;
out float v_strokeWidth;
out float v_opacity;
out vec4 v_fill;
out vec4 v_stroke;
out vec4 v_blurAndGradient;
out vec4 v_shadowAndBlend;
out vec4 v_shadowColor;

// A soft edge fades out within three deviations, and a shadow lies as far off as it is moved.
float effectReach() {
  float blurReach = a_blurAndGradient.x * 3.0;
  float shadowReach = a_shadowColor.a > 0.0 ? length(a_shadowAndBlend.xy) + a_shadowAndBlend.z * 3.0 : 0.0;
  return max(blurReach, shadowReach);
}

void main() {
  vec2 halfSize = a_centerAndHalfSize.zw;
  float strokeWidth = a_rotationRadiusKindStroke.w;
  // Room for the outer half of the stroke, the soft edges and two CSS pixels of anti-aliasing.
  float padding = strokeWidth * 0.5 + 2.0 / u_viewport.z + effectReach();
  v_local = a_corner * (halfSize + padding);
  v_halfSize = halfSize;
  v_radius = a_rotationRadiusKindStroke.y;
  v_kind = a_rotationRadiusKindStroke.z;
  v_strokeWidth = strokeWidth;
  v_opacity = a_opacity;
  v_fill = a_fill;
  v_stroke = a_stroke;
  v_blurAndGradient = a_blurAndGradient;
  v_shadowAndBlend = a_shadowAndBlend;
  v_shadowColor = a_shadowColor;
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
in vec4 v_blurAndGradient;
in vec4 v_shadowAndBlend;
in vec4 v_shadowColor;
uniform bool u_clipPass;
uniform sampler2D u_ramps;
uniform sampler2D u_backdrop;
uniform vec2 u_deviceSize;
uniform float u_rampRows;
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

float shapeDistance(vec2 point) {
  return v_kind > 0.5
    ? ellipseDistance(point, v_halfSize)
    : boxDistance(point, v_halfSize, v_radius);
}

// How much of a pixel the shape covers. A blurred edge is a gaussian's cumulative curve, which a
// smoothstep two deviations either side follows closely; a sharp one is one pixel of anti-aliasing.
// ponytail: the edge alone is blurred, so a shape thinner than its blur keeps more of its peak
// than a true blur would; a layer pass would be exact, add it if that shows.
float coverage(float distance, float deviation, float pixel) {
  return deviation > 0.0
    ? 1.0 - smoothstep(-2.0 * deviation, 2.0 * deviation, distance)
    : clamp(0.5 - distance / pixel, 0.0, 1.0);
}

// Where a point is along the gradient, from 0 at its first stop to 1 at its last.
float gradientPosition(vec2 point, float kind, float angle) {
  if (kind > 1.5) return length(point / max(v_halfSize, vec2(1e-4)));
  vec2 direction = vec2(cos(angle), sin(angle));
  float halfLength = (abs(2.0 * v_halfSize.x * direction.x) + abs(2.0 * v_halfSize.y * direction.y)) * 0.5;
  return dot(point, direction) / max(2.0 * halfLength, 1e-4) + 0.5;
}

vec4 fillColor(vec2 point) {
  float kind = v_blurAndGradient.y;
  if (kind < 0.5) return v_fill;
  float position = clamp(gradientPosition(point, kind, v_blurAndGradient.z), 0.0, 1.0);
  return texture(u_ramps, vec2(position, (v_blurAndGradient.w + 0.5) / u_rampRows));
}

vec3 blendChannels(int mode, vec3 backdrop, vec3 source) {
  if (mode == 1) return backdrop * source;
  if (mode == 2) return backdrop + source - backdrop * source;
  if (mode == 3) {
    vec3 dark = 2.0 * backdrop * source;
    vec3 light = 1.0 - 2.0 * (1.0 - backdrop) * (1.0 - source);
    return mix(dark, light, step(0.5, backdrop));
  }
  if (mode == 4) return min(backdrop, source);
  return max(backdrop, source);
}

// The W3C compositing formula, on premultiplied colours: what the layer is where nothing is
// behind it, what is behind it where the layer is clear, and the blend where both are there.
vec4 blendOver(int mode, vec4 source) {
  vec4 backdrop = texture(u_backdrop, gl_FragCoord.xy / u_deviceSize);
  vec3 backdropColor = backdrop.a > 0.0 ? backdrop.rgb / backdrop.a : vec3(0.0);
  vec3 sourceColor = source.a > 0.0 ? source.rgb / source.a : vec3(0.0);
  vec3 mixed = blendChannels(mode, backdropColor, sourceColor);
  vec3 color = (1.0 - backdrop.a) * source.rgb + (1.0 - source.a) * backdrop.rgb + source.a * backdrop.a * mixed;
  return vec4(color, source.a + backdrop.a * (1.0 - source.a));
}

void main() {
  float deviation = v_blurAndGradient.x;
  float distance = shapeDistance(v_local);
  float pixel = max(fwidth(distance), 1e-4);
  float fillCoverage = coverage(distance, deviation, pixel);
  if (u_clipPass) {
    if (fillCoverage < 0.5) discard;
    outColor = vec4(0.0);
    return;
  }
  float strokeCoverage = v_strokeWidth > 0.0
    ? coverage(abs(distance) - v_strokeWidth * 0.5, deviation, pixel)
    : 0.0;
  vec4 fill = fillColor(v_local);
  // Canvas 2D paints the fill, then the stroke over it, each faded by the opacity.
  float fillAlpha = fill.a * fillCoverage * v_opacity;
  float strokeAlpha = v_stroke.a * strokeCoverage * v_opacity;
  vec3 color = v_stroke.rgb * strokeAlpha + fill.rgb * fillAlpha * (1.0 - strokeAlpha);
  vec4 body = vec4(color, strokeAlpha + fillAlpha * (1.0 - strokeAlpha));
  // The shadow is cast by the sharp shape, moved along the node's own axes, and lies under the body.
  vec4 shadow = vec4(0.0);
  if (v_shadowColor.a > 0.0) {
    vec2 shadowPoint = v_local - v_shadowAndBlend.xy;
    float shadowDistance = shapeDistance(shadowPoint);
    float shadowAlpha = v_shadowColor.a * fill.a * coverage(shadowDistance, v_shadowAndBlend.z, pixel) * v_opacity;
    shadow = vec4(v_shadowColor.rgb * shadowAlpha, shadowAlpha);
  }
  vec4 layer = body + shadow * (1.0 - body.a);
  int mode = int(v_shadowAndBlend.w + 0.5);
  outColor = mode > 0 ? blendOver(mode, layer) : layer;
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

export const GLYPH_VERTEX_SHADER = /* glsl */ `#version 300 es
layout(location = 0) in vec2 a_world;
layout(location = 1) in vec2 a_uv;
layout(location = 2) in vec4 a_color;
${PLACE_IN_VIEW}
out vec2 v_uv;
out vec4 v_color;

void main() {
  v_uv = a_uv;
  v_color = a_color;
  // The corners were turned with their node on the CPU, so only the view is left.
  gl_Position = placeInViewTurned(a_world, vec2(0.0), 1.0, 0.0);
}
`

export const GLYPH_FRAGMENT_SHADER = /* glsl */ `#version 300 es
precision highp float;

in vec2 v_uv;
in vec4 v_color;
uniform sampler2D u_atlas;
out vec4 outColor;

void main() {
  // The atlas holds coverage, and the colour is already premultiplied by its alpha.
  outColor = v_color * texture(u_atlas, v_uv).r;
}
`
