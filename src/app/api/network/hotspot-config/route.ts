import { NextResponse, NextRequest } from "next/server";
import { readFile, writeFile, mkdir } from "fs/promises";
import path from "path";

const CONFIG_DIR = path.join(process.cwd(), "data");
const CONFIG_PATH = path.join(CONFIG_DIR, "hotspot-config.json");

/** Systemd-tjänstens config-sökväg (synkas dit om den finns) */
const SYSTEM_CONFIG_PATH = "/opt/rf-survey/hotspot-config.json";

interface HotspotConfig {
  ssid: string;
  password: string;
  enabled: boolean;
}

const DEFAULT_CONFIG: HotspotConfig = {
  ssid: "Buster",
  password: "",
  enabled: true,
};

export async function GET() {
  try {
    const data = await readFile(CONFIG_PATH, "utf-8");
    return NextResponse.json({ success: true, config: JSON.parse(data) });
  } catch {
    return NextResponse.json({ success: true, config: DEFAULT_CONFIG });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const config: HotspotConfig = {
      ssid: body.ssid || DEFAULT_CONFIG.ssid,
      password: body.password ?? DEFAULT_CONFIG.password,
      enabled: body.enabled ?? DEFAULT_CONFIG.enabled,
    };

    await mkdir(CONFIG_DIR, { recursive: true });
    const json = JSON.stringify(config, null, 2);
    await writeFile(CONFIG_PATH, json);

    // Synka till systemd-sökvägen om katalogen finns
    try {
      await mkdir(path.dirname(SYSTEM_CONFIG_PATH), { recursive: true });
      await writeFile(SYSTEM_CONFIG_PATH, json);
    } catch {
      // /opt/rf-survey kanske inte finns — ignorera
    }

    return NextResponse.json({ success: true, config });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ success: false, message }, { status: 500 });
  }
}
