import { NextResponse, NextRequest } from "next/server";
import os from "os";
import { readFile, writeFile, mkdir } from "fs/promises";
import path from "path";
import { sudoNmcli } from "@/lib/sudo-utils";

/** Sanitera input — tillåt bara alfanumeriska, bindestreck, understreck, punkt, mellanslag */
function sanitize(input: string): string {
  return input.replace(/[^a-zA-Z0-9_.\- ]/g, "");
}

interface KnownWifi {
  ssid: string;
  password?: string;
  priority: number;
  autoConnect: boolean;
}

const DATA_DIR = path.join(process.cwd(), "data");

/** Prefix för NM connections skapade av appen */
const NM_CON_PREFIX = "rf-known-";

export async function GET() {
  try {
    const configPath = path.join(DATA_DIR, "known-networks.json");
    try {
      const data = await readFile(configPath, "utf-8");
      const networks: KnownWifi[] = JSON.parse(data);
      return NextResponse.json({ success: true, networks });
    } catch {
      return NextResponse.json({ success: true, networks: [] });
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ success: false, message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    if (os.platform() !== "linux") {
      return NextResponse.json(
        {
          success: false,
          message: "Known networks sync is only supported on Linux.",
        },
        { status: 400 },
      );
    }

    const body = await request.json();
    const { networks, sudoerPassword } = body as {
      networks: KnownWifi[];
      sudoerPassword: string | undefined;
    };

    if (!Array.isArray(networks)) {
      return NextResponse.json(
        { success: false, message: "networks must be an array." },
        { status: 400 },
      );
    }

    // 1. Spara till fil
    await mkdir(DATA_DIR, { recursive: true });
    const configPath = path.join(DATA_DIR, "known-networks.json");
    await writeFile(configPath, JSON.stringify(networks, null, 2));

    // 2. Ta bort gamla rf-known-* connections från NM
    try {
      const existing = await sudoNmcli(sudoerPassword, [
        "-t",
        "-f",
        "NAME",
        "connection",
        "show",
      ]);
      const existingNames = existing
        .split("\n")
        .filter((n) => n.startsWith(NM_CON_PREFIX));
      for (const name of existingNames) {
        try {
          await sudoNmcli(sudoerPassword, ["connection", "delete", name]);
        } catch {
          // Ignorera om den inte finns
        }
      }
    } catch {
      // Inga befintliga connections att ta bort
    }

    // 3. Skapa nya NM connections för varje known network
    const results: string[] = [];
    for (const net of networks) {
      const conName = `${NM_CON_PREFIX}${sanitize(net.ssid)}`;
      const args: string[] = [
        "connection",
        "add",
        "type",
        "wifi",
        "con-name",
        conName,
        "ssid",
        net.ssid,
        "connection.autoconnect",
        net.autoConnect ? "yes" : "no",
        "connection.autoconnect-priority",
        String(net.priority),
      ];

      if (net.password && net.password.length >= 8) {
        args.push("wifi-sec.key-mgmt", "wpa-psk", "wifi-sec.psk", net.password);
      }

      try {
        await sudoNmcli(sudoerPassword, args);
        results.push(`${net.ssid}: synced`);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        results.push(`${net.ssid}: failed (${msg})`);
      }
    }

    return NextResponse.json({
      success: true,
      message: `Synced ${networks.length} network(s) to NetworkManager.`,
      details: results,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ success: false, message }, { status: 500 });
  }
}
