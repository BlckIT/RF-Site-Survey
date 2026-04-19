"use server";
import {
  PartialHeatmapSettings,
  IperfResults,
  IperfTestProperty,
  IperfCommands,
  WifiResults,
  BandMeasurement,
  ScannedBSS,
} from "./types";
// import { scanWifi, blinkWifi } from "./wifiScanner";
import { execAsync, delay } from "./server-utils";
import { getCancelFlag, sendSSEMessage } from "./server-globals";
import {
  rssiToPercentage,
  toMbps,
  getDefaultIperfResults,
} from "./utils";
import { SSEMessageType } from "@/app/api/events/route";
import { createWifiActions } from "./wifiScanner";

import { LinuxWifiActions } from "./wifiScanner-linux";
import { getLogger } from "./logger";
import { defaultIperfCommands, buildIperfCommand } from "./iperfUtils";
const logger = getLogger("iperfRunner");

type TestType = "TCP" | "UDP";
type TestDirection = "Up" | "Down";

const wifiActions = await createWifiActions();

const validateWifiDataConsistency = (
  wifiDataBefore: WifiResults,
  wifiDataAfter: WifiResults,
) => {
  // Jämför bara SSID — BSSID/channel kan ändras vid roaming mellan AP:er
  return wifiDataBefore.ssid === wifiDataAfter.ssid;
};

function arrayAverage(arr: number[]): number {
  if (arr.length === 0) return 0;
  const sum = arr.reduce((acc, val) => acc + val, 0);
  return Math.round(sum / arr.length);
}

const initialStates = {
  type: "update",
  header: "Measurement beginning",
  signal: "-",
  snrInfo: "",
  channelInfo: "",
  tcp: "-/- Mbps",
  udp: "-/- Mbps",
};

// The measurement process updates these variables
// which then are converted into update events
let displayStates = {
  type: "update",
  header: "In progress",
  signal: "-",
  snrInfo: "",
  channelInfo: "",
  tcp: "-/- Mbps",
  udp: "-/- Mbps",
};

/**
 * getUpdatedMessage - combine all the displayState values
 * @returns (SSEMessageType) - the message to send
 */
function getUpdatedMessage(): SSEMessageType {
  return {
    type: displayStates.type,
    header: displayStates.header,
    status: `Signal: ${displayStates.signal}${displayStates.snrInfo}\n${displayStates.channelInfo}\nTCP: ${displayStates.tcp}\nUDP: ${displayStates.udp}`,
  };
}

function checkForCancel() {
  if (getCancelFlag()) throw new Error("cancelled");
}

/**
 * runSurveyTests() - get the WiFi and iperf readings
 * @param settings
 * @returns the WiFi and iperf results for this location
 */
