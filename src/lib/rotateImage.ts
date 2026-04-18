/**
 * rotateImage.ts — Canvas-baserad bildrotation
 * Roterar en bild med angiven vinkel och returnerar en blob + nya dimensioner.
 */

export interface RotationResult {
  blob: Blob;
  width: number;
  height: number;
}

/**
 * Rotera en bild med angiven vinkel (grader).
 * Returnerar en ny PNG-blob med den roterade bilden och nya dimensioner.
 */
export async function rotateImage(
  imageSrc: string,
  angleDeg: number,
): Promise<RotationResult> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      const rad = (angleDeg * Math.PI) / 180;
      const cos = Math.abs(Math.cos(rad));
      const sin = Math.abs(Math.sin(rad));

      // Nya dimensioner efter rotation (bounding box)
      const newW = Math.ceil(img.width * cos + img.height * sin);
      const newH = Math.ceil(img.width * sin + img.height * cos);

      const canvas = document.createElement("canvas");
      canvas.width = newW;
      canvas.height = newH;
      const ctx = canvas.getContext("2d");
      if (!ctx) return reject(new Error("Could not get canvas context"));

      // Flytta origin till mitten, rotera, rita bilden centrerad
      ctx.translate(newW / 2, newH / 2);
      ctx.rotate(rad);
      ctx.drawImage(img, -img.width / 2, -img.height / 2);

      canvas.toBlob(
        (blob) => {
          if (!blob) return reject(new Error("Canvas toBlob failed"));
          resolve({ blob, width: newW, height: newH });
        },
        "image/png",
        1.0,
      );
    };
    img.onerror = () => reject(new Error("Failed to load image"));
    img.src = imageSrc;
  });
}

/**
 * Rotera en punkt runt en given mittpunkt.
 */
export function rotatePoint(
  x: number,
  y: number,
  angleDeg: number,
  cx: number,
  cy: number,
): { x: number; y: number } {
  const rad = (angleDeg * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  return {
    x: cos * (x - cx) + sin * (y - cy) + cx,
    y: -sin * (x - cx) + cos * (y - cy) + cy,
  };
}

/**
 * Beräkna offset för koordinattransformation efter rotation.
 * Originalbildens centrum flyttas till nya bildens centrum.
 */
export function getRotationOffset(
  oldW: number,
  oldH: number,
  newW: number,
  newH: number,
): { dx: number; dy: number } {
  return {
    dx: (newW - oldW) / 2,
    dy: (newH - oldH) / 2,
  };
}
