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

/** Connection name used for the managed hotspot */
const HOTSPOT_CON_NAME = "rf-survey-hotspot";

export async function GET(request: NextRequest) {
  try {
    if (os.platform() !== "linux") {
      return NextResponse.json({ active: false, ssid: "", ifname: "" });
    }

    const ifname = sanitize(
      request.nextUrl.searchParams.get("ifname") || "wlan0",
    );

    // Check if our managed hotspot connection is active on this interface
    const { stdout } = await execAsync(
      `nmcli -t -f NAME,DEVICE,TYPE connection show --active`,
    );

    const lines = stdout.split("\n");
    let active = false;
    let ssid = "";

    for (const line of lines) {
      const parts = line.split(":");
      if (parts[0] === HOTSPOT_CON_NAME && parts[1] === ifname) {
        active = true;
        break;
      }
    }

    // Get SSID from the connection profile if it exists
    if (active) {
      try {
        const { stdout: ssidOut } = await execAsync(
          `nmcli -t -f 802-11-wireless.ssid connection show ${HOTSPOT_CON_NAME}`,
        );
        ssid = ssidOut.split(":").slice(1).join(":").trim();
      } catch {
        ssid = HOTSPOT_CON_NAME;
      }
    }

    return NextResponse.json({ active, ssid, ifname });
  } catch {
    return NextResponse.json({ active: false, ssid: "", ifname: "" });
  }
}

export async function POST(request: NextRequest) {
  try {
    if (os.platform() !== "linux") {
      return NextResponse.json(
        { success: false, message: "Hotspot is only supported on Linux." },
        { status: 400 },
      );
    }

    const body = await request.json();
    const { action, ifname, ssid, password, sudoerPassword } = body;

    if (!sudoerPassword) {
      return NextResponse.json(
        { success: false, message: "Sudo password required. Set it under Settings." },
        { status: 400 },
      );
    }

    const sudo = sudoPrefix(sudoerPassword);

    if (!action || !ifname) {
      return NextResponse.json(
        { success: false, message: "action and ifname are required." },
        { status: 400 },
      );
    }

    const safeIfname = sanitize(ifname);

    if (action === "start") {
      if (!ssid || !password) {
        return NextResponse.json(
          { success: false, message: "SSID and password are required to start." },
          { status: 400 },
        );
      }
      if (password.length < 8) {
        return NextResponse.json(
          { success: false, message: "Password must be at least 8 characters." },
          { status: 400 },
        );
      }

      const safeSsid = sanitize(ssid);
      const safePassword = sanitizePassphrase(password);

      // Remove any existing hotspot connection profile to start clean
      try {
        await execAsync(`${sudo}nmcli connection delete ${HOTSPOT_CON_NAME}`);
      } catch {
        // Ignore — profile may not exist yet
      }

      // Create a persistent AP connection with power save disabled and stable WPA2
      await execAsync(
        `${sudo}nmcli connection add type wifi ifname ${safeIfname} con-name ${HOTSPOT_CON_NAME} ` +
        `ssid ${safeSsid} ` +
        `802-11-wireless.mode ap ` +
        `802-11-wireless.band bg ` +
        `802-11-wireless.powersave 2 ` +
        `wifi-sec.key-mgmt wpa-psk ` +
        `wifi-sec.proto rsn ` +
        `wifi-sec.pairwise ccmp ` +
        `wifi-sec.group ccmp ` +
        `wifi-sec.psk '${safePassword}' ` +
        `ipv4.method shared ` +
        `ipv6.method disabled ` +
        `connection.autoconnect no`,
      );

      // Activate the connection
      await execAsync(`${sudo}nmcli connection up ${HOTSPOT_CON_NAME}`);

      return NextResponse.json({
        success: true,
        message: `Hotspot "${safeSsid}" started on ${safeIfname}.`,
      });
    }

    if (action === "stop") {
      // Deactivate and remove the connection profile
      try {
        await execAsync(`${sudo}nmcli connection down ${HOTSPOT_CON_NAME}`);
      } catch {
        // May already be down
      }
      try {
        await execAsync(`${sudo}nmcli connection delete ${HOTSPOT_CON_NAME}`);
      } catch {
        // May already be deleted
      }

      return NextResponse.json({
        success: true,
        message: `Hotspot stopped on ${safeIfname}.`,
      });
    }

    return NextResponse.json(
      { success: false, message: `Unknown action: ${action}` },
      { status: 400 },
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { success: false, message: `Hotspot error: ${message}` },
      { status: 500 },
    );
  }
}
