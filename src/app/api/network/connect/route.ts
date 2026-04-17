import { NextResponse, NextRequest } from "next/server";
import os from "os";
import { execFile } from "child_process";
import { promisify } from "util";

const execFileAsync = promisify(execFile);

/** Sanitize interface name — allow only alphanumeric, dash, underscore, dot */
function sanitize(input: string): string {
  return input.replace(/[^a-zA-Z0-9_.\-]/g, "");
}

/**
 * Run nmcli with sudo via execFile (no shell interpolation).
 * Password is piped to sudo stdin safely.
 */
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
          // Extract useful message from stderr (skip sudo password prompt)
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
    // Pipe sudo password to stdin
    child.stdin?.write(sudoerPassword + "\n");
    child.stdin?.end();
  });
}

export async function POST(request: NextRequest) {
  try {
    if (os.platform() !== "linux") {
      return NextResponse.json(
        { success: false, message: "WiFi connect is only supported on Linux." },
        { status: 400 },
      );
    }

    const body = await request.json();
    const { ssid, password, ifname, hidden, sudoerPassword } = body;

    if (!sudoerPassword) {
      return NextResponse.json(
        { success: false, message: "Sudo password required. Set it under Settings." },
        { status: 400 },
      );
    }

    if (!ssid || !ifname) {
      return NextResponse.json(
        { success: false, message: "SSID and interface are required." },
        { status: 400 },
      );
    }

    const safeIfname = sanitize(ifname);

    if (hidden) {
      // For hidden networks: create connection profile then activate
      const addArgs = [
        "connection", "add",
        "type", "wifi",
        "ifname", safeIfname,
        "con-name", ssid,
        "ssid", ssid,
        "wifi.hidden", "yes",
      ];
      if (password) {
        addArgs.push("wifi-sec.key-mgmt", "wpa-psk", "wifi-sec.psk", password);
      }
      await sudoNmcli(sudoerPassword, addArgs);
      await sudoNmcli(sudoerPassword, ["connection", "up", ssid]);
    } else {
      // For visible networks: direct connect
      const connectArgs = [
        "device", "wifi", "connect", ssid,
        "ifname", safeIfname,
      ];
      if (password) {
        connectArgs.push("password", password);
      }
      await sudoNmcli(sudoerPassword, connectArgs);
    }

    return NextResponse.json({
      success: true,
      message: `Connected to "${ssid}" via ${safeIfname}.`,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { success: false, message: message },
      { status: 500 },
    );
  }
}
