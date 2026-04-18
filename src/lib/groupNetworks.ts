/**
 * Grupperingslogik för WiFi-nätverk per SSID med band-taggar.
 * Samlar unika band per SSID och behåller bästa signalstyrkan.
 */

export interface GroupedNetwork {
  ssid: string;
  bands: ("2.4" | "5")[];
  signalStrength: number;
  security: string;
  currentSSID: boolean;
}

interface NetworkWithBand {
  ssid: string;
  signalStrength: number;
  security: string;
  currentSSID: boolean;
  band: number | string;
}

/** Gruppera nätverk per SSID, samla unika band, ta bästa signalen */
export function groupNetworksBySSID<T extends NetworkWithBand>(
  networks: T[],
): GroupedNetwork[] {
  const map = new Map<string, GroupedNetwork>();

  for (const net of networks) {
    const existing = map.get(net.ssid);
    const band: "2.4" | "5" =
      Number(net.band) >= 5 || net.band === "5" ? "5" : "2.4";

    if (existing) {
      if (!existing.bands.includes(band)) {
        existing.bands.push(band);
      }
      if (net.signalStrength > existing.signalStrength) {
        existing.signalStrength = net.signalStrength;
      }
      if (net.currentSSID) {
        existing.currentSSID = true;
      }
    } else {
      map.set(net.ssid, {
        ssid: net.ssid,
        bands: [band],
        signalStrength: net.signalStrength,
        security: net.security,
        currentSSID: net.currentSSID,
      });
    }
  }

  // Sortera band konsekvent: 2.4 före 5
  for (const g of map.values()) {
    g.bands.sort((a, b) => parseFloat(a) - parseFloat(b));
  }

  // Sortera efter signalstyrka (starkast först)
  return Array.from(map.values()).sort(
    (a, b) => b.signalStrength - a.signalStrength,
  );
}
