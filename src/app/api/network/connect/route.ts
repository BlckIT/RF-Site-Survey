import { NextResponse, NextRequest } from "next/server";
import { execAsync } from "@/lib/server-utils";
import os from "os";

/** Sanitize a string for safe shell usage — allow only alphanumeric, dash, underscore, dot */
function sanitize(input: string): string {
  return input.replace(/[^a-zA-Z0-9_.\-]/g, "");
}

/** Sanitize passphrase — allow printable ASCII minus shell-dangerous chars */
function sanitizePassphrase(input: string): string {
  return input.replace(/[`$\\;"'!&|<>(){}]/g, "");
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
        { success: false, message: "WiFi-anslutning stöds bara på Linux" },
        { status: 400 },
      );
    }

    const body = await request.json();
    const { ssid, password, ifname, hidden, sudoerPassword } = body;
    const sudo = sudoPrefix(sudoerPassword || "");

    if (!sudoerPassword) {
      return NextResponse.json(
        { success: false, message: "Sudo-lösenord krävs. Ange det under Settings." },
        { status: 400 },
      );
    }

    if (!ssid || !ifname) {
      return NextResponse.json(
        { success: false, message: "ssid och ifname krävs" },
        { status: 400 },
      );
    }

    const safeIfname = sanitize(ifname);
    const safeSsid = sanitize(ssid);
    const safePassword = password ? sanitizePassphrase(password) : "";

    if (hidden) {
      // For hidden networks: create connection profile then activate
      const addCmd = safePassword
        ? `${sudo}nmcli connection add type wifi ifname ${safeIfname} con-name '${safeSsid}' ssid '${safeSsid}' wifi.hidden yes wifi-sec.key-mgmt wpa-psk wifi-sec.psk '${safePassword}'`
        : `${sudo}nmcli connection add type wifi ifname ${safeIfname} con-name '${safeSsid}' ssid '${safeSsid}' wifi.hidden yes`;

      await execAsync(addCmd);
      await execAsync(`${sudo}nmcli connection up '${safeSsid}'`);
    } else {
      // For visible networks: direct connect
      const cmd = safePassword
        ? `${sudo}nmcli device wifi connect '${safeSsid}' password '${safePassword}' ifname ${safeIfname}`
        : `${sudo}nmcli device wifi connect '${safeSsid}' ifname ${safeIfname}`;

      await execAsync(cmd);
    }

    return NextResponse.json({
      success: true,
      message: `Ansluten till "${safeSsid}" via ${safeIfname}`,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { success: false, message: `Anslutningsfel: ${message}` },
      { status: 500 },
    );
  }
}
