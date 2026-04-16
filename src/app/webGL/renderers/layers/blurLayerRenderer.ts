import { fullscreenQuadVertexShaderFlipY } from "@/app/webGL/shaders/fullscreenQuadVertexShader";
import { gaussianBlurFragmentShader } from "@/app/webGL/shaders/gaussianBlurFragmentShader";
import {
  createShaderProgram,
  createFullScreenQuad,
  getAttribLocations,
} from "../../utils/webGLUtils";
import { setDefaultTextureParams } from "../../utils/webGLDefaults";

/**
 * Two-pass separable Gaussian blur renderer.
 * Ping-pongs between two framebuffers for horizontal then vertical blur.
 * If blurAmount is 0, draws the input texture directly (passthrough).
 * WebGL 1.0 only.
 */
export const createBlurLayerRenderer = (gl: WebGLRenderingContext) => {
  const program = createShaderProgram(
    gl,
    fullscreenQuadVertexShaderFlipY,
    gaussianBlurFragmentShader,
  );
  const quad = createFullScreenQuad(gl);
  const attribs = getAttribLocations(gl, program);

  const u_texture = gl.getUniformLocation(program, "u_texture")!;
  const u_direction = gl.getUniformLocation(program, "u_direction")!;
  const u_blurRadius = gl.getUniformLocation(program, "u_blurRadius")!;

  // Ping-pong framebuffers — lazily sized
  let fbA: WebGLFramebuffer | null = null;
  let texA: WebGLTexture | null = null;
  let fbB: WebGLFramebuffer | null = null;
  let texB: WebGLTexture | null = null;
  let allocW = 0;
  let allocH = 0;

  const ensureFramebuffers = (w: number, h: number) => {
    if (allocW === w && allocH === h && fbA && fbB) return;

    // Clean up old resources
    if (fbA) gl.deleteFramebuffer(fbA);
    if (texA) gl.deleteTexture(texA);
    if (fbB) gl.deleteFramebuffer(fbB);
    if (texB) gl.deleteTexture(texB);

    const createFBPair = (): [WebGLFramebuffer, WebGLTexture] => {
      const fb = gl.createFramebuffer()!;
      const tex = gl.createTexture()!;
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.texImage2D(
        gl.TEXTURE_2D,
        0,
        gl.RGBA,
        w,
        h,
        0,
        gl.RGBA,
        gl.UNSIGNED_BYTE,
        null,
      );
      setDefaultTextureParams(gl);
      gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
      gl.framebufferTexture2D(
        gl.FRAMEBUFFER,
        gl.COLOR_ATTACHMENT0,
        gl.TEXTURE_2D,
        tex,
        0,
      );
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      return [fb, tex];
    };

    [fbA, texA] = createFBPair();
    [fbB, texB] = createFBPair();
    allocW = w;
    allocH = h;
  };

  const drawQuad = () => {
    gl.bindBuffer(gl.ARRAY_BUFFER, quad);
    gl.enableVertexAttribArray(attribs.a_position);
    gl.vertexAttribPointer(attribs.a_position, 2, gl.FLOAT, false, 0, 0);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
  };

  /**
   * Draw the blurred heatmap to screen.
   * @param inputTexture - heatmap rendered to offscreen texture
   * @param width - canvas width
   * @param height - canvas height
   * @param blurAmount - 0..1 mapped to pixel radius 0..15
   */
  const draw = (
    inputTexture: WebGLTexture,
    width: number,
    height: number,
    blurAmount: number,
  ) => {
    gl.useProgram(program);

    if (blurAmount <= 0) {
      // Passthrough — draw input texture directly to screen with blending
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);

      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, inputTexture);
      gl.uniform1i(u_texture, 0);
      gl.uniform2f(u_direction, 0.0, 0.0);
      gl.uniform1f(u_blurRadius, 0.0);

      drawQuad();
      return;
    }

    ensureFramebuffers(width, height);

    const pixelRadius = blurAmount * 15.0;

    // --- Pass 1: Horizontal blur → fbA ---
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbA);
    gl.viewport(0, 0, width, height);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.disable(gl.BLEND); // no blending into intermediate buffer

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, inputTexture);
    gl.uniform1i(u_texture, 0);
    gl.uniform2f(u_direction, 1.0 / width, 0.0);
    gl.uniform1f(u_blurRadius, pixelRadius);

    drawQuad();

    // --- Pass 2: Vertical blur → screen ---
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, width, height);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, texA);
    gl.uniform1i(u_texture, 0);
    gl.uniform2f(u_direction, 0.0, 1.0 / height);
    gl.uniform1f(u_blurRadius, pixelRadius);

    drawQuad();
  };

  return { draw };
};
