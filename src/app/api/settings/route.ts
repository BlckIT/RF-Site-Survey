/**
 * /api/settings API
 * GET /api/settings?name=<floorplan-name> - reads settings for a floorplan/site
 * GET /api/settings?list=true - lists all available survey files
 * POST /api/settings - writes settings to a file
 * DELETE /api/settings?name=<name>&action=delete - deletes a survey file
 */
import { NextRequest, NextResponse } from "next/server";
import { readFile, writeFile, mkdir, readdir, unlink } from "fs/promises";
import path from "path";
import { sanitizeFilename } from "@/lib/utils";

const SURVEYS_DIR = path.join(process.cwd(), "data", "surveys");

/**
 * Get the full path for a survey file
 */
function getSurveyPath(floorplanName: string): string {
  const sanitized = sanitizeFilename(floorplanName);
  return path.join(SURVEYS_DIR, `${sanitized}.json`);
}

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const listAll = searchParams.get("list");
  const name = searchParams.get("name");

  // Lista alla survey-filer — returnera riktiga site-namn från JSON-innehållet
  if (listAll === "true") {
    try {
      await mkdir(SURVEYS_DIR, { recursive: true });
      const files = await readdir(SURVEYS_DIR);
      const jsonFiles = files.filter((f) => f.endsWith(".json"));
      const surveys: string[] = [];
      for (const f of jsonFiles) {
        const fallbackName = f.replace(".json", "");
        try {
          const content = await readFile(path.join(SURVEYS_DIR, f), "utf-8");
          const data = JSON.parse(content);
          surveys.push(data.site?.name || fallbackName);
        } catch {
          surveys.push(fallbackName);
        }
      }
      return NextResponse.json({ surveys });
    } catch (err) {
      return NextResponse.json(
        { error: `Unable to list surveys: ${err}` },
        { status: 500 },
      );
    }
  }

  // Read a specific survey file
  if (!name) {
    return NextResponse.json(
      { error: "Missing 'name' query parameter" },
      { status: 400 },
    );
  }

  try {
    const filePath = getSurveyPath(name);
    const data = await readFile(filePath, "utf-8");
    return NextResponse.json(JSON.parse(data));
  } catch (err: unknown) {
    if (err instanceof Error && "code" in err && err.code === "ENOENT") {
      return NextResponse.json({ error: "Survey not found" }, { status: 404 });
    }
    return NextResponse.json(
      { error: `Unable to read survey: ${err}` },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const settings = await request.json();

    // Determine filename: use site name if available, fall back to floorplanImageName
    const siteName = settings.site?.name;
    const fileName = siteName || settings.floorplanImageName;

    if (!fileName) {
      return NextResponse.json(
        { error: "Missing site name or floorplanImageName in settings" },
        { status: 400 },
      );
    }

    // Ensure surveys directory exists
    await mkdir(SURVEYS_DIR, { recursive: true });

    // Remove sensitive data before saving
    const { sudoerPassword: _, ...safeSettings } = settings;

    const filePath = getSurveyPath(fileName);
    await writeFile(filePath, JSON.stringify(safeSettings, null, 2));

    return NextResponse.json({ status: "success", path: filePath });
  } catch (err) {
    return NextResponse.json(
      { error: `Unable to save survey: ${err}` },
      { status: 500 },
    );
  }
}

export async function DELETE(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const name = searchParams.get("name");

  if (!name) {
    return NextResponse.json(
      { error: "Missing 'name' query parameter" },
      { status: 400 },
    );
  }

  try {
    const filePath = getSurveyPath(name);
    await unlink(filePath);
    return NextResponse.json({ status: "success" });
  } catch (err: unknown) {
    if (err instanceof Error && "code" in err && err.code === "ENOENT") {
      return NextResponse.json({ error: "Survey not found" }, { status: 404 });
    }
    return NextResponse.json(
      { error: `Unable to delete survey: ${err}` },
      { status: 500 },
    );
  }
}
