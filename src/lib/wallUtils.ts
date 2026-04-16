/**
 * wallUtils.ts — Geometry functions for wall handling
 *
 * Used to determine if a wall crosses the line between two points,
 * and to attenuate signal strength based on the number of crossed walls.
 */

import { Wall, getWallDampening } from "./types";

/**
 * Check if two line segments intersect.
 * Segment 1: (p1x,p1y)-(p2x,p2y)
 * Segment 2: (p3x,p3y)-(p4x,p4y)
 * Returns true if they intersect.
 */
export function segmentsIntersect(
  p1x: number,
  p1y: number,
  p2x: number,
  p2y: number,
  p3x: number,
  p3y: number,
  p4x: number,
  p4y: number,
): boolean {
  const d1x = p2x - p1x;
  const d1y = p2y - p1y;
  const d2x = p4x - p3x;
  const d2y = p4y - p3y;

  const denom = d1x * d2y - d1y * d2x;
  if (Math.abs(denom) < 1e-10) return false; // Parallel lines

  const t = ((p3x - p1x) * d2y - (p3y - p1y) * d2x) / denom;
  const u = ((p3x - p1x) * d1y - (p3y - p1y) * d1x) / denom;

  return t > 0 && t < 1 && u > 0 && u < 1;
}

/**
 * Count the number of walls crossing the line between two points.
 */
export function countWallCrossings(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  walls: Wall[],
): number {
  let count = 0;
  for (const wall of walls) {
    if (segmentsIntersect(x1, y1, x2, y2, wall.x1, wall.y1, wall.x2, wall.y2)) {
      count++;
    }
  }
  return count;
}

/**
 * Attenuation factor based on crossed walls.
 * Uses per-wall dampening from material presets.
 */
export function wallAttenuation(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  walls: Wall[],
): number {
  let attenuation = 1.0;
  for (const wall of walls) {
    if (segmentsIntersect(x1, y1, x2, y2, wall.x1, wall.y1, wall.x2, wall.y2)) {
      attenuation *= getWallDampening(wall);
    }
  }
  return attenuation;
}
