import {
  PartialHeatmapSettings,
  WifiResults,
  WifiScanResults,
  WifiActions,
} from "./types";
import { execAsync, delay } from "./server-utils";
import {
  channelToBand,
  getDefaultWifiResults,
  bySignalStrength,
  normalizeMacAddress,
  rssiToPercentage,
} from "./utils";
import isDocker from "is-docker";
import { getLogger } from "./logger";
const logger = getLogger("wifi-Linux");

export class LinuxWifiActions implements WifiActions {
  nameOfWifi: string = "";
  currentSSIDName: string = "";
  strongestSSID: WifiResults | null = null;

  async preflightSettings(
    settings: PartialHeatmapSettings,
  ): Promise<WifiScanResults> {
    const response: WifiScanResults = { SSIDs: [], reason: "" };
    let reason = "";

    logger.info("Checking for required Linux tools...");

    try {
      await execAsync("which iw");
      logger.info("  ✓ iw found");
    } catch {
      reason = "Missing required tool: iw. Install with: apt install iw";
      logger.error(reason);
    }

    if (!reason && settings.iperfServerAdrs !== "localhost") {
      try {
        await execAsync("iperf3 --version");
        logger.info("  ✓ iperf3 found");
      } catch {
        reason =
          "iperf3 not installed. Install it,\n or set the iperfServer to 'localhost'.";
        logger.error(reason);
      }
    }

    if (!reason && settings.testDuration <= 0) {
      reason = "Test duration must be greater than zero.";
    }

    if (!reason && !settings.iperfServerAdrs) {
      reason = "Please set iperf3 server address";
    }

    if (!reason && !isDocker() && settings.sudoerPassword) {
      try {
        await execAsync(
          `echo '${settings.sudoerPassword.replace(/'/g, "'\\\\''")}'  | sudo -S ls`,
        );
      } catch {
        reason = "Please enter a valid sudo password.";
      }
    }

    response.reason = reason;
    return response;
  }

  async checkIperfServer(
    settings: PartialHeatmapSettings,
  ): Promise<WifiScanResults> {
    const response: WifiScanResults = { SSIDs: [], reason: "" };
    try {
      await execAsync(`nc -vz ${settings.iperfServerAdrs} 5201`);
    } catch {
      response.reason = "Cannot connect to iperf3 server.";
    }
    return response;
  }

  async findWifiInterface(preferredInterface?: string): Promise<string> {
    if (preferredInterface) {
      logger.debug(`Using preferred WLAN interface: ${preferredInterface}`);
      this.nameOfWifi = preferredInterface;
      return this.nameOfWifi;
    }
    logger.debug("Inferring WLAN interface ID on Linux");
    const { stdout } = await execAsync(
      "iw dev | awk '$1==\"Interface\"{print $2}' | head -n1",
    );
    this.nameOfWifi = stdout.trim();
    return this.nameOfWifi;
  }

  /**
   * scanWifi() — trigga iw scan och returnera alla synliga AP:er.
   * Rå dBm direkt från adaptern, ingen nmcli-konvertering.
   */
  async scanWifi(settings: PartialHeatmapSettings): Promise<WifiScanResults> {
    const response: WifiScanResults = { SSIDs: [], reason: "" };
    try {
      const iface = await inferWifiDeviceIdOnLinux(settings.wifiInterface);
      await forceRescan(iface, settings.sudoerPassword);

      const dump = await iwScanDump(iface, settings.sudoerPassword);
      response.SSIDs = parseIwScanDump(dump);
      logger.debug(`iw scan: ${response.SSIDs.length} APs found`);
    } catch (err) {
      response.reason = `Cannot get wifi info: ${err}`;
    }
    return response;
  }

  async setWifi(
    _settings: PartialHeatmapSettings,
    _newWifiSettings: WifiResults,
  ): Promise<WifiScanResults> {
    throw "wifi-heatmapper does not implement setWifi()";
  }

