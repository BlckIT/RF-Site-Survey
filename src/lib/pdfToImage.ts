/**
 * Client-side PDF to PNG conversion using pdfjs-dist.
 * Renders the first page of a PDF to a canvas, then returns a Blob.
 * No native dependencies required — runs entirely in the browser.
 *
 * Future: accept pageNumber param for multi-page/multi-floor support.
 */

/**
 * Convert a PDF File to a PNG Blob (first page only).
 * @param pdfFile - The PDF File object from a file input
 * @param scale - Render scale (2.0 = ~150 DPI from default 72 DPI)
 * @returns PNG Blob + suggested filename
 */
export async function pdfToImage(
  pdfFile: File,
  scale: number = 2.0,
): Promise<{ blob: Blob; filename: string }> {
  // Dynamic import to avoid SSR issues (DOMMatrix not available in Node.js)
  const pdfjsLib = await import("pdfjs-dist");
  pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
    "pdfjs-dist/build/pdf.worker.mjs",
    import.meta.url,
  ).toString();

  const arrayBuffer = await pdfFile.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(arrayBuffer) })
    .promise;

  if (pdf.numPages === 0) {
    throw new Error("PDF has no pages");
  }

  // TODO: multi-page support — for now always page 1
  const page = await pdf.getPage(1);
  const viewport = page.getViewport({ scale });

  const canvas = document.createElement("canvas");
  canvas.width = viewport.width;
  canvas.height = viewport.height;
  const context = canvas.getContext("2d")!;

  await page.render({ canvas, canvasContext: context, viewport }).promise;

  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error("Canvas toBlob failed"))),
      "image/png",
    );
  });

  const filename = pdfFile.name.replace(/\.pdf$/i, ".png");
  return { blob, filename };
}
