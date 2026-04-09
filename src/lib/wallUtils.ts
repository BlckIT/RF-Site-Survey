/**
 * wallUtils.ts — Geometrifunktioner för vägghantering
 *
 * Används för att räkna ut om en vägg korsar linjen mellan två punkter,
 * och för att dämpa signalstyrkan baserat på antal korsade väggar.
 */

import { Wall } from "./types";

/**
 * Kontrollera om två linjesegment korsar varandra.
 * Segment 1: (p1x,p1y)-(p2x,p2y)
 * Segment 2: (p3x,p3y)-(p4x,p4y)
 * Returnerar true om de korsar varandra.
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
  if (Math.abs(denom) < 1e-10) return false; // Parallella linjer

  const t = ((p3x - p1x) * d2y - (p3y - p1y) * d2x) / denom;
  const u = ((p3x - p1x) * d1y - (p3y - p1y) * d1x) / denom;

  return t > 0 && t < 1 && u > 0 && u < 1;
}

/**
 * Räkna antal väggar som korsar linjen mellan två punkter.
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
 * Dämpningsfaktor baserat på antal korsade väggar.
 * Varje vägg multiplicerar signalen med WALL_ATTENUATION_FACTOR.
 */
const WALL_ATTENUATION_FACTOR = 0.3;

export function wallAttenuation(wallCount: number): number {
  if (wallCount <= 0) return 1.0;
  return Math.pow(WALL_ATTENUATION_FACTOR, wallCount);
}
