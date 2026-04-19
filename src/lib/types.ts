// Used for localization map
export type LocalizerMap = Record<string, any>;
export interface IperfTestProperty {
  bitsPerSecond: number;
  retransmits?: number;
  jitterMs: number | null;
  lostPackets: number | null;
  packetsReceived: number | null;
  signalStrength: number;
}
/**
 * WifiResults - the results from a Wi-Fi test
 */
export interface WifiResults {
  ssid: string;
  bssid: string;
  rssi: number; // dBm value
  signalStrength: number; // percentage of signal strength
  channel: number;
  security: string;
  txRate: number;
  phyMode: string;
  channelWidth: number;
  band: number; // frequency band - 2.4 or 5 (GHz)
  currentSSID: boolean; // true if this is the SSID currently in use
  strongestSSID: WifiResults | null;
  noiseFloor?: number; // dBm (t.ex. -95)
  snr?: number; // dB (RSSI - noiseFloor)
  channelUtilization?: number; // 0-100%
  frequency?: number; // exakt frekvens i MHz (t.ex. 5220)
  spatialStreams?: number; // antal streams från MCS set
  beamforming?: boolean; // SU/MU beamformer/beamformee
  htCapabilities?: string; // "HT20" | "HT20/HT40"
  vhtCapabilities?: boolean; // true om VHT stöds
  heCapabilities?: boolean; // true om HE (Wi-Fi 6) stöds
  supportedRates?: number[]; // Mbps
  lastSeen?: number; // ms sedan senaste beacon
}

/**
 * IperfResults - results from an iperf3 test
 */
export interface IperfResults {
  tcpDownload: IperfTestProperty;
  tcpUpload: IperfTestProperty;
  udpDownload: IperfTestProperty;
  udpUpload: IperfTestProperty;
}

type IperfTestProperties = {
  [K in keyof IperfTestProperty]: K;
};

export const testProperties: IperfTestProperties = {
  bitsPerSecond: "bitsPerSecond",
  jitterMs: "jitterMs",
  lostPackets: "lostPackets",
  retransmits: "retransmits",
  packetsReceived: "packetsReceived",
  // signalstrength is included so generateAllHeatmaps() has all the properties in one object
  signalStrength: "signalStrength",
} as const;

export type TestTypes = {
  [K in keyof IperfResults | "signalStrength"]: K;
};

export const testTypes: TestTypes = {
  signalStrength: "signalStrength",
  tcpDownload: "tcpDownload",
  tcpUpload: "tcpUpload",
  udpDownload: "udpDownload",
  udpUpload: "udpUpload",
} as const;

export type MeasurementTestType = keyof TestTypes;

export interface ApMapping {
  apName: string;
  macAddress: string;
}

export type Gradient = Record<number, string>; // Maps 0-1 values to colors

export interface IperfCommands {
  tcpDownload: string;
  tcpUpload: string;
  udpDownload: string;
  udpUpload: string;
}

/**
 * A single floor within a site
 */
export interface Floor {
  name: string; // e.g. "Floor 1", "Ground Floor"
  floorplanImageName: string; // filename in /media/
  floorplanImagePath: string; // /media/filename
  dimensions: { width: number; height: number };
  walls: Wall[];
  surveyPoints: SurveyPoint[];
  pixelsPerMeter: number;
  nextPointNum: number;
  rotation?: number; // 0, 90, 180, 270 — CSS-rotation av planritningen
}

/**
 * A site/project containing multiple floors
 */
export interface Site {
  name: string; // project name
  floors: Floor[];
  activeFloorIndex: number; // which floor is currently selected
}

/**
 * Global settings (NOT per-site/floor)
 */
export interface GlobalAppSettings {
  iperfServerAdrs: string;
  testDuration: number;
  sudoerPassword: string;
  apMapping: ApMapping[];
  radiusDivider: number | null;
  maxOpacity: number;
  minOpacity: number;
  blur: number;
  gradient: Gradient;
  iperfCommands: IperfCommands;
  wifiInterface: string;
  targetSSID: string;
  snapRadius: number;
  knownWifiNetworks: KnownWifi[];
}

