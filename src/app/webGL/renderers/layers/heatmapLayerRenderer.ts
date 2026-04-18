import { Gradient, Wall, getWallAttenuationDb } from "@/lib/types";
import { HeatmapPoint } from "../mainRenderer";
import generateFragmentShader, {
  MAX_WALLS,
} from "../../shaders/heatmapFragmentShader";
import {
  createShaderProgram,
  createFullScreenQuad,
  getAttribLocations,
  getUniformLocations,
} from "../../utils/webGLUtils";
import { fullscreenQuadVertexShaderFlipY } from "@/app/webGL/shaders/fullscreenQuadVertexShader";
import { createGradientLUTTexture } from "../textures/createGradientLUTTexture";

export const createHeatmapLayerRenderer = (
  gl: WebGLRenderingContext,
  points: HeatmapPoint[],
  gradient: Gradient,
  walls: Wall[] = [],
) => {
  const clampedWalls = walls.slice(0, MAX_WALLS);
  const program = createShaderProgram(
    gl,
    fullscreenQuadVertexShaderFlipY,
    generateFragmentShader(points.length, clampedWalls.length),
  );
  const positionBuffer = createFullScreenQuad(gl);
  const attribs = getAttribLocations(gl, program);
  const uniforms = getUniformLocations(gl, program);

  // pixelsPerMeter uniform för meterbaserad propagationsmodell
  const u_pixelsPerMeter = gl.getUniformLocation(program, "u_pixelsPerMeter");

  // Vägg-uniforms
  const u_wallCount = gl.getUniformLocation(program, "u_wallCount");
  const u_walls =
    clampedWalls.length > 0 ? gl.getUniformLocation(program, "u_walls") : null;
  const u_wallAttenuationDb =
    clampedWalls.length > 0
      ? gl.getUniformLocation(program, "u_wallAttenuationDb")
      : null;

  const colorLUT = createGradientLUTTexture(gl, gradient);
  const flatData = Float32Array.from(
    points.flatMap(({ x, y, value }) => [x, y, value]),
  );

  // Platta ut väggdata till Float32Array (4 floats per vägg: x1, y1, x2, y2)
  const wallData =
    clampedWalls.length > 0
      ? Float32Array.from(clampedWalls.flatMap((w) => [w.x1, w.y1, w.x2, w.y2]))
      : null;

  // Attenuation in dB per wall
  const wallAttenuationDbData =
    clampedWalls.length > 0
      ? Float32Array.from(clampedWalls.map((w) => getWallAttenuationDb(w)))
      : null;

  const draw = (options: {
    width: number;
    height: number;
    influenceRadius: number;
    minOpacity: number;
    maxOpacity: number;
    pixelsPerMeter?: number;
  }) => {
    if (!points.length) return;

    const {
      width,
      height,
      influenceRadius,
      minOpacity,
      maxOpacity,
      pixelsPerMeter = 0,
    } = options;

    gl.useProgram(program);
    gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
    gl.enableVertexAttribArray(attribs.a_position);
    gl.vertexAttribPointer(attribs.a_position, 2, gl.FLOAT, false, 0, 0);

    gl.uniform1f(uniforms.u_radius, influenceRadius);
    gl.uniform1f(uniforms.u_pathLossExponent, 2.5);
    gl.uniform1f(u_pixelsPerMeter, pixelsPerMeter);
    gl.uniform1f(uniforms.u_minOpacity, minOpacity);
    gl.uniform1f(uniforms.u_maxOpacity, maxOpacity);
    gl.uniform2f(uniforms.u_resolution, width, height);
    gl.uniform1i(uniforms.u_pointCount, Math.min(points.length, points.length));
    gl.uniform3fv(uniforms.u_points, flatData);

    // Skicka väggdata till shadern
    gl.uniform1i(u_wallCount, clampedWalls.length);
    if (u_walls && wallData) {
      gl.uniform4fv(u_walls, wallData);
    }
    if (u_wallAttenuationDb && wallAttenuationDbData) {
      gl.uniform1fv(u_wallAttenuationDb, wallAttenuationDbData);
    }

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, colorLUT);
    gl.uniform1i(uniforms.u_lut, 0);

    gl.drawArrays(gl.TRIANGLES, 0, 6);
  };

  return { draw };
};
