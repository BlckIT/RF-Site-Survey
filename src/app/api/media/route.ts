// app/api/media/route.ts
/**
 * /media API
 * GET /media returns a list of the files in the /public/media directory
 * POST /media ... uploads a file (supports PNG, JPG, and PDF)
 *
 * PDF files are converted server-side to PNG using pdfjs-dist + node-canvas.
 * Currently only the first page is rendered. The code is structured to
 * support multi-page selection in the future.
 *
 * NOTE: The `canvas` npm package requires native build tools.
 * On Debian/Ubuntu/Raspberry Pi: apt install build-essential libcairo2-dev \
 *   libjpeg-dev libpango1.0-dev libgif-dev librsvg2-dev
 */
import { NextResponse } from "next/server";
import { readdir, writeFile } from "fs/promises";
import path from "path";

// Max PDF file size: 50 MB
const MAX_PDF_SIZE = 50 * 1024 * 1024;

// Ensure body parsing is disabled so we can handle file uploads
export const config = {
  api: {
    bodyParser: false,
  },
};

export async function GET() {
  try {
    const mediaDir = path.join(process.cwd(), "public", "media");
    const files = await readdir(mediaDir);
    return NextResponse.json({ files });
  } catch (err) {
    return NextResponse.json(
      { error: `Unable to list files ${err}` },
      { status: 500 },
    );
  }
}

/**
 * Convert the first page of a PDF buffer to a PNG buffer.
 * Future: accept a `pageNumber` param to support multi-page PDFs
 * where each page represents a different floor.
 */
async function convertPdfToPng(
  pdfBytes: Uint8Array,
  _pageNumber: number = 1,
): Promise<Buffer> {
  // Dynamic imports to keep these server-only
  const { createCanvas } = await import("canvas");
  const pdfjsLib = await import("pdfjs-dist/legacy/build/pdf.mjs");

  // Disable worker for server-side usage
  pdfjsLib.GlobalWorkerOptions.workerSrc = "";

  const pdf = await pdfjsLib.getDocument({ data: pdfBytes, useSystemFonts: true }).promise;

  if (pdf.numPages === 0) {
    throw new Error("PDF has no pages");
  }

  // TODO: multi-page support — for now always page 1
  const page = await pdf.getPage(1);

  // Render at ~150 DPI (scale 2.0 from default 72 DPI)
  const viewport = page.getViewport({ scale: 2.0 });
  const canvas = createCanvas(viewport.width, viewport.height);
  const context = canvas.getContext("2d");

  // pdfjs render expects a CanvasRenderingContext2D-like object;
  // node-canvas provides a compatible one.
  // canvas must be null when using canvasContext directly (node-canvas)
  await page.render({
    canvas: null,
    canvasContext: context as unknown as CanvasRenderingContext2D,
    viewport,
  }).promise;

  return canvas.toBuffer("image/png");
}

function isPdf(file: File): boolean {
  return (
    file.type === "application/pdf" ||
    file.name.toLowerCase().endsWith(".pdf")
  );
}

export async function POST(req: Request) {
  const formData = await req.formData();
  const file = formData.get("file") as File;

  if (!file || typeof file.name !== "string") {
    return NextResponse.json({ error: "No file uploaded" }, { status: 400 });
  }

  const mediaDir = path.join(process.cwd(), "public", "media");

  // --- PDF handling ---
  if (isPdf(file)) {
    if (file.size > MAX_PDF_SIZE) {
      return NextResponse.json(
        { error: "PDF too large (max 50 MB)" },
        { status: 400 },
      );
    }

    try {
      const pdfBytes = new Uint8Array(await file.arrayBuffer());
      const pngBuffer = await convertPdfToPng(pdfBytes);
      const pngFilename = file.name.replace(/\.pdf$/i, ".png");
      const filePath = path.join(mediaDir, pngFilename);

      await writeFile(filePath, pngBuffer);
      return NextResponse.json({ status: "success", name: pngFilename });
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Unknown PDF conversion error";
      return NextResponse.json(
        { error: `PDF conversion failed: ${message}` },
        { status: 500 },
      );
    }
  }

  // --- Regular image handling ---
  const buffer = Buffer.from(await file.arrayBuffer());
  const filePath = path.join(mediaDir, file.name);

  await writeFile(filePath, buffer);
  return NextResponse.json({ status: "success", name: file.name });
}
