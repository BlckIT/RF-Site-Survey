/**
 * Generates a fragment shader for weighted signal heatmap with physics-based wall attenuation.
 *
 * Each point contributes signal based on Inverse Distance Weighting (IDW).
 * Walls between pixel and measurement point attenuate the signal value in dB
 * following the ITU-R P.1238 Wall Attenuation Factor (WAF) model.
 * The result is normalized and mapped through a color LUT.
 *
 * @param pointCount - Max point uniforms
 * @param wallCount - Number of walls (max 64)
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
  uniform float u_pathLossExponent;
  uniform float u_pixelsPerMeter;
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

  // Attenuation in dB per wall (per material, ITU-R P.1238 WAF)
  ${clampedWallCount > 0 ? `uniform float u_wallAttenuationDb[${clampedWallCount}];` : ""}

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
   * Calculate total wall attenuation in dB between two points.
   * Returns sum of dB values for all crossed walls (ITU-R P.1238 WAF model).
   */
  float calcWallAttenuationDb(vec2 from, vec2 to) {
    float totalDb = 0.0;
    ${
      clampedWallCount > 0
        ? `
    for (int i = 0; i < ${clampedWallCount}; ++i) {
      if (i >= u_wallCount) break;
      vec4 w = u_walls[i];
      float hit = segmentsIntersect(from, to, w.xy, w.zw);
      if (hit > 0.5) {
        totalDb += u_wallAttenuationDb[i];
      }
    }
    `
        : ""
    }
    return totalDb;
  }

  void main() {
    vec2 pixel = v_uv * u_resolution;

    float weightedSum = 0.0;
    float weightTotal = 0.0;

    for (int i = 0; i < ${clampedPointCount}; ++i) {
      if (i >= u_pointCount) break;

      vec2 point = u_points[i].xy;
      float value = u_points[i].z; // dBm (negativa värden, t.ex. -65)

      vec2 diff = pixel - point;
      float distSq = dot(diff, diff);

      if (distSq < 1e-6) {
        weightedSum = value;
        weightTotal = 1.0;
        break;
      }

      if (distSq > u_radius * u_radius) continue;

      // IDW-vikt: samma beprövade formel som alltid fungerat visuellt
      float weight = 1.0 / pow(distSq, u_pathLossExponent * 0.5);

      // Väggdämpning i dB (ITU-R P.1238 WAF)
      float wallDb = calcWallAttenuationDb(pixel, point);

      // Dämpa signalen med väggförlust (direkt i dBm)
      float attenuated_dBm = value - wallDb;

      weightedSum += weight * attenuated_dBm;
      weightTotal += weight;
    }

    if (weightTotal == 0.0) {
      discard;
    }

    float signal = weightedSum / weightTotal; // Interpolerat dBm-värde

    // Normalisera dBm till 0-1 för färg-LUT: -100 dBm → 0.0, -40 dBm → 1.0
    float normalized = clamp((signal + 100.0) / 60.0, 0.0, 1.0);
    vec3 color = texture2D(u_lut, vec2(normalized, 0.5)).rgb;

    // Confidence: beprövad formel — pixlar nära mätpunkter får full opacity
    float confidenceScale = u_radius * u_radius;
    float confidence = clamp(weightTotal * confidenceScale, 0.0, 1.0);
    float alpha = mix(u_minOpacity, u_maxOpacity, normalized) * confidence;
    gl_FragColor = vec4(color, alpha);
  }
`;
};

export default generateHeatmapFragmentShader;
export { MAX_WALLS };
