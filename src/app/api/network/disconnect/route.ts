import { NextResponse, NextRequest } from "next/server";
import os from "os";
import { execFile } from "child_process";

/** Sanitize interface name */
function sanitize(input: string): string {
  return input.replace(/[^a-zA-Z0-9_.-]/g, "");
}

/** Run nmcli with sudo — password piped to stdin, no shell */
async function sudoNmcli(
  sudoerPassword: string,
  args: string[],
): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = execFile(
      "sudo",
      ["-S", "nmcli", ...args],
      { timeout: 30000 },
      (error, stdout, stderr) => {
        if (error) {
          const msg = stderr
            .split("\n")
            .filter((l) => !l.includes("[sudo]") && l.trim())
            .join(" ")
            .trim();
          reject(new Error(msg || error.message));
        } else {
          resolve(stdout.trimEnd());
        }
      },
    );
    child.stdin?.write(sudoerPassword + "\n");
    child.stdin?.end();
  });
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

    if (!sudoerPassword) {
      return NextResponse.json(
        {
          success: false,
          message: "Sudo password required. Set it under Settings.",
        },
        { status: 400 },
      );
    }

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
