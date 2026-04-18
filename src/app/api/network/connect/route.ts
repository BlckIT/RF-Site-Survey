import { NextResponse, NextRequest } from "next/server";
import os from "os";
import { sudoNmcli } from "@/lib/sudo-utils";

/** Sanitize interface name — allow only alphanumeric, dash, underscore, dot */
function sanitize(input: string): string {
  return input.replace(/[^a-zA-Z0-9_.-]/g, "");
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

    if (!ssid || !ifname) {
      return NextResponse.json(
        { success: false, message: "SSID and interface are required." },
        { status: 400 },
      );
    }

    const safeIfname = sanitize(ifname);

    if (hidden) {
      const addArgs = [
        "connection",
        "add",
        "type",
        "wifi",
        "ifname",
        safeIfname,
        "con-name",
        ssid,
        "ssid",
        ssid,
        "wifi.hidden",
        "yes",
      ];
      if (password) {
        addArgs.push("wifi-sec.key-mgmt", "wpa-psk", "wifi-sec.psk", password);
      }
      await sudoNmcli(sudoerPassword, addArgs);
      await sudoNmcli(sudoerPassword, ["connection", "up", ssid]);
    } else {
      const connectArgs = [
        "device",
        "wifi",
        "connect",
        ssid,
        "ifname",
        safeIfname,
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
