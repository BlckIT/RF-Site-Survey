import { NextResponse } from "next/server";
import { execAsync } from "@/lib/server-utils";
import os from "os";
import { parseIwScanDump, inferWifiDeviceIdOnLinux } from "@/lib/wifiScanner-linux";

export async function GET(request: Request) {
  try {
    if (os.platform() !== "linux") {
      return NextResponse.json({ ssids: [] });
    }

    const url = new URL(request.url);
    const iface = url.searchParams.get("iface") || "";

    const wlanInterface = await inferWifiDeviceIdOnLinux(iface || undefined);
    if (!wlanInterface) {
      return NextResponse.json({ ssids: [], error: "No WiFi interface found" });
    }

    // Kör iw scan dump (kräver sudo)
    let cmd = `sudo iw dev ${wlanInterface} scan dump`;
    const { stdout } = await execAsync(cmd);

    const allAPs = parseIwScanDump(stdout);

    // Behåll starkaste per SSID+band kombination
    const seen = new Map<string, (typeof allAPs)[0]>();
    for (const ap of allAPs) {
      if (!ap.ssid) continue; // skippa dolda nätverk
      const key = `${ap.ssid}::${ap.band}`;
      const existing = seen.get(key);
      if (existing && existing.signalStrength >= ap.signalStrength) continue;
      seen.set(key, ap);
    }

    const ssids = Array.from(seen.values());

    return NextResponse.json({ ssids });
  } catch {
    return NextResponse.json({ ssids: [] });
  }
}