  /**
   * getWifi() — hämta WiFi-data för ansluten eller target SSID via iw scan dump.
   * Rå dBm, ingen dubbel konvertering.
   */
  async getWifi(settings: PartialHeatmapSettings): Promise<WifiScanResults> {
    const response: WifiScanResults = { SSIDs: [], reason: "" };
    try {
      const iface = await inferWifiDeviceIdOnLinux(settings.wifiInterface);
      await forceRescan(iface, settings.sudoerPassword);

      const dump = await iwScanDump(iface, settings.sudoerPassword);
      const allAPs = parseIwScanDump(dump);

      if (settings.targetSSID) {
        // Hitta starkaste AP:n för target SSID
        logger.debug(
          `Target SSID set: "${settings.targetSSID}", filtering scan results`,
        );
        const match = allAPs
          .filter(
            (ap) => ap.ssid.toLowerCase() === settings.targetSSID.toLowerCase(),
          )
          .sort(bySignalStrength)[0];

        if (match) {
          response.SSIDs.push(match);
        } else {
          response.reason = `Target SSID "${settings.targetSSID}" not found in scan results`;
        }
      } else {
        // Hämta ansluten BSSID via iw dev link, matcha mot scan dump
        const linkOutput = await iwDevLink(iface, settings.sudoerPassword);
        const connectedBssid = parseConnectedBssid(linkOutput);

        if (connectedBssid) {
          const match = allAPs.find(
            (ap) =>
              normalizeMacAddress(ap.bssid) ===
              normalizeMacAddress(connectedBssid),
          );
          if (match) {
            match.currentSSID = true;
            // Komplettera med tx bitrate från iw dev link
            const txRate = parseTxBitrate(linkOutput);
            if (txRate) match.txRate = txRate;
            response.SSIDs.push(match);
          } else {
            // Fallback: parsa iw dev link + iw dev info direkt
            const infoOutput = await iwDevInfo(iface, settings.sudoerPassword);
            const parsed = parseIwOutput(linkOutput, infoOutput);
            parsed.currentSSID = true;
            response.SSIDs.push(parsed);
          }
        } else {
          response.reason = "Not connected to any WiFi network";
        }
      }
    } catch (err) {
      response.reason = String(err);
    }
    return response;
  }

  /**
   * getSurveyDump — hämta noise floor och kanalanvändning via `iw dev survey dump`.
   */
  async getSurveyDump(
    settings: PartialHeatmapSettings,
  ): Promise<SurveyData | null> {
    try {
      const iface = await inferWifiDeviceIdOnLinux(settings.wifiInterface);
      return await getSurveyDump(iface, settings.sudoerPassword);
    } catch (err) {
      logger.warn(`getSurveyDump failed: ${err}`);
      return null;
    }
  }
}

// ─── Helper types ───────────────────────────────────────────────────────────

export interface SurveyData {
  noiseFloor: number;
  channelUtilization: number;
  channelActiveTime: number;
  channelBusyTime: number;
  channelReceiveTime: number;
  channelTransmitTime: number;
}

// ─── iw scan dump parser ────────────────────────────────────────────────────

/**
 * parseIwScanDump() — parsar hela outputen från `iw dev <iface> scan dump`
 * till en array av WifiResults med rå dBm och utökade capabilities.
 */
