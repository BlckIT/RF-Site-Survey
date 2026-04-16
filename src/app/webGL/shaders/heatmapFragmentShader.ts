/**
 * Genererar en shader för viktad signalkarta med väggdämpning.
 *
 * Varje punkt bidrar med signal baserat på invers-distansviktning (IDW).
 * Väggar mellan pixel och mätpunkt dämpar signalen.
 * Resultatet normaliseras och mappas genom en färg-LUT.
 *
 * @param pointCount - Antal max punkt-uniforms
 * @param wallCount - Antal väggar (max 64)
 */
const MAX_WALLS = 64;

const generateHeatmapFragmentShader = (
  pointCount: number,
  wallCount: number = 0,
): string => {
  const clampedPointCount = Math.max(1, pointCount);
  const clampedWallCount = Math.min(Math.max(0, wallCount), MAX_WALLS);
  return `
  precision mediump float;

  varying vec2 v_uv;

  uniform float u_radius;
  uniform float u_power;
  uniform float u_maxSignal;
  uniform float u_opacity;
  uniform float u_minOpacity;
  uniform float u_maxOpacity;
  uniform vec2 u_resolution;
  uniform int u_pointCount;
  uniform vec3 u_points[${clampedPointCount}];
  uniform sampler2D u_lut;

  // Väggdata: varje vägg är en vec4(x1, y1, x2, y2)
  uniform int u_wallCount;
  ${clampedWallCount > 0 ? `uniform vec4 u_walls[${clampedWallCount}];` : ""}

  // Dämpningsfaktor per vägg (individuell per material)
  ${clampedWallCount > 0 ? `uniform float u_wallDampening[${clampedWallCount}];` : ""}

  /**
   * Kontrollera om två linjesegment korsar varandra.
   * Returnerar 1.0 om de korsar, annars 0.0.
   */
  float segmentsIntersect(vec2 a1, vec2 a2, vec2 b1, vec2 b2) {
    vec2 d1 = a2 - a1;
    vec2 d2 = b2 - b1;
    float denom = d1.x * d2.y - d1.y * d2.x;
    if (abs(denom) < 0.0001) return 0.0;
    vec2 d3 = b1 - a1;
    float t = (d3.x * d2.y - d3.y * d2.x) / denom;
    float u = (d3.x * d1.y - d3.y * d1.x) / denom;
    if (t > 0.001 && t < 0.999 && u > 0.001 && u < 0.999) return 1.0;
    return 0.0;
  }

  /**
   * Beräkna total dämpning genom alla korsade väggar.
   * Returnerar multiplikativ faktor (1.0 = ingen dämpning).
   */
  float calcWallAttenuation(vec2 from, vec2 to) {
    float attenuation = 1.0;
    ${
      clampedWallCount > 0
        ? `
    for (int i = 0; i < ${clampedWallCount}; ++i) {
      if (i >= u_wallCount) break;
      vec4 w = u_walls[i];
      float hit = segmentsIntersect(from, to, w.xy, w.zw);
      if (hit > 0.5) {
        attenuation *= u_wallDampening[i];
      }
    }
    `
        : ""
    }
    return attenuation;
  }

  void main() {
    vec2 pixel = v_uv * u_resolution;

    float weightedSum = 0.0;
    float weightTotal = 0.0;

    for (int i = 0; i < ${clampedPointCount}; ++i) {
      if (i >= u_pointCount) break;

      vec2 point = u_points[i].xy;
      float value = u_points[i].z;

      vec2 diff = pixel - point;
      float distSq = dot(diff, diff);

      if (distSq < 1e-6) {
        weightedSum = value;
        weightTotal = 1.0;
        break;
      }

      if (distSq > u_radius * u_radius) continue;

      float weight = 1.0 / pow(distSq, u_power * 0.5);

      // Dämpa vikten baserat på korsade väggar (per-vägg dämpning)
      float attenuation = calcWallAttenuation(pixel, point);
      weight *= attenuation;

      weightedSum += weight * value;
      weightTotal += weight;
    }

    if (weightTotal == 0.0) {
      discard;
    }

    float signal = weightedSum / weightTotal;
    float normalized = clamp(signal / u_maxSignal, 0.0, 1.0);
    vec3 color = texture2D(u_lut, vec2(normalized, 0.5)).rgb;
    float alpha = mix(u_minOpacity, u_maxOpacity, normalized);
    gl_FragColor = vec4(color, alpha);
  }
`;
};

export default generateHeatmapFragmentShader;
export { MAX_WALLS };
