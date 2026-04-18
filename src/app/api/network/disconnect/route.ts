import { NextResponse, NextRequest } from "next/server";
import os from "os";
import { sudoNmcli } from "@/lib/sudo-utils";

/** Sanitize interface name */
function sanitize(input: string): string {
  return input.replace(/[^a-zA-Z0-9_.-]/g, "");
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

    if (!ifname) {
      return NextResponse.json(
        { success: false, message: "Interface name is required." },
        { status: 400 },
      );
    }

    const safeIfname = sanitize(ifname);
    await sudoNmcli(sudoerPassword, ["device", "disconnect", safeIfname]);

    return NextResponse.json({
      success: true,
      message: `${safeIfname} disconnected.`,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { success: false, message: message },
      { status: 500 },
    );
  }
}
