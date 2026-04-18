import { NextResponse } from "next/server";
import { execAsync } from "@/lib/server-utils";
import os from "os";
import { channelToBand, percentageToRssi, bySignalStrength } from "@/lib/utils";
import { splitColonDelimited } from "@/lib/wifiScanner-linux";
import { WifiResults } from "@/lib/types";
import { getDefaultWifiResults } from "@/lib/utils";

export async function GET(request: Request) {
  try {
    if (os.platform() !== "linux") {
      return NextResponse.json({ ssids: [] });
    }

    const url = new URL(request.url);
    const iface = url.searchParams.get("iface") || "";

    let cmd =
      "nmcli -t -f IN-USE,BSSID,SSID,MODE,CHAN,RATE,SIGNAL,BARS,SECURITY dev wifi list";
    if (iface) {
      cmd += ` ifname ${iface}`;
    }

    const { stdout } = await execAsync(cmd);
    const lines = stdout.split("\n");
    // Behåll alla poster per SSID+band (för gruppering i frontend)
    const seen = new Map<string, WifiResults>();

    for (const line of lines) {
      if (line.startsWith("//") || !line.trim()) continue;
      const cols = splitColonDelimited(line);
      if (cols.length < 7) continue;

      const ssid = cols[2];
      if (!ssid) continue; // skip hidden networks

      const signalStrength = parseInt(cols[6]);
      const channel = parseInt(cols[4]);
      const band = channelToBand(channel);
      const key = `${ssid}::${band}`;

      // Behåll starkaste per SSID+band kombination
      const existing = seen.get(key);
      if (existing && existing.signalStrength >= signalStrength) continue;

      const entry = getDefaultWifiResults();
      entry.currentSSID = cols[0] === "*";
      entry.bssid = cols[1];
      entry.ssid = ssid;
      entry.channel = channel;
      entry.signalStrength = signalStrength;
      entry.rssi = percentageToRssi(signalStrength);
      entry.band = band;
      entry.security = cols[8] || "";

      seen.set(key, entry);
    }

    const ssids = Array.from(seen.values()).sort(bySignalStrength);

    return NextResponse.json({ ssids });
  } catch {
    return NextResponse.json({ ssids: [] });
  }
}
