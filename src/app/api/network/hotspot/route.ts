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

export async function GET(request: NextRequest) {
  try {
    if (os.platform() !== "linux") {
      return NextResponse.json({ active: false, ssid: "", ifname: "" });
    }

    const ifname = sanitize(
      request.nextUrl.searchParams.get("ifname") || "wlan0",
    );

    const { stdout } = await execAsync(
      `nmcli -t -f GENERAL.STATE,GENERAL.CONNECTION device show ${ifname}`,
    );

    const lines = stdout.split("\n");
    let connection = "";
    let state = "";

    for (const line of lines) {
      if (line.startsWith("GENERAL.CONNECTION:")) {
        connection = line.split(":").slice(1).join(":").trim();
      }
      if (line.startsWith("GENERAL.STATE:")) {
        state = line.split(":").slice(1).join(":").trim();
      }
    }

    const isConnected = state.includes("100");
    const isHotspot = connection.toLowerCase().includes("hotspot");

    return NextResponse.json({
      active: isConnected && isHotspot,
      ssid: isHotspot ? connection : "",
      ifname,
    });
  } catch {
    return NextResponse.json({ active: false, ssid: "", ifname: "" });
  }
}

export async function POST(request: NextRequest) {
  try {
    if (os.platform() !== "linux") {
      return NextResponse.json(
        { success: false, message: "Hotspot stöds bara på Linux" },
        { status: 400 },
      );
    }

    const body = await request.json();
    const { action, ifname, ssid, password } = body;

    if (!action || !ifname) {
      return NextResponse.json(
        { success: false, message: "action och ifname krävs" },
        { status: 400 },
      );
    }

    const safeIfname = sanitize(ifname);

    if (action === "start") {
      if (!ssid || !password) {
        return NextResponse.json(
          { success: false, message: "ssid och password krävs för start" },
          { status: 400 },
        );
      }
      if (password.length < 8) {
        return NextResponse.json(
          { success: false, message: "Lösenord måste vara minst 8 tecken" },
          { status: 400 },
        );
      }

      const safeSsid = sanitize(ssid);
      const safePassword = sanitizePassphrase(password);

      await execAsync(
        `nmcli device wifi hotspot ifname ${safeIfname} ssid ${safeSsid} password '${safePassword}'`,
      );

      return NextResponse.json({
        success: true,
        message: `Hotspot "${safeSsid}" startad på ${safeIfname}`,
      });
    }

    if (action === "stop") {
      await execAsync(`nmcli device disconnect ${safeIfname}`);
      return NextResponse.json({
        success: true,
        message: `Hotspot stoppad på ${safeIfname}`,
      });
    }

    return NextResponse.json(
      { success: false, message: `Okänd action: ${action}` },
      { status: 400 },
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { success: false, message: `Hotspot-fel: ${message}` },
      { status: 500 },
    );
  }
}
