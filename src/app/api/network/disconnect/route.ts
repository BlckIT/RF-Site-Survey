import { NextResponse, NextRequest } from "next/server";
import { execAsync } from "@/lib/server-utils";
import os from "os";

/** Sanitize a string for safe shell usage */
function sanitize(input: string): string {
  return input.replace(/[^a-zA-Z0-9_.\-]/g, "");
}

/** Build sudo prefix using piped password, matching existing app pattern */
function sudoPrefix(sudoerPassword: string): string {
  const escaped = sudoerPassword.replace(/'/g, "'\\''");
  return `echo '${escaped}' | sudo -S `;
}

export async function POST(request: NextRequest) {
  try {
    if (os.platform() !== "linux") {
      return NextResponse.json(
        { success: false, message: "Disconnect is only supported on Linux." },
        { status: 400 },
      );
    }

    const body = await request.json();
    const { ifname, sudoerPassword } = body;
    const sudo = sudoPrefix(sudoerPassword || "");

    if (!sudoerPassword) {
      return NextResponse.json(
        { success: false, message: "Sudo password required. Set it under Settings." },
        { status: 400 },
      );
    }

    if (!ifname) {
      return NextResponse.json(
        { success: false, message: "ifname is required." },
        { status: 400 },
      );
    }

    const safeIfname = sanitize(ifname);
    await execAsync(`${sudo}nmcli device disconnect ${safeIfname}`);

    return NextResponse.json({
      success: true,
      message: `${safeIfname} disconnected.`,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { success: false, message: `Disconnect error: ${message}` },
      { status: 500 },
    );
  }
}