export function parseIwScanDump(dump: string): WifiResults[] {
  const results: WifiResults[] = [];

  // Dela upp i BSS-block. Varje block börjar med "BSS xx:xx:xx:xx:xx:xx"
  const blocks = dump.split(/^BSS /m).filter((b) => b.trim().length > 0);

  for (const block of blocks) {
    const ap = getDefaultWifiResults();

    // BSSID — första raden: "aa:bb:cc:dd:ee:ff(on wlxXXX)"
    const bssidMatch = block.match(/^([0-9a-fA-F:]{17})/);
    if (!bssidMatch) continue;
    ap.bssid = bssidMatch[1].toLowerCase();

    // Signal (dBm) — rå värde direkt
    const signalMatch = block.match(/signal:\s*(-?[\d.]+)\s*dBm/);
    if (signalMatch) {
      ap.rssi = Math.round(parseFloat(signalMatch[1]));
      ap.signalStrength = rssiToPercentage(ap.rssi);
    }

    // Frekvens (MHz)
    const freqMatch = block.match(/freq:\s*([\d.]+)/);
    if (freqMatch) {
      ap.frequency = Math.round(parseFloat(freqMatch[1]));
      ap.band = ap.frequency < 3000 ? 2.4 : 5;
      const chan = frequencyToChannel(ap.frequency);
      if (chan) ap.channel = chan;
    }

    // SSID
    const ssidMatch = block.match(/^\s+SSID:\s*(.*)$/m);
    if (ssidMatch) {
      ap.ssid = ssidMatch[1].trim();
    }

    // DS Parameter set: channel
    const dsMatch = block.match(/DS Parameter set:\s*channel\s+(\d+)/);
    if (dsMatch && !ap.channel) {
      ap.channel = parseInt(dsMatch[1]);
      if (!ap.band) ap.band = channelToBand(ap.channel);
    }

    // Last seen
    const lastSeenMatch = block.match(/last seen:\s*(\d+)\s*ms/);
    if (lastSeenMatch) {
      ap.lastSeen = parseInt(lastSeenMatch[1]);
    }

    // Supported rates
    const ratesMatch = block.match(/Supported rates:\s*(.+)/);
    if (ratesMatch) {
      ap.supportedRates = ratesMatch[1]
        .split(/\s+/)
        .map((r) => parseFloat(r.replace("*", "")))
        .filter((r) => !isNaN(r));
    }

    // Security — RSN (WPA2/WPA3) eller WPA
    const securityParts: string[] = [];
    if (block.includes("RSN:")) {
      const authMatch = block.match(
        /RSN:[\s\S]*?Authentication suites:\s*(.+)/,
      );
      if (authMatch) {
        const auths = authMatch[1].trim();
        if (auths.includes("SAE")) securityParts.push("WPA3");
        else if (auths.includes("PSK")) securityParts.push("WPA2");
        else securityParts.push("RSN:" + auths);
      } else {
        securityParts.push("WPA2");
      }
    }
    if (/^\s+WPA:\s/m.test(block) && !securityParts.includes("WPA2")) {
      securityParts.push("WPA");
    }
    if (securityParts.length === 0 && block.includes("Privacy")) {
      securityParts.push("WEP");
    }
    ap.security = securityParts.length > 0 ? securityParts.join("/") : "Open";

    // ─── HT capabilities ───
    const htCapsBlock = block.match(
      /HT capabilities:[\s\S]*?(?=\n\s{8}\w|\n\s{0,7}\S|$)/,
    );
    if (htCapsBlock) {
      if (htCapsBlock[0].includes("HT20/HT40")) {
        ap.htCapabilities = "HT20/HT40";
      } else if (htCapsBlock[0].includes("HT20")) {
        ap.htCapabilities = "HT20";
      }
    }

    // ─── HT operation — kanalbredd (fallback om VHT saknas) ───
    const htOpBlock = block.match(
      /HT operation:[\s\S]*?(?=\n\s{8}\w|\n\s{0,7}\S|$)/,
    );
    if (htOpBlock) {
      const staWidth = htOpBlock[0].match(/STA channel width:\s*(.+)/);
      if (staWidth) {
        const w = staWidth[1].trim();
        if (w.includes("any") || w.includes("40")) {
          ap.channelWidth = 40;
        } else {
          ap.channelWidth = 20;
        }
      }
      // Kolla secondary channel offset
      const secOffset = htOpBlock[0].match(/secondary channel offset:\s*(.+)/);
      if (secOffset && secOffset[1].trim() === "no secondary") {
        ap.channelWidth = 20;
      }
    }

    // ─── VHT capabilities ───
    const vhtCapsBlock = block.match(
      /VHT capabilities:[\s\S]*?VHT TX highest supported:.*$/m,
    );
    if (vhtCapsBlock) {
      ap.vhtCapabilities = true;

      // Beamforming
      ap.beamforming =
        vhtCapsBlock[0].includes("SU Beamformer") ||
        vhtCapsBlock[0].includes("SU Beamformee") ||
        vhtCapsBlock[0].includes("MU Beamformer") ||
        vhtCapsBlock[0].includes("MU Beamformee");

      // Spatial streams — räkna "MCS 0-" rader i VHT RX MCS set
      const rxMcsBlock = vhtCapsBlock[0].match(
        /VHT RX MCS set:([\s\S]*?)VHT RX highest/,
      );
      if (rxMcsBlock) {
        const streamLines = rxMcsBlock[1].match(/\d+ streams:\s*MCS\s+0-\d+/g);
        if (streamLines) {
          ap.spatialStreams = streamLines.length;
        }
      }
    }

    // ─── VHT operation — kanalbredd (överskriver HT) ───
    const vhtOpBlock = block.match(
      /VHT operation:[\s\S]*?(?=\n\s{8}\w|\n\s{0,7}\S|$)/,
    );
    if (vhtOpBlock) {
      const cwMatch = vhtOpBlock[0].match(
        /channel width:\s*(\d+)\s*\(([^)]+)\)/,
      );
      if (cwMatch) {
        const desc = cwMatch[2].trim();
        if (desc.includes("80+80")) ap.channelWidth = 160;
        else if (desc.includes("160")) ap.channelWidth = 160;
        else if (desc.includes("80")) ap.channelWidth = 80;
        // channel width: 0 = 20 or 40 MHz — behåll HT-värdet
      }
    }

    // ─── HE (Wi-Fi 6) capabilities ───
    if (/HE capabilities/i.test(block) || /HE Phy Capabilities/i.test(block)) {
      ap.heCapabilities = true;
    }

    // Skippa AP:er utan signal
    if (ap.rssi === 0) continue;

    results.push(ap);
  }

  return results.sort(bySignalStrength);
}

