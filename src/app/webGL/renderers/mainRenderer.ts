import { Gradient, Wall } from "@/lib/types";

import { createWebGLContext } from "../utils/webGLUtils";
import { createBackgroundLayerRenderer } from "./layers/imageLayerRenderer";
import { createHeatmapLayerRenderer } from "./layers/heatmapLayerRenderer";

export type HeatmapPoint = {
  x: number;
  y: number;
  value: number;
};

/**
 * Rendera både bakgrundsbild och heatmap-lager med väggdämpning
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

  const render = async (props: {
    points: HeatmapPoint[];
    width: number;
    height: number;
    backgroundImageSrc?: string;
    minOpacity?: number;
    maxOpacity?: number;
    influenceRadius?: number;
  }) => {
    const {
      width,
      height,
      minOpacity = 0.2,
      maxOpacity = 0.7,
      influenceRadius = 100,
      backgroundImageSrc,
    } = props;

    canvas.width = width;
    canvas.height = height;

    gl.viewport(0, 0, width, height);

    if (backgroundImageSrc) {
      await bgRenderer.draw(backgroundImageSrc);
    }

    heatmapRenderer.draw({
      width,
      height,
      influenceRadius,
      minOpacity,
      maxOpacity,
    });
  };

  return { render };
};

export default mainRenderer;