export async function runSurveyTests(
  settings: PartialHeatmapSettings,
): Promise<{
  iperfData: IperfResults | null;
  wifiData: WifiResults | null;
  bandMeasurements?: BandMeasurement[];
  scannedBSSList?: ScannedBSS[];
  status: string;
}> {
  // first check the settings and return cogent error if not good
  const preResults = await wifiActions.preflightSettings(settings);
  if (preResults.reason != "") {
    logger.debug(`preflightSettings returned: ${JSON.stringify(preResults)}`);
    return { iperfData: null, wifiData: null, status: preResults.reason };
  }
  // check if iperf3 server is available
  // this is separate from the other preflight checks because it's reasonable
  // to test the wifi even the iperf3 server is not accessible
  // (say, you have moved to another subnet)
  let noIperfTestReason = "";
  let performIperfTest = true; // assume we will run iperf3 test
  if (settings.iperfServerAdrs == "localhost") {
    performIperfTest = false;
    noIperfTestReason = "Not performed";
  }
  // otherwise check if the server is available
  else {
    const resp = await wifiActions.checkIperfServer(settings);
    logger.debug(`checkIperfServer returned: ${resp}`);

    if (resp.reason != "") {
      performIperfTest = false;
      noIperfTestReason = resp.reason;
    }
  }

  // begin the survey
  try {
    const maxRetries = 1;
    let attempts = 0;
    const newIperfData = getDefaultIperfResults();
    let newWifiData: WifiResults | null = null;
    let bandMeasurements: BandMeasurement[] | undefined;
    let scannedBSSList: ScannedBSS[] | undefined;

    // set the initial states, then send an event to the client
    const startTime = Date.now();
    displayStates = { ...displayStates, ...initialStates };
    sendSSEMessage(getUpdatedMessage()); // immediately send initial values
    displayStates.header = "Measurement in progress...";

    // This is where the "scan-wifi" branch (now abandoned)
    // would scan the local wifi neighborhood to find the best
    // SSID, then switch to it, then make the measurements.
    // This is too hard on macOS (too many credential prompts)
    // to be practical.

    // Determine SSID name: prefer explicit targetSSID, then connected, then first scanned
    let ssidName = "Unknown";
    if (settings.targetSSID) {
      ssidName = settings.targetSSID;
      logger.debug(`Using target SSID from settings: ${ssidName}`);
    } else {
      const ssids = await wifiActions.scanWifi(settings);
      logger.debug(`scanWifi returned: ${JSON.stringify(ssids)}`);
      const thisSSID = ssids.SSIDs.filter((item) => item.currentSSID);
      if (thisSSID.length > 0) {
        ssidName = thisSSID[0].ssid;
      } else if (ssids.SSIDs.length > 0) {
        ssidName = ssids.SSIDs[0].ssid;
      } else {
        return {
          iperfData: null,
          wifiData: null,
          status:
            "No WiFi data available. Make sure you're connected to a network or select a Target SSID.",
        };
      }
    }

    while (attempts < maxRetries) {
      attempts++;
      try {
        const server = settings.iperfServerAdrs;
        const duration = settings.testDuration;
        const wifiStrengths: number[] = []; // dBm-värden (rssi) för korrekt medelvärde
        // add the SSID to the header if it's not <redacted>
        let newHeader = "Measuring Wi-Fi";
        if (!ssidName.includes("redacted")) {
          newHeader += ` (${ssidName})`;
        }
        displayStates.header = newHeader;

        const wifiDataBefore = await wifiActions.getWifi(settings);
        logger.debug(`getWifi() returned: ${JSON.stringify(wifiDataBefore)}`);
        console.log(
          `Elapsed time for scan and switch: ${Date.now() - startTime}`,
        );
        if (!wifiDataBefore.SSIDs || wifiDataBefore.SSIDs.length === 0) {
          return {
            iperfData: null,
            wifiData: null,
            status:
              "No WiFi data available. Make sure you're connected to a network or select a Target SSID.",
          };
        }
        wifiStrengths.push(wifiDataBefore.SSIDs[0].rssi);
        const avgRssiEarly = arrayAverage(wifiStrengths);
        displayStates.signal = `${avgRssiEarly} dBm`;
        // Show channel info from first scan
        const firstAP = wifiDataBefore.SSIDs[0];
        const bandGHz = firstAP.band < 5 ? "2.4" : "5.0";
        displayStates.channelInfo = `Ch: ${firstAP.channel} (${bandGHz} GHz) | Width: ${firstAP.channelWidth || "?"} MHz`;
        checkForCancel();
        sendSSEMessage(getUpdatedMessage());

        // Run the TCP tests
        const cmds = settings.iperfCommands ?? defaultIperfCommands;
        if (performIperfTest) {
          newIperfData.tcpDownload = await runSingleTest(
            server,
            duration,
            "Down",
            "TCP",
            cmds,
          );
          newIperfData.tcpUpload = await runSingleTest(
            server,
            duration,
            "Up",
            "TCP",
            cmds,
          );
          displayStates.tcp = `${toMbps(newIperfData.tcpDownload.bitsPerSecond)} / ${toMbps(newIperfData.tcpUpload.bitsPerSecond)} Mbps`;
        } else {
          await delay(500);
          displayStates.tcp = noIperfTestReason;
        }
        checkForCancel();
        sendSSEMessage(getUpdatedMessage());

        const wifiDataMiddle = await wifiActions.getWifi(settings);
        if (wifiDataMiddle.SSIDs && wifiDataMiddle.SSIDs.length > 0) {
          wifiStrengths.push(wifiDataMiddle.SSIDs[0].rssi);
          displayStates.signal = `${arrayAverage(wifiStrengths)} dBm`;
        }
        checkForCancel();
        sendSSEMessage(getUpdatedMessage());

        // Run the UDP tests
        if (performIperfTest) {
          newIperfData.udpDownload = await runSingleTest(
            server,
            duration,
            "Down",
            "UDP",
            cmds,
          );
          newIperfData.udpUpload = await runSingleTest(
            server,
            duration,
            "Up",
            "UDP",
            cmds,
          );
          displayStates.udp = `${toMbps(newIperfData.udpDownload.bitsPerSecond)} / ${toMbps(newIperfData.udpUpload.bitsPerSecond)} Mbps`;
        } else {
          await delay(500);
          displayStates.udp = noIperfTestReason;
        }
        checkForCancel();
        sendSSEMessage(getUpdatedMessage());

        const wifiDataAfter = await wifiActions.getWifi(settings);
        if (wifiDataAfter.SSIDs && wifiDataAfter.SSIDs.length > 0) {
          wifiStrengths.push(wifiDataAfter.SSIDs[0].rssi);
          displayStates.signal = `${arrayAverage(wifiStrengths)} dBm`;
        }
        checkForCancel();

        if (
          wifiDataBefore.SSIDs[0] &&
          wifiDataAfter.SSIDs?.[0] &&
          !validateWifiDataConsistency(
            wifiDataBefore.SSIDs[0],
            wifiDataAfter.SSIDs[0],
          )
        ) {
          throw new Error(
            "Wifi configuration changed between scans! Cancelling instead of giving wrong results.",
          );
        }

        const avgRssi = arrayAverage(wifiStrengths); // Medelvärde i dBm
        newWifiData = {
          ...wifiDataBefore.SSIDs[0],
          rssi: avgRssi, // Korrekt dBm-medelvärde
          signalStrength: rssiToPercentage(avgRssi), // Konvertera till procent för display
        };

        // Hämta noise floor och channel utilization via iw survey dump (bara Linux)
        if (wifiActions instanceof LinuxWifiActions) {
          const surveyData = await wifiActions.getSurveyDump(settings);
          if (surveyData && newWifiData) {
            newWifiData.noiseFloor = surveyData.noiseFloor;
            newWifiData.channelUtilization = surveyData.channelUtilization;
            // SNR = RSSI - noiseFloor (båda i dBm)
            newWifiData.snr = newWifiData.rssi - surveyData.noiseFloor;
            displayStates.snrInfo = ` (SNR: ${newWifiData.snr} dB) | Ch.Util: ${surveyData.channelUtilization}%`;
            logger.debug(
              `Survey: noise=${surveyData.noiseFloor} dBm, SNR=${newWifiData.snr} dB, util=${surveyData.channelUtilization}%`,
            );
          }
        }

        // ── scannedBSSList + band measurements: extrahera från scan-resultat ──
        if (newWifiData) {
          try {
            const scanResult = await wifiActions.scanWifi(settings);
            const targetName = settings.targetSSID || newWifiData.ssid;
            const targetLower = targetName.toLowerCase();
            const sameSSID = scanResult.SSIDs.filter(
              (ap) => ap.ssid.toLowerCase() === targetLower,
            );

            // Bygg scannedBSSList — ALLA BSS:er för target SSID
            scannedBSSList = sameSSID.map((ap) => ({
              bssid: ap.bssid,
              ssid: ap.ssid,
              signal: ap.rssi,
              frequency: ap.frequency ?? 0,
              channel: ap.channel,
              band: ap.band,
              channelWidth: ap.channelWidth,
              spatialStreams: ap.spatialStreams,
              beamforming: ap.beamforming,
              security: ap.security,
              lastSeen: ap.lastSeen,
            }));

            // Generera bandMeasurements från scannedBSSList
            const bandMap = new Map<string, ScannedBSS>();
            for (const bss of scannedBSSList) {
              const bandKey = bss.band <= 2.5 ? "2.4" : "5";
              const existing = bandMap.get(bandKey);
              if (!existing || bss.signal > existing.signal) {
                bandMap.set(bandKey, bss);
              }
            }
            const currentBand: "2.4" | "5" = newWifiData.band < 5 ? "2.4" : "5";
            bandMeasurements = Array.from(bandMap.entries()).map(([band, bss]) => {
              const bm: BandMeasurement = { band: band as "2.4" | "5", signal: bss.signal };
              if (band === currentBand) {
                bm.tcpDown = newIperfData.tcpDownload.bitsPerSecond / 1e6;
                bm.tcpUp = newIperfData.tcpUpload.bitsPerSecond / 1e6;
                bm.udpDown = newIperfData.udpDownload.bitsPerSecond / 1e6;
                bm.udpUp = newIperfData.udpUpload.bitsPerSecond / 1e6;
              }
              return bm;
            });
          } catch (dbErr) {
            logger.warn(`Band measurement / scannedBSSList extraction failed: ${dbErr}`);
          }
        }

        // Skicka "done" EFTER all data (inkl. dual-band) är insamlad
        displayStates.type = "done";
        displayStates.header = "Measurement complete";
        sendSSEMessage(getUpdatedMessage());
      } catch (error: any) {
        logger.error(`Attempt ${attempts} failed:`, error);
        if (error.message == "cancelled") {
          return {
            iperfData: null,
            wifiData: null,
            status: "test was cancelled",
          };
        }
      }
    }

    // return the values ("!" asserts that the values are non-null)
    return {
      iperfData: newIperfData!,
      wifiData: newWifiData!,
      bandMeasurements,
      scannedBSSList,
      status: "",
    };
  } catch (error) {
    logger.error("Error running measurement tests:", error);
    sendSSEMessage({
      type: "done",
      status: "Error taking measurements",
      header: "Error",
    });

    throw error;
  }
}

