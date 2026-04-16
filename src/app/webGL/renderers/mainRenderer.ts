import { Gradient, Wall } from "@/lib/types";

import { createWebGLContext } from "../utils/webGLUtils";
import { createBackgroundLayerRenderer } from "./layers/imageLayerRenderer";
import { createHeatmapLayerRenderer } from "./layers/heatmapLayerRenderer";
import { createBlurLayerRenderer } from "./layers/blurLayerRenderer";
import { setDefaultTextureParams } from "../utils/webGLDefaults";

export type HeatmapPoint = {
  x: number;
  y: number;
  value: number;
};

/**
 * Rendera både bakgrundsbild och heatmap-lager med väggdämpning
 * och valfri Gaussian blur post-processing.
 */
const mainRenderer = (
  canvas: HTMLCanvasElement,
  points: HeatmapPoint[],
  gradient: Gradient,
  walls: Wall[] = [],
) => {
  const gl = createWebGLContext(canvas);
  const bgRenderer = createBackgroundLayerRenderer(gl);
  const heatmapRenderer = createHeatmapLayerRenderer(
    gl,
    points,
    gradient,
    walls,
  );
  const blurRenderer = createBlurLayerRenderer(gl);

  // Offscreen framebuffer for heatmap — lazily sized
  let heatmapFB: WebGLFramebuffer | null = null;
  let heatmapTex: WebGLTexture | null = null;
  let fbW = 0;
  let fbH = 0;

  const ensureHeatmapFB = (w: number, h: number) => {
    if (fbW === w && fbH === h && heatmapFB) return;

    if (heatmapFB) gl.deleteFramebuffer(heatmapFB);
    if (heatmapTex) gl.deleteTexture(heatmapTex);

    heatmapTex = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, heatmapTex);
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

    heatmapFB = gl.createFramebuffer()!;
    gl.bindFramebuffer(gl.FRAMEBUFFER, heatmapFB);
    gl.framebufferTexture2D(
      gl.FRAMEBUFFER,
      gl.COLOR_ATTACHMENT0,
      gl.TEXTURE_2D,
      heatmapTex,
      0,
    );
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);

    fbW = w;
    fbH = h;
  };

  const render = async (props: {
    points: HeatmapPoint[];
    width: number;
    height: number;
    backgroundImageSrc?: string;
    minOpacity?: number;
    maxOpacity?: number;
    influenceRadius?: number;
    pixelsPerMeter?: number;
    blur?: number;
  }) => {
    const {
      width,
      height,
      minOpacity = 0.2,
      maxOpacity = 0.7,
      influenceRadius = 100,
      pixelsPerMeter = 10,
      backgroundImageSrc,
      blur = 0,
    } = props;

    canvas.width = width;
    canvas.height = height;

    gl.viewport(0, 0, width, height);

    // 1. Draw background image to screen
    if (backgroundImageSrc) {
      await bgRenderer.draw(backgroundImageSrc);
    }

    // 2. Render heatmap to offscreen framebuffer
    ensureHeatmapFB(width, height);
    gl.bindFramebuffer(gl.FRAMEBUFFER, heatmapFB);
    gl.viewport(0, 0, width, height);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.disable(gl.BLEND); // no blending into offscreen — clean alpha

    heatmapRenderer.draw({
      width,
      height,
      influenceRadius,
      minOpacity,
      maxOpacity,
      pixelsPerMeter,
    });

    // 3. Blur pass: read from offscreen texture, composite to screen
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, width, height);

    blurRenderer.draw(heatmapTex!, width, height, blur);
  };

  return { render };
};

export default mainRenderer;