/**
 * The full set of data for a particular background image
 * This is "global" to the entire GUI, and passed down as needed
 *
 * Now composes Site + GlobalAppSettings.
 * Floor-specific fields (surveyPoints, walls, dimensions, etc.) are
 * computed from the active floor for backward compatibility.
 */
export interface HeatmapSettings extends GlobalAppSettings {
  site: Site;
  // Backward-compat computed fields from active floor
  surveyPoints: SurveyPoint[];
  floorplanImageName: string;
  floorplanImagePath: string;
  nextPointNum: number;
  dimensions: { width: number; height: number };
  walls: Wall[];
  pixelsPerMeter: number;
  rotation?: number;
}

// part of "scan wifi" effort
// export type SsidStrategy = "same" | "best";

/**
 * Settings passed to iperfRunner.ts
 */
export interface PartialHeatmapSettings {
  iperfServerAdrs: string;
  testDuration: number;
  sudoerPassword: string;
  ignoredSSIDs: string[];
  iperfCommands: IperfCommands;
  wifiInterface: string;
  targetSSID: string;
  // sameSSID: SsidStrategy;
}

/**
 * SurveyPoint - all the information we have about a particular point
 */
export type SurveyPoint = {
  x: number;
  y: number;
  wifiData: WifiResults;
  iperfData: IperfResults;
  timestamp: number;
  id: string;
  isEnabled: boolean;
  bandMeasurements?: BandMeasurement[]; // dual-band mätdata
  scannedBSSList?: ScannedBSS[]; // ALLA BSS:er för target SSID vid denna punkt
};

/**
 * SurveyResults - returned from runSurveyTests()
 */
export interface SurveyResults {
  wifiData: WifiResults;
  iperfData: IperfResults;
  bandMeasurements?: BandMeasurement[];
  scannedBSSList?: ScannedBSS[];
}

/**
 * TaskStatus - status of the wifi survey process
 */
type TaskStatus = "pending" | "done" | "error";
export interface SurveyResult {
  state: TaskStatus; // mimics states of Promise()
  results?: SurveyResults; // if "done", has the wifiData and iperfData
  explanation?: string; // if "error", this is the string to display
}

export type ScannerSettings = {
  sudoerPassword: string | "";
  wlanInterfaceId: string | "";
};

export type OS = "macos" | "windows" | "linux";

/**
 * Wall material types for WiFi signal attenuation (dB loss per wall)
 */
export type WallMaterial =
  | "drywall"
  | "wood"
  | "glass"
  | "brick"
  | "concrete"
  | "metal"
  | "custom";

export interface MaterialPreset {
  label: string;
  attenuationDb: number; // dB loss per wall crossing (ITU-R P.1238, 5 GHz)
  color: string;
  thickness: number; // px
}

export const MATERIAL_PRESETS: Record<WallMaterial, MaterialPreset> = {
  drywall: {
    label: "Drywall",
    attenuationDb: 4,
    color: "#888888",
    thickness: 2,
  },
  wood: { label: "Wood", attenuationDb: 6, color: "#8B4513", thickness: 3 },
  glass: { label: "Glass", attenuationDb: 3, color: "#87CEEB", thickness: 2 },
  brick: { label: "Brick", attenuationDb: 10, color: "#B22222", thickness: 4 },
  concrete: {
    label: "Concrete",
    attenuationDb: 15,
    color: "#555555",
    thickness: 5,
  },
  metal: { label: "Metal", attenuationDb: 25, color: "#2F4F4F", thickness: 5 },
  custom: { label: "Custom", attenuationDb: 5, color: "#FF00FF", thickness: 3 },
};

/** Get the effective attenuation in dB for a wall */
export function getWallAttenuationDb(wall: Wall): number {
  if (wall.material === "custom" && wall.customAttenuationDb !== undefined) {
    return wall.customAttenuationDb;
  }
  return MATERIAL_PRESETS[wall.material || "drywall"].attenuationDb;
}

/**
 * Wall — a wall that blocks signal interpolation
 * Defined by two points (x1,y1) and (x2,y2) in pixel coordinates
 */
export interface Wall {
  id: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  material: WallMaterial;
  customAttenuationDb?: number;
}

