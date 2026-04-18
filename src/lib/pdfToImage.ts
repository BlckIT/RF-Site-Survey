/**
 * Client-side PDF to PNG conversion using pdfjs-dist.
 * Stödjer specifik sida och multi-page info.
 */

/**
 * Hämta antal sidor i en PDF.
 */
export async function getPdfPageCount(pdfFile: File): Promise<number> {
  const pdfjsLib = await import("pdfjs-dist");
  pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
    "pdfjs-dist/build/pdf.worker.mjs",
    import.meta.url,
  ).toString();

  const arrayBuffer = await pdfFile.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(arrayBuffer) })
    .promise;
  return pdf.numPages;
}

/**
 * Rendera en specifik sida som PNG blob.
 * @param pdfFile - PDF File-objekt
 * @param pageNumber - Sidnummer (1-baserat)
 * @param scale - Render-skala (2.0 = ~150 DPI)
 */
export async function pdfToImage(
  pdfFile: File,
  scale: number = 2.0,
  pageNumber: number = 1,
): Promise<{ blob: Blob; filename: string }> {
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
  if (pageNumber < 1 || pageNumber > pdf.numPages) {
    throw new Error(`Page ${pageNumber} out of range (1-${pdf.numPages})`);
  }

  const page = await pdf.getPage(pageNumber);
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

  const baseName = pdfFile.name.replace(/\.pdf$/i, "");
  const filename =
    pdf.numPages > 1 ? `${baseName}-page${pageNumber}.png` : `${baseName}.png`;
  return { blob, filename };
}

/**
 * Rendera en thumbnail (liten förhandsvisning) av en PDF-sida.
 * @param pdfFile - PDF File-objekt
 * @param pageNumber - Sidnummer (1-baserat)
 * @param maxWidth - Max bredd i pixlar för thumbnail
 */
export async function pdfPageThumbnail(
  pdfFile: File,
  pageNumber: number,
  maxWidth: number = 200,
): Promise<string> {
  const pdfjsLib = await import("pdfjs-dist");
  pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
    "pdfjs-dist/build/pdf.worker.mjs",
    import.meta.url,
  ).toString();

  const arrayBuffer = await pdfFile.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(arrayBuffer) })
    .promise;

  const page = await pdf.getPage(pageNumber);
  const defaultViewport = page.getViewport({ scale: 1 });
  const scale = maxWidth / defaultViewport.width;
  const viewport = page.getViewport({ scale });

  const canvas = document.createElement("canvas");
  canvas.width = viewport.width;
  canvas.height = viewport.height;
  const context = canvas.getContext("2d")!;

  await page.render({ canvas, canvasContext: context, viewport }).promise;

  return canvas.toDataURL("image/png");
}
