/**
 * /api/settings/poll — lättviktig endpoint för synk-polling.
 * Returnerar bara lastModified + antal surveyPoints per våning,
 * så klienter kan avgöra om de behöver ladda om fullständig data.
 *
 * GET /api/settings/poll?name=<siteName>
 */
import { NextRequest, NextResponse } from "next/server";
import { readFile, stat } from "fs/promises";
import path from "path";
import { sanitizeFilename } from "@/lib/utils";

const SURVEYS_DIR = path.join(process.cwd(), "data", "surveys");

export async function GET(request: NextRequest) {
  const name = request.nextUrl.searchParams.get("name");
  if (!name) {
    return NextResponse.json(
      { error: "Missing 'name' query parameter" },
      { status: 400 },
    );
  }

  const sanitized = sanitizeFilename(name);
  const filePath = path.join(SURVEYS_DIR, `${sanitized}.json`);

  try {
    const [fileContent, fileStat] = await Promise.all([
      readFile(filePath, "utf-8"),
      stat(filePath),
    ]);

    const data = JSON.parse(fileContent);

    // Räkna totalt antal surveyPoints över alla våningar
    let totalPoints = 0;
    if (data.site?.floors) {
      for (const floor of data.site.floors) {
        totalPoints += floor.surveyPoints?.length ?? 0;
      }
    } else if (data.surveyPoints) {
      totalPoints = data.surveyPoints.length;
    }

    return NextResponse.json({
      lastModified: data.lastModified ?? fileStat.mtimeMs,
      totalPoints,
    });
  } catch (err: unknown) {
    if (err instanceof Error && "code" in err && err.code === "ENOENT") {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    return NextResponse.json({ error: `Poll failed: ${err}` }, { status: 500 });
  }
}
