import { NextResponse, NextRequest } from "next/server";
import { execAsync } from "@/lib/server-utils";
import os from "os";

/** Sanitize a string for safe shell usage */
function sanitize(input: string): string {
  return input.replace(/[^a-zA-Z0-9_.\-]/g, "");
}

export async function POST(request: NextRequest) {
  try {
    if (os.platform() !== "linux") {
      return NextResponse.json(
        { success: false, message: "Disconnect stöds bara på Linux" },
        { status: 400 },
      );
    }

    const body = await request.json();
    const { ifname } = body;

    if (!ifname) {
      return NextResponse.json(
        { success: false, message: "ifname krävs" },
        { status: 400 },
      );
    }

    const safeIfname = sanitize(ifname);
    await execAsync(`nmcli device disconnect ${safeIfname}`);

    return NextResponse.json({
      success: true,
      message: `${safeIfname} frånkopplad`,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { success: false, message: `Frånkopplingsfel: ${message}` },
      { status: 500 },
    );
  }
}