// ─── iw command helpers ─────────────────────────────────────────────────────

function buildSudoCmd(cmd: string, pw: string): string {
  if (isDocker()) return cmd;
  if (pw) {
    const escaped = pw.replace(/'/g, "'\\''");
    return `echo '${escaped}' | sudo -S ${cmd}`;
  }
  return `sudo ${cmd}`;
}

/**
 * forceRescan() — trigga en aktiv WiFi-scan via `iw scan trigger`
 * och vänta tills scan är klar via poll-loop.
 */
async function forceRescan(iface: string, pw: string): Promise<void> {
  const triggerCmd = buildSudoCmd(`iw dev ${iface} scan trigger`, pw);
  try {
    logger.debug(`Triggering WiFi scan on ${iface}`);
    await execAsync(triggerCmd);
  } catch (err) {
    // "Device or resource busy" = scan pågår redan, det är OK
    const msg = String(err);
    if (!msg.includes("busy") && !msg.includes("-16")) {
      logger.warn(`Scan trigger failed: ${msg}`);
    }
  }

  // Smart poll-loop: vänta tills scan dump lyckas (= scan klar)
  await waitForScanComplete(iface, pw);
}

/**
 * waitForScanComplete() — pollar `iw scan dump` tills det lyckas,
 * vilket indikerar att en pågående scan har slutförts.
 */
async function waitForScanComplete(
  iface: string,
  pw: string,
  timeoutMs = 10000,
): Promise<void> {
  const start = Date.now();
  const dumpCmd = buildSudoCmd(`iw dev ${iface} scan dump`, pw);

  while (Date.now() - start < timeoutMs) {
    try {
      await execAsync(dumpCmd);
      logger.debug(`Scan complete after ${Date.now() - start}ms`);
      return;
    } catch {
      await delay(200);
    }
  }
  // Timeout — fortsätt ändå, dump kan ha partiell data
  logger.warn(`Scan poll timed out after ${timeoutMs}ms, continuing`);
}

/**
 * iwScanDump() — kör `iw dev <iface> scan dump` och returnerar rå output.
 */
async function iwScanDump(iface: string, pw: string): Promise<string> {
  const cmd = buildSudoCmd(`iw dev ${iface} scan dump`, pw);
  const { stdout } = await execAsync(cmd);
  return stdout;
}

async function iwDevLink(iface: string, pw: string): Promise<string> {
  const cmd = buildSudoCmd(`iw dev ${iface} link`, pw);
  const { stdout } = await execAsync(cmd);
  return stdout;
}

async function iwDevInfo(iface: string, pw: string): Promise<string> {
  const cmd = buildSudoCmd(`iw dev ${iface} info`, pw);
  const { stdout } = await execAsync(cmd);
  return stdout;
}

// ─── Parsing helpers ────────────────────────────────────────────────────────

function parseConnectedBssid(linkOutput: string): string | null {
  const m = linkOutput.match(/Connected to\s+([0-9a-fA-F:]{17})/);
  return m ? m[1].toLowerCase() : null;
}

function parseTxBitrate(linkOutput: string): number | null {
  const m = linkOutput.match(/tx bitrate:\s*([\d.]+)\s*MBit/);
  return m ? parseFloat(m[1]) : null;
}

export async function inferWifiDeviceIdOnLinux(
  preferredInterface?: string,
): Promise<string> {
  if (preferredInterface) {
    logger.debug(`Using preferred WLAN interface: ${preferredInterface}`);
    return preferredInterface;
  }
  logger.debug("Inferring WLAN interface ID on Linux");
  const { stdout } = await execAsync(
    "iw dev | awk '$1==\"Interface\"{print $2}' | head -n1",
  );
  return stdout.trim();
}

/**
 * parseIwOutput — parsa `iw dev link` + `iw dev info` till WifiResults.
 * Används som fallback när scan dump inte matchar ansluten BSSID.
 */
export function parseIwOutput(
  linkOutput: string,
  infoOutput: string,
): WifiResults {
  const networkInfo = getDefaultWifiResults();
  const linkLines = linkOutput.split("\n");
  linkLines.forEach((line) => {
    const trimmedLine = line.trim();
    if (trimmedLine.startsWith("SSID:")) {
      networkInfo.ssid = trimmedLine.split("SSID:")[1]?.trim() || "";
    } else if (trimmedLine.startsWith("Connected to")) {
      networkInfo.bssid = normalizeMacAddress(
        trimmedLine.split(" ")[2]?.trim() || "",
      );
    } else if (trimmedLine.startsWith("signal:")) {
      const signalMatch = trimmedLine.match(/signal:\s*(-?\d+)\s*dBm/);
      if (signalMatch) {
        networkInfo.rssi = parseInt(signalMatch[1]);
      }
    } else if (trimmedLine.startsWith("freq:")) {
      const freqMatch = trimmedLine.match(/freq:\s*(\d+)/);
      if (freqMatch) {
        const freqMhz = parseInt(freqMatch[1]);
        networkInfo.frequency = freqMhz;
        const chan = frequencyToChannel(freqMhz);
        if (chan) {
          networkInfo.channel = chan;
          networkInfo.band = channelToBand(chan);
        }
      }
    } else if (trimmedLine.startsWith("tx bitrate:")) {
      const txRate = trimmedLine.split("tx bitrate:")[1]?.trim() || "";
      networkInfo.txRate = parseFloat(txRate.split(" ")[0]);
    } else if (trimmedLine.includes("width:")) {
      const width = trimmedLine.split("width:")[1]?.trim() || "";
      networkInfo.channelWidth = parseInt(width.split(" ")[0]);
    }
  });

  const infoLines = infoOutput.split("\n");
  infoLines.forEach((line) => {
    const trimmedLine = line.trim();
    if (trimmedLine.startsWith("channel")) {
      const channelMatch = trimmedLine.match(
        /channel\s+(\d+)\s+\((\d+)\s*MHz\),\s*width:\s*(\d+)\s*MHz/,
      );
      if (channelMatch) {
        networkInfo.channel = parseInt(channelMatch[1]);
        if (!networkInfo.band) {
          const freqMhz = parseInt(channelMatch[2]);
          networkInfo.band = Math.round((freqMhz / 1000) * 100) / 100;
        }
        networkInfo.channelWidth = parseInt(channelMatch[3]);
      }
    }
  });

  networkInfo.signalStrength = rssiToPercentage(networkInfo.rssi);
  return networkInfo;
}

// ─── getSurveyDump ──────────────────────────────────────────────────────────

async function getSurveyDump(
  wlanInterface: string,
  pw: string,
): Promise<SurveyData | null> {
  const cmd = buildSudoCmd(`iw dev ${wlanInterface} survey dump`, pw);
  try {
    const { stdout } = await execAsync(cmd);
    const blocks = stdout.split(/Survey data from/);
    const activeBlock = blocks.find((b) => b.includes("[in use]"));
    if (!activeBlock) {
      logger.debug("No [in use] block found in survey dump");
      return null;
    }

    const getVal = (label: string): number | null => {
      const re = new RegExp(`${label}:\\s*(-?\\d+)`);
      const m = activeBlock.match(re);
      return m ? parseInt(m[1]) : null;
    };

    const noise = getVal("noise");
    const activeTime = getVal("channel active time");
    const busyTime = getVal("channel busy time");
    const receiveTime = getVal("channel receive time");
    const transmitTime = getVal("channel transmit time");

    if (noise === null || noise === 0) {
      logger.debug(`Invalid noise floor: ${noise}`);
      return null;
    }

    const channelActiveTime = activeTime ?? 0;
    const channelBusyTime = busyTime ?? 0;
    const channelUtilization =
      channelActiveTime > 0 ? (channelBusyTime / channelActiveTime) * 100 : 0;

    logger.debug(
      `Survey dump: noise=${noise} dBm, util=${channelUtilization.toFixed(1)}%, active=${channelActiveTime}, busy=${channelBusyTime}`,
    );

    return {
      noiseFloor: noise,
      channelUtilization: Math.round(channelUtilization * 10) / 10,
      channelActiveTime,
      channelBusyTime,
      channelReceiveTime: receiveTime ?? 0,
      channelTransmitTime: transmitTime ?? 0,
    };
  } catch (err) {
    logger.warn(`iw survey dump failed: ${err}`);
    return null;
  }
}

// ─── splitColonDelimited — behålls för bakåtkompatibilitet (iperfRunner) ────

/**
 * splitColonDelimited() - split a colon-delimited string
 * @param line - read from nmcli -t command (":" delimited)
 * @returns array of columns
 */
export function splitColonDelimited(line: string) {
  const result = [];
  let current = "";
  let i = 0;

  const str = line.trim();
  if (str.length === 0) return [];
  while (i < str.length) {
    if (str[i] === "\\" && i + 1 < str.length) {
      current += str[i + 1];
      i += 2;
    } else if (str[i] === ":") {
      result.push(current);
      current = "";
      i++;
    } else {
      current += str[i];
      i++;
    }
  }
  result.push(current);
  return result;
}

// ─── frequencyToChannel ─────────────────────────────────────────────────────

export function frequencyToChannel(freqMHz: number): number | null {
  // 2.4 GHz band
  if (freqMHz >= 2412 && freqMHz <= 2472) {
    return (freqMHz - 2407) / 5;
  }
  if (freqMHz === 2484) return 14;

  // 5 GHz band
  if (freqMHz >= 5180 && freqMHz <= 5895) {
    return (freqMHz - 5000) / 5;
  }

  // 6 GHz band (Wi-Fi 6E)
  if (freqMHz >= 5955 && freqMHz <= 7115) {
    return (freqMHz - 5950) / 5;
  }

  return null;
}