async function runSingleTest(
  server: string,
  duration: number,
  testDir: TestDirection,
  testType: TestType,
  iperfCommands: IperfCommands,
): Promise<IperfTestProperty> {
  const logger = getLogger("runSingleTest");

  let port = "";
  if (server.includes(":")) {
    const [host, serverPort] = server.split(":");
    server = host;
    port = serverPort;
  }
  const isUdp = testType == "UDP";
  const isDownload = testDir == "Down";

  // Select the appropriate command template
  let template: string;
  if (testType === "TCP") {
    template = isDownload ? iperfCommands.tcpDownload : iperfCommands.tcpUpload;
  } else {
    template = isDownload ? iperfCommands.udpDownload : iperfCommands.udpUpload;
  }

  const command = buildIperfCommand(template, server, port, duration);
  logger.debug("Executing iperf command:", command);
  const { stdout } = await execAsync(command);
  const result = JSON.parse(stdout);
  logger.trace("Iperf JSON-parsed result:", result);
  const extracted = extractIperfData(result, isUdp);
  logger.trace("Iperf extracted results:", extracted);
  return extracted;
}

export async function extractIperfData(
  result: {
    end: {
      sum_received?: { bits_per_second: number };
      sum_sent?: { retransmits?: number };
      sum?: {
        bits_per_second?: number;
        jitter_ms?: number;
        lost_packets?: number;
        packets?: number;
        lost_percent?: number;
        retransmits?: number;
      };
      streams?: Array<{
        udp?: {
          jitter_ms?: number;
          lost_packets?: number;
          packets?: number;
        };
      }>;
    };
    version?: string;
  },
  isUdp: boolean,
): Promise<IperfTestProperty> {
  const end = result.end;

  // Check if we're dealing with newer iPerf (Mac - v3.17+) or older iPerf (Ubuntu - v3.9)
  // Newer versions have sum_received and sum_sent, older versions only have sum
  const isNewVersion = !!end.sum_received;

  /**
   * In newer versions (Mac):
   * - TCP: sum_received contains download/upload bps, sum_sent contains retransmits
   * - UDP: sum_received contains actual received data (~51 Mbps),
   *        sum contains reported test bandwidth (~948 Mbps)
   *
   * In older versions (Ubuntu):
   * - TCP: sum contains both bps and retransmits
   * - UDP: sum contains all metrics (bps, jitter, packet loss)
   */

  // For UDP tests with newer iPerf (Mac), we want to use sum.bits_per_second
  // For TCP tests with newer iPerf, we want to use sum_received.bits_per_second
  // For all tests with older iPerf (Ubuntu), we want to use sum.bits_per_second
  const bitsPerSecond = isNewVersion
    ? isUdp
      ? end.sum?.bits_per_second || 0
      : end.sum_received!.bits_per_second
    : end.sum?.bits_per_second || 0;

  if (!bitsPerSecond) {
    throw new Error(
      "No bits per second found in iperf results. This is fatal.",
    );
  }

  const retransmits = isNewVersion
    ? end.sum_sent?.retransmits || 0
    : end.sum?.retransmits || 0;

  return {
    bitsPerSecond,
    retransmits,

    // UDP metrics - only relevant for UDP tests
    // These fields will be null for TCP tests
    jitterMs: isUdp ? end.sum?.jitter_ms || null : null,
    lostPackets: isUdp ? end.sum?.lost_packets || null : null,
    packetsReceived: isUdp ? end.sum?.packets || null : null,
    signalStrength: 0,
  };
}
