/**
 * Two-pass separable Gaussian blur fragment shader.
 * u_direction controls horizontal vs vertical pass.
 * u_blurRadius controls the kernel width (in texel units).
 * WebGL 1.0 compatible.
 */
export const gaussianBlurFragmentShader = `
  precision mediump float;
  varying vec2 v_uv;
  uniform sampler2D u_texture;
  uniform vec2 u_direction;
  uniform float u_blurRadius;

  void main() {
    vec4 sum = vec4(0.0);
    float totalWeight = 0.0;
    float sigma = u_blurRadius * 0.4;
    float invTwoSigmaSq = 1.0 / (2.0 * sigma * sigma + 0.0001);

    for (float i = -15.0; i <= 15.0; i += 1.0) {
      if (abs(i) > u_blurRadius) continue;
      float weight = exp(-(i * i) * invTwoSigmaSq);
      vec2 offset = u_direction * i;
      sum += texture2D(u_texture, v_uv + offset) * weight;
      totalWeight += weight;
    }

    gl_FragColor = sum / totalWeight;
  }
`;
