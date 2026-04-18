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

    // Avgör om skalan är kalibrerad (default/okalibrerad = 10 eller 0)
    bool calibrated = u_pixelsPerMeter > 10.0;
    // Skalfaktor: pixlar → meter. Om okalibrerad, använd 1.0 (pixelbaserat som förut)
    float ppm = calibrated ? u_pixelsPerMeter : 1.0;

    float radiusSq = u_radius * u_radius;

    float weightedSum = 0.0;
    float weightTotal = 0.0;
    float pointCount = 0.0; // Räkna bidragande punkter för confidence

    for (int i = 0; i < ${clampedPointCount}; ++i) {
      if (i >= u_pointCount) break;

      vec2 point = u_points[i].xy;
      float value = u_points[i].z; // Redan i dBm (negativa värden, t.ex. -65)

      vec2 diff = pixel - point;
      float distSqPx = dot(diff, diff);

      if (distSqPx < 1e-6) {
        weightedSum = value;
        weightTotal = 1.0;
        pointCount = 1.0;
        break;
      }

      // Radius-cutoff i pixlar (u_radius är alltid i pixlar)
      if (distSqPx > radiusSq) continue;

      float weight;

      if (calibrated) {
        // ITU-R P.1238 logaritmisk path loss: vikt baserad på N * log10(d)
        float distMeters = sqrt(distSqPx) / ppm;
        float logDist = log(max(distMeters, 0.1)) / log(10.0); // log10(d)
        float pathLossDb = u_pathLossExponent * logDist; // N * log10(d)
        // Invers path loss som vikt (högre förlust = lägre vikt)
        weight = 1.0 / max(pathLossDb * pathLossDb, 0.01);
      } else {
        // Okalibrerad fallback: enkel IDW med 1/distSq (pixelbaserat)
        weight = 1.0 / max(distSqPx, 1.0);
      }

      // Väggdämpning: minskar vikten OCH dämpar signalen
      // Vikten minskas så att mätpunkter bakom väggar bidrar mindre
      // Signalen dämpas så att väggar syns visuellt i heatmappen
      float wallDb = calcWallAttenuationDb(pixel, point);
      float wallFactor = pow(10.0, -wallDb / 20.0); // dB → linjär faktor
      weight *= wallFactor;

      // Dämpa signalvärdet med väggförlust (synlig effekt i heatmappen)
      float attenuatedValue = value - wallDb;

      // Använd dämpat värde
      weightedSum += weight * attenuatedValue;
      weightTotal += weight;
      pointCount += 1.0;
    }

    if (weightTotal == 0.0) {
      discard;
    }

    float signal = weightedSum / weightTotal; // Interpolerat dBm-värde

    // Normalisera dBm till 0-1 för färg-LUT: -100 dBm → 0.0, -40 dBm → 1.0
    float normalized = clamp((signal + 100.0) / 60.0, 0.0, 1.0);
    vec3 color = texture2D(u_lut, vec2(normalized, 0.5)).rgb;

    // Confidence: 1+ punkt = full confidence, avtar med avstånd till närmaste punkt
    // Använd weightTotal normaliserat mot en referensvikt vid 1m avstånd
    float refDist = calibrated ? 1.0 : 100.0; // 1 meter eller 100 pixlar
    float refWeight = 1.0 / max(refDist * refDist, 1.0);
    float confidence = clamp(weightTotal / refWeight * 0.5, 0.0, 1.0);
    float alpha = mix(u_minOpacity, u_maxOpacity, normalized) * confidence;
    gl_FragColor = vec4(color, alpha);
  }
`;
};

export default generateHeatmapFragmentShader;
export { MAX_WALLS };
