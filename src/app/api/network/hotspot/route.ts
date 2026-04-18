import { NextResponse, NextRequest } from "next/server";
import os from "os";
import { execFile } from "child_process";
import { sudoNmcli } from "@/lib/sudo-utils";

/** Sanitize interface name */
function sanitize(input: string): string {
  return input.replace(/[^a-zA-Z0-9_.-]/g, "");
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

    const { stdout } = await new Promise<{ stdout: string; stderr: string }>(
      (resolve, reject) => {
        execFile(
          "nmcli",
          ["-t", "-f", "NAME,DEVICE,TYPE", "connection", "show", "--active"],
          (error, stdout, stderr) => {
            if (error) reject(error);
            else resolve({ stdout: String(stdout), stderr: String(stderr) });
          },
        );
      },
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

    if (active) {
      try {
        const { stdout: ssidOut } = await new Promise<{
          stdout: string;
          stderr: string;
        }>((resolve, reject) => {
          execFile(
            "nmcli",
            [
              "-t",
              "-f",
              "802-11-wireless.ssid",
              "connection",
              "show",
              HOTSPOT_CON_NAME,
            ],
            (error, stdout, stderr) => {
              if (error) reject(error);
              else resolve({ stdout: String(stdout), stderr: String(stderr) });
            },
          );
        });
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

    if (!action || !ifname) {
      return NextResponse.json(
        { success: false, message: "action and ifname are required." },
        { status: 400 },
      );
    }

    const safeIfname = sanitize(ifname);

    if (action === "start") {
      if (!ssid) {
        return NextResponse.json(
          { success: false, message: "SSID is required to start." },
          { status: 400 },
        );
      }

      // Remove any existing hotspot connection profile
      try {
        await sudoNmcli(sudoerPassword, [
          "connection",
          "delete",
          HOTSPOT_CON_NAME,
        ]);
      } catch {
        // Profile may not exist
      }

      // Build connection args — open network if no password
      const addArgs = [
        "connection",
        "add",
        "type",
        "wifi",
        "ifname",
        safeIfname,
        "con-name",
        HOTSPOT_CON_NAME,
        "ssid",
        ssid,
        "802-11-wireless.mode",
        "ap",
        "802-11-wireless.band",
        "bg",
        "802-11-wireless.powersave",
        "2",
        "ipv4.method",
        "shared",
        "ipv6.method",
        "disabled",
        "connection.autoconnect",
        "no",
      ];

      if (password && password.length >= 8) {
        addArgs.push(
          "wifi-sec.key-mgmt",
          "wpa-psk",
          "wifi-sec.proto",
          "rsn",
          "wifi-sec.pairwise",
          "ccmp",
          "wifi-sec.group",
          "ccmp",
          "wifi-sec.psk",
          password,
        );
      }

      await sudoNmcli(sudoerPassword, addArgs);
      await sudoNmcli(sudoerPassword, ["connection", "up", HOTSPOT_CON_NAME]);

      return NextResponse.json({
        success: true,
        message: `Hotspot "${ssid}" started on ${safeIfname}.`,
      });
    }

    if (action === "stop") {
      try {
        await sudoNmcli(sudoerPassword, [
          "connection",
          "down",
          HOTSPOT_CON_NAME,
        ]);
      } catch {
        // May already be down
      }
      try {
        await sudoNmcli(sudoerPassword, [
          "connection",
          "delete",
          HOTSPOT_CON_NAME,
        ]);
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
      { success: false, message: message },
      { status: 500 },
    );
  }
}
