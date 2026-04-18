/**
 * /api/global-settings
 * GET  — läs globala settings från data/settings.json (eller returnera tom {} om filen saknas)
 * POST — spara globala settings till data/settings.json
 */
import { NextRequest, NextResponse } from "next/server";
import { readFile, writeFile, mkdir } from "fs/promises";
import path from "path";

const SETTINGS_PATH = path.join(process.cwd(), "data", "settings.json");

export async function GET() {
  try {
    const data = await readFile(SETTINGS_PATH, "utf-8");
    return NextResponse.json(JSON.parse(data));
  } catch (err: unknown) {
    if (err instanceof Error && "code" in err && err.code === "ENOENT") {
      return NextResponse.json({});
    }
    return NextResponse.json(
      { error: `Unable to read global settings: ${err}` },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const globals = await request.json();

    // Säkerställ att data-katalogen finns
    await mkdir(path.dirname(SETTINGS_PATH), { recursive: true });

    await writeFile(SETTINGS_PATH, JSON.stringify(globals, null, 2));
    return NextResponse.json({ status: "success" });
  } catch (err) {
    return NextResponse.json(
      { error: `Unable to save global settings: ${err}` },
      { status: 500 },
    );
  }
}