/**
 * Known WiFi network for auto-connect management
 */
export interface KnownWifi {
  ssid: string;
  password?: string; // tom = öppet nätverk
  priority: number; // högre = försök först
  autoConnect: boolean;
}

/**
 * ScannedBSS — en enskild BSS (access point radio) sedd vid en mätpunkt.
 * Sparar rå data från iw scan dump.
 */
export interface ScannedBSS {
  bssid: string;
  ssid: string;
  signal: number; // dBm, rå från adaptern
  frequency: number; // MHz
  channel: number;
  band: number; // 2.4 | 5
  channelWidth: number; // 20/40/80/160 MHz
  spatialStreams?: number;
  beamforming?: boolean;
  security?: string;
  lastSeen?: number; // ms sedan senaste beacon
}

/**
 * Mätdata per frekvensband (dual-band)
 */
export interface BandMeasurement {
  band: "2.4" | "5";
  signal: number; // dBm
  tcpDown?: number;
  tcpUp?: number;
  udpDown?: number;
  udpUp?: number;
}

export interface SurveyPointActions {
  add: (newPoint: SurveyPoint) => void;
  update: (point: SurveyPoint, updatedData: Partial<SurveyPoint>) => void;
  delete: (points: SurveyPoint[]) => void;
}

/**
 * Functions that do the platform-specfic work
 * Pass PartialHeatmapSettings for the essential parameters
 * Return a potentially-empty array of WifiResults and a "reason" string
 */
export interface WifiScanResults {
  SSIDs: WifiResults[]; // potentially empty
  reason: string; // if noErr "", otherwise an explanation
}

export interface WifiActions {
  preflightSettings(settings: PartialHeatmapSettings): Promise<WifiScanResults>; // returns error message
  checkIperfServer(settings: PartialHeatmapSettings): Promise<WifiScanResults>; // returns error message
  scanWifi(settings: PartialHeatmapSettings): Promise<WifiScanResults>; // return sorted list of nearby SSIDs
  setWifi(
    settings: PartialHeatmapSettings,
    bestSSID: WifiResults, // the results with the strongest signal strength
  ): Promise<WifiScanResults>; // associate with the named ssid
  getWifi(settings: PartialHeatmapSettings): Promise<WifiScanResults>; // the the current values
}

/**
 * Definitions for SPAirPortDataType - ChatGPT derived the structure from the
 *    output of system_profiler -json SPAirPortDataType
 */

export interface AirportNetwork {
  _name: string;
  spairport_network_bssid: string;
  spairport_network_channel: number | string;
  spairport_network_country_code?: string;
  spairport_network_phymode: string;
  spairport_network_type: string;
  spairport_security_mode: string;
  spairport_signal_noise: string;
}

export interface AirportCurrentNetworkInformation extends AirportNetwork {
  spairport_network_mcs?: number;
  spairport_network_rate?: number;
}

export interface AirportInterface {
  _name: string;
  spairport_airdrop_channel?: number;
  spairport_airport_other_local_wireless_networks: AirportNetwork[];
  spairport_caps_airdrop?: string;
  spairport_caps_autounlock?: string;
  spairport_current_network_information?: AirportCurrentNetworkInformation;
  spairport_status_information?: string;
  spairport_supported_channels?: (number | string)[];
  spairport_supported_phymodes?: string;
  spairport_wireless_card_type?: string;
  spairport_wireless_country_code?: string;
  spairport_wireless_firmware_version?: string;
  spairport_wireless_locale?: string;
  spairport_wireless_mac_address?: string;
}

export interface SPAirPortSoftwareInformation {
  spairport_corewlan_version?: string;
  spairport_corewlankit_version?: string;
  spairport_diagnostics_version?: string;
  spairport_extra_version?: string;
  spairport_family_version?: string;
  spairport_profiler_version?: string;
  spairport_utility_version?: string;
}

export interface SPAirPortEntry {
  spairport_airport_interfaces: AirportInterface[];
  spairport_software_information?: SPAirPortSoftwareInformation;
}

export interface SPAirPortRoot {
  TestDescriptionDEADBEEF: string; // used to describe test conditions for this data
  SPAirPortDataType: SPAirPortEntry[];
}
