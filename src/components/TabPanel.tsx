import * as Tabs from "@radix-ui/react-tabs";
import { useState, useEffect, useCallback } from "react";
import { useSettings } from "./GlobalSettings";
import debounce from "lodash/debounce";

import SiteManager from "@/components/SiteManager";
import FloorSelector from "@/components/FloorSelector";
import SurveySettingsBar from "@/components/SurveySettingsBar";
import ClickableFloorplan from "@/components/Floorplan";
import { Heatmaps } from "@/components/Heatmaps";
import PointsTable from "@/components/PointsTable";
import WallEditor from "@/components/WallEditor";
import EditableApMapping from "@/components/ApMapping";
import { PasswordInput } from "@/components/PasswordInput";
import { Label } from "@/components/ui/label";
import { PopoverHelper } from "@/components/PopoverHelpText";
import { HeatmapSettings, WifiResults } from "@/lib/types";
import { rgbaToHex, hexToRgba } from "@/lib/utils-gradient";
import { Switch } from "@/components/ui/switch";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { Wifi, WifiOff, RefreshCw, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getDefaults } from "@/components/GlobalSettings";

interface NetworkDevice {
  device: string;
  type: string;
  state: string;
  connection: string;
}

interface ScannedNetwork {
  ssid: string;
  signalStrength: number;
  security: string;
  currentSSID: boolean;
  channel: number;
  band: string;
}

const tabTriggerClass =
  "px-4 py-2.5 text-base font-medium bg-gray-300 text-gray-800 border border-gray-400 border-b-0 rounded-t-md cursor-pointer transition-all duration-300 ease-in-out hover:bg-gray-200 data-[state=active]:bg-white data-[state=active]:text-black data-[state=active]:font-semibold data-[state=active]:border-gray-500";

const settingsTriggerClass =
  "flex items-center justify-center w-10 h-10 rounded-md border border-gray-400 bg-gray-200 text-gray-600 cursor-pointer transition-all duration-300 ease-in-out hover:bg-gray-100 hover:text-gray-800 data-[state=active]:bg-white data-[state=active]:text-black data-[state=active]:border-gray-500";

const sectionHeaderClass = "text-sm font-semibold text-gray-700 mb-2 mt-0";

const inputClass =
  "w-full border border-gray-200 rounded-sm p-1.5 text-sm focus:outline-none focus:ring focus:ring-blue-300 focus:border-blue-400";

function SettingsPanel() {
  const { settings, updateSettings } = useSettings();
  const [wifiInterfaces, setWifiInterfaces] = useState<string[]>([]);

  // Network management state
  const [networkDevices, setNetworkDevices] = useState<NetworkDevice[]>([]);
  const [hotspotIface, setHotspotIface] = useState("");
  const [hotspotSsid, setHotspotSsid] = useState("BlckIT-Survey");
  const [hotspotPassword, setHotspotPassword] = useState("");
  const [hotspotActive, setHotspotActive] = useState(false);
  const [hotspotLoading, setHotspotLoading] = useState(false);
  const [connectIface, setConnectIface] = useState("");
  const [scannedNetworks, setScannedNetworks] = useState<ScannedNetwork[]>([]);
  const [scanning, setScanning] = useState(false);
  const [connectDialogOpen, setConnectDialogOpen] = useState(false);
  const [selectedNetwork, setSelectedNetwork] = useState<ScannedNetwork | null>(null);
  const [connectPassword, setConnectPassword] = useState("");
  const [connecting, setConnecting] = useState(false);
  const [isHidden, setIsHidden] = useState(false);
  const [hiddenSsid, setHiddenSsid] = useState("");
  const [disconnecting, setDisconnecting] = useState(false);
  const [netStatusMsg, setNetStatusMsg] = useState("");

  const sudoerPassword = settings.sudoerPassword || "";

  // Fetch WiFi interfaces
  const fetchInterfaces = useCallback(async () => {
    try {
      const res = await fetch("/api/wifi-interfaces");
      const data = await res.json();
      const ifaces: string[] = data.interfaces || [];
      setWifiInterfaces(ifaces);
      if (ifaces.length > 0) {
        setHotspotIface((prev) => prev || ifaces[0]);
        setConnectIface((prev) => prev || ifaces[0]);
      }
    } catch {
      setWifiInterfaces([]);
    }
  }, []);

  // Fetch network device status
  const fetchDeviceStatus = useCallback(async () => {
    try {
      const res = await fetch("/api/network/status");
      const data = await res.json();
      setNetworkDevices(data.devices || []);
    } catch {
      setNetworkDevices([]);
    }
  }, []);

  // Fetch hotspot status
  const fetchHotspotStatus = useCallback(async () => {
    if (!hotspotIface) return;
    try {
      const res = await fetch(`/api/network/hotspot?ifname=${encodeURIComponent(hotspotIface)}`);
      const data = await res.json();
      setHotspotActive(data.active || false);
    } catch {
      setHotspotActive(false);
    }
  }, [hotspotIface]);

  // Scan networks
  const scanNetworks = useCallback(async () => {
    if (!connectIface) return;
    setScanning(true);
    try {
      const res = await fetch(`/api/wifi-scan?iface=${encodeURIComponent(connectIface)}`);
      const data = await res.json();
      setScannedNetworks(data.ssids || []);
    } catch {
      setScannedNetworks([]);
    } finally {
      setScanning(false);
    }
  }, [connectIface]);

  // Toggle hotspot
  const toggleHotspot = async () => {
    setHotspotLoading(true);
    setNetStatusMsg("");
    try {
      const action = hotspotActive ? "stop" : "start";
      const res = await fetch("/api/network/hotspot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, ifname: hotspotIface, ssid: hotspotSsid, password: hotspotPassword, sudoerPassword }),
      });
      const data = await res.json();
      setNetStatusMsg(data.message);
      await fetchHotspotStatus();
      await fetchDeviceStatus();
    } catch (err) {
      setNetStatusMsg(`Error: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setHotspotLoading(false);
    }
  };

  // Connect to network
  const connectToNetwork = async () => {
    const ssid = isHidden ? hiddenSsid : selectedNetwork?.ssid;
    if (!ssid || !connectIface) return;
    setConnecting(true);
    setNetStatusMsg("");
    try {
      const res = await fetch("/api/network/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ssid, password: connectPassword, ifname: connectIface, hidden: isHidden, sudoerPassword }),
      });
      const data = await res.json();
      setNetStatusMsg(data.message);
      if (data.success) {
        setConnectDialogOpen(false);
        setConnectPassword("");
        setSelectedNetwork(null);
        setIsHidden(false);
        setHiddenSsid("");
        await fetchDeviceStatus();
        await scanNetworks();
      }
    } catch (err) {
      setNetStatusMsg(`Error: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setConnecting(false);
    }
  };

  // Disconnect interface
  const disconnectDevice = async (ifname: string) => {
    setDisconnecting(true);
    setNetStatusMsg("");
    try {
      const res = await fetch("/api/network/disconnect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ifname, sudoerPassword }),
      });
      const data = await res.json();
      setNetStatusMsg(data.message);
      await fetchDeviceStatus();
      await fetchHotspotStatus();
    } catch (err) {
      setNetStatusMsg(`Error: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setDisconnecting(false);
    }
  };

  // Signal strength bars
  const signalBars = (strength: number) => {
    const bars = Math.ceil(strength / 25);
    return (
      <span className="inline-flex gap-0.5 items-end h-4" title={`${strength}%`}>
        {[1, 2, 3, 4].map((i) => (
          <span
            key={i}
            className={`inline-block w-1 rounded-sm ${i <= bars ? "bg-green-500" : "bg-gray-300"}`}
            style={{ height: `${i * 4}px` }}
          />
        ))}
      </span>
    );
  };

  // Initial load
  useEffect(() => {
    fetchInterfaces();
    fetchDeviceStatus();
  }, [fetchInterfaces, fetchDeviceStatus]);

  useEffect(() => {
    fetchHotspotStatus();
  }, [fetchHotspotStatus]);

  useEffect(() => {
    if (connectIface) scanNetworks();
  }, [connectIface, scanNetworks]);

  const debouncedUpdate = useCallback(
    debounce((s: Partial<HeatmapSettings>) => updateSettings(s), 500),
    [updateSettings],
  );

  const wifiDevices = networkDevices.filter((d) => d.type === "wifi");

  const sortedGradientEntries = () => {
    return Object.entries(settings.gradient).sort(([a], [b]) => {
      const numA = parseFloat(a);
      const numB = parseFloat(b);
      return isNaN(numA) || isNaN(numB) ? 0 : numA - numB;
    });
  };


  return (
    <div className="max-w-3xl space-y-6">
      {/* ══ 1. NETWORK — interface, credentials, device status ══ */}
      <section className="space-y-3">
        <h3 className={sectionHeaderClass}>Network</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div className="flex flex-col gap-1">
            <Label className="text-xs font-semibold">
              WiFi Interface&nbsp;
              <PopoverHelper text="Select which WiFi interface to use for scanning. 'Auto' picks the first available." />
            </Label>
            <select
              className={inputClass}
              value={settings.wifiInterface || ""}
              onChange={(e) => updateSettings({ wifiInterface: e.target.value })}
            >
              <option value="">Auto</option>
              {wifiInterfaces.map((iface) => (
                <option key={iface} value={iface}>{iface}</option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <Label className="text-xs font-semibold">
              sudo Password&nbsp;
              <PopoverHelper text="Enter the sudo password: required on macOS or Linux." />
            </Label>
            <PasswordInput
              value={settings.sudoerPassword}
              onChange={(e) => updateSettings({ sudoerPassword: e })}
            />
          </div>
        </div>
        {/* Device status */}
        {netStatusMsg && (
          <div className="text-sm px-3 py-2 rounded-sm bg-blue-50 border border-blue-200 text-blue-800">
            {netStatusMsg}
          </div>
        )}
        {wifiDevices.length > 0 && (
          <div className="space-y-1">
            {wifiDevices.map((d) => (
              <div key={d.device} className="flex items-center justify-between text-sm border border-gray-200 rounded-sm px-3 py-2">
                <div className="flex items-center gap-2">
                  {d.state.includes("connected") ? (
                    <Wifi className="w-3.5 h-3.5 text-green-600" />
                  ) : (
                    <WifiOff className="w-3.5 h-3.5 text-gray-400" />
                  )}
                  <span className="font-mono text-xs">{d.device}</span>
                  <span className="text-gray-500">
                    {d.connection ? `\u2014 ${d.connection}` : "\u2014 disconnected"}
                  </span>
                </div>
                {d.state.includes("connected") && d.connection && (
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={disconnecting}
                    onClick={() => disconnectDevice(d.device)}
                    className="text-xs text-red-500 hover:text-red-700 h-7"
                  >
                    Disconnect
                  </Button>
                )}
              </div>
            ))}
          </div>
        )}
        <Button variant="outline" size="sm" onClick={() => { fetchDeviceStatus(); fetchInterfaces(); }}>
          <RefreshCw className="w-3 h-3 mr-1" />
          Refresh
        </Button>
      </section>

      {/* ══ 2. HOTSPOT ══ */}
      <section className="space-y-3">
        <h3 className={sectionHeaderClass}>
          Hotspot&nbsp;
          <PopoverHelper text="Create a WiFi hotspot so clients can connect directly to this device for surveying without an external network." />
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div className="flex flex-col gap-1">
            <Label className="text-xs font-semibold">
              Interface&nbsp;
              <PopoverHelper text="Select which WiFi adapter to use for the hotspot." />
            </Label>
            <select
              className={inputClass}
              value={hotspotIface}
              onChange={(e) => setHotspotIface(e.target.value)}
              disabled={hotspotActive}
            >
              {wifiInterfaces.map((iface) => (
                <option key={iface} value={iface}>{iface}</option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <Label className="text-xs font-semibold">SSID</Label>
            <input
              type="text"
              className={inputClass}
              value={hotspotSsid}
              onChange={(e) => setHotspotSsid(e.target.value)}
              placeholder="BlckIT-Survey"
              disabled={hotspotActive}
            />
          </div>
          <div className="flex flex-col gap-1">
            <Label className="text-xs font-semibold">
              Password (min 8 characters)&nbsp;
              <PopoverHelper text="WPA2 password for the hotspot. Must be at least 8 characters." />
            </Label>
            <PasswordInput
              value={hotspotPassword}
              onChange={(val) => setHotspotPassword(val)}
            />
          </div>
          <div className="flex items-end gap-3 pb-0.5">
            <div className="flex items-center gap-2">
              <Switch
                checked={hotspotActive}
                onCheckedChange={toggleHotspot}
                disabled={hotspotLoading || (!hotspotActive && (hotspotPassword.length < 8 || !hotspotSsid))}
                aria-label="Toggle hotspot"
              />
              <span className="text-sm">
                {hotspotLoading ? (
                  <Loader2 className="w-4 h-4 animate-spin inline" />
                ) : hotspotActive ? (
                  <span className="text-green-600 font-medium">Active</span>
                ) : (
                  <span className="text-gray-500">Inactive</span>
                )}
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* ══ 3. WIFI CONNECT ══ */}
      <section className="space-y-3">
        <h3 className={sectionHeaderClass}>
          WiFi Connect&nbsp;
          <PopoverHelper text="Connect this device to an existing WiFi network. Useful for providing internet access or connecting to a specific survey network." />
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div className="flex flex-col gap-1">
            <Label className="text-xs font-semibold">Interface</Label>
            <select
              className={inputClass}
              value={connectIface}
              onChange={(e) => setConnectIface(e.target.value)}
            >
              {wifiInterfaces.map((iface) => (
                <option key={iface} value={iface}>{iface}</option>
              ))}
            </select>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={scanNetworks} disabled={scanning || !connectIface}>
            {scanning ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : <RefreshCw className="w-3 h-3 mr-1" />}
            Scan
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setIsHidden(true);
              setSelectedNetwork(null);
              setConnectPassword("");
              setHiddenSsid("");
              setConnectDialogOpen(true);
            }}
          >
            Hidden Network
          </Button>
        </div>
        {scannedNetworks.length > 0 && (
          <div className="space-y-1 max-h-64 overflow-y-auto">
            {scannedNetworks.map((net) => (
              <div
                key={net.ssid}
                className={`flex items-center justify-between text-sm border rounded-sm px-3 py-2 cursor-pointer hover:bg-gray-50 ${
                  net.currentSSID ? "border-green-300 bg-green-50" : "border-gray-200"
                }`}
                onClick={() => {
                  if (!net.currentSSID) {
                    setSelectedNetwork(net);
                    setIsHidden(false);
                    setConnectPassword("");
                    setConnectDialogOpen(true);
                  }
                }}
              >
                <div className="flex items-center gap-2">
                  {net.currentSSID && <Wifi className="w-3 h-3 text-green-600" />}
                  <span className={net.currentSSID ? "font-medium" : ""}>{net.ssid}</span>
                  {signalBars(net.signalStrength)}
                  <span className="text-xs text-gray-400">ch{net.channel}</span>
                  <span className="text-xs text-gray-400">{net.security}</span>
                </div>
                {net.currentSSID ? (
                  <span className="text-xs text-green-600 font-medium">Connected</span>
                ) : (
                  <span className="text-xs text-blue-500">Connect</span>
                )}
              </div>
            ))}
          </div>
        )}
        {scannedNetworks.length === 0 && !scanning && connectIface && (
          <p className="text-sm text-gray-500">No networks found. Click Scan to search.</p>
        )}
      </section>

      {/* WiFi Connect Dialog */}
      <Dialog open={connectDialogOpen} onOpenChange={setConnectDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {isHidden ? "Connect to Hidden Network" : `Connect to "${selectedNetwork?.ssid}"`}
            </DialogTitle>
            <DialogDescription>
              {isHidden
                ? "Enter the SSID and password for the hidden network."
                : `Enter the password to connect via ${connectIface}.`}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            {isHidden && (
              <div className="flex flex-col gap-1">
                <Label className="text-xs font-semibold">SSID</Label>
                <input
                  type="text"
                  className={inputClass}
                  value={hiddenSsid}
                  onChange={(e) => setHiddenSsid(e.target.value)}
                  placeholder="Network name"
                  autoFocus
                />
              </div>
            )}
            <div className="flex flex-col gap-1">
              <Label className="text-xs font-semibold">Password</Label>
              <PasswordInput
                value={connectPassword}
                onChange={(val) => setConnectPassword(val)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConnectDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={connectToNetwork}
              disabled={connecting || (isHidden ? !hiddenSsid : !selectedNetwork?.ssid)}
            >
              {connecting ? (
                <>
                  <Loader2 className="w-4 h-4 mr-1 animate-spin" />
                  Connecting...
                </>
              ) : (
                "Connect"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ══ 4. SURVEY — iperf, target SSID, test duration, AP mapping ══ */}
      <section className="space-y-3">
        <h3 className={sectionHeaderClass}>
          Survey&nbsp;
          <PopoverHelper text="Configure how measurements are taken: iperf server, test duration, target network, and AP name mapping." />
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div className="flex flex-col gap-1">
            <Label className="text-xs font-semibold">
              iperf Server&nbsp;
              <PopoverHelper text="Address of an iperf3 server (e.g., 192.168.1.10 or 192.168.1.10:5201). Port 5201 is used by default. Set to 'localhost' to skip iperf tests." />
            </Label>
            <input
              type="text"
              placeholder="192.168.1.10"
              className={inputClass}
              value={settings.iperfServerAdrs}
              onChange={(e) => updateSettings({ iperfServerAdrs: e.target.value.trim() })}
            />
          </div>
          <div className="flex flex-col gap-1">
            <Label className="text-xs font-semibold">
              Test Duration (seconds)&nbsp;
              <PopoverHelper text="Duration of each iperf3 test in seconds." />
            </Label>
            <input
              type="number"
              min={1}
              max={60}
              className={inputClass}
              value={settings.testDuration}
              onChange={(e) => updateSettings({ testDuration: Math.max(1, Math.min(60, parseInt(e.target.value) || 1)) })}
            />
          </div>
          <div className="flex flex-col gap-1 md:col-span-2">
            <Label className="text-xs font-semibold">
              Target SSID&nbsp;
              <PopoverHelper text="If set, measure signal strength for this SSID instead of the connected network. Useful for passive scanning of a specific network." />
            </Label>
            <input
              type="text"
              placeholder="Leave empty to use connected network"
              className={inputClass}
              value={settings.targetSSID || ""}
              onChange={(e) => updateSettings({ targetSSID: e.target.value.trim() })}
            />
          </div>
        </div>

        {/* Advanced: iperf commands + AP mapping */}
        <Accordion type="multiple" className="w-full">
          <AccordionItem value="iperf-commands" className="border-gray-200">
            <AccordionTrigger className="text-xs font-semibold text-gray-600 py-2 hover:no-underline">
              Advanced iperf Commands
            </AccordionTrigger>
            <AccordionContent>
              <div className="space-y-3">
                <div className="flex flex-col gap-1">
                  <Label className="text-xs font-semibold">TCP Download</Label>
                  <input
                    type="text"
                    className={inputClass + " font-mono"}
                    value={settings.iperfCommands?.tcpDownload || ""}
                    onChange={(e) => debouncedUpdate({ iperfCommands: { ...settings.iperfCommands, tcpDownload: e.target.value } })}
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <Label className="text-xs font-semibold">TCP Upload</Label>
                  <input
                    type="text"
                    className={inputClass + " font-mono"}
                    value={settings.iperfCommands?.tcpUpload || ""}
                    onChange={(e) => debouncedUpdate({ iperfCommands: { ...settings.iperfCommands, tcpUpload: e.target.value } })}
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <Label className="text-xs font-semibold">
                    UDP Download&nbsp;
                    <PopoverHelper text="The -b 100M bitrate is a safe default. Increase to -b 300M or higher for faster networks." />
                  </Label>
                  <input
                    type="text"
                    className={inputClass + " font-mono"}
                    value={settings.iperfCommands?.udpDownload || ""}
                    onChange={(e) => debouncedUpdate({ iperfCommands: { ...settings.iperfCommands, udpDownload: e.target.value } })}
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <Label className="text-xs font-semibold">
                    UDP Upload&nbsp;
                    <PopoverHelper text="The -b 100M bitrate is a safe default. Increase to -b 300M or higher for faster networks." />
                  </Label>
                  <input
                    type="text"
                    className={inputClass + " font-mono"}
                    value={settings.iperfCommands?.udpUpload || ""}
                    onChange={(e) => debouncedUpdate({ iperfCommands: { ...settings.iperfCommands, udpUpload: e.target.value } })}
                  />
                </div>
              </div>
            </AccordionContent>
          </AccordionItem>
          <AccordionItem value="ap-mapping" className="border-gray-200">
            <AccordionTrigger className="text-xs font-semibold text-gray-600 py-2 hover:no-underline">
              AP Mapping
            </AccordionTrigger>
            <AccordionContent>
              <EditableApMapping
                apMapping={settings.apMapping}
                onSave={(apMapping) => updateSettings({ apMapping })}
              />
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      </section>

      {/* ══ 5. VISUALIZATION — heatmap + gradient ══ */}
      <section className="space-y-3">
        <h3 className={sectionHeaderClass}>Visualization</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div className="flex flex-col gap-1">
            <Label className="text-xs font-semibold">
              Min Opacity&nbsp;
              <PopoverHelper text="The minimum opacity of the heatmap points. Values range from 0 to 1." />
            </Label>
            <input
              type="number"
              min="0"
              max="1"
              step="0.1"
              className={inputClass}
              value={settings.minOpacity}
              onChange={(e) => debouncedUpdate({ minOpacity: parseFloat(e.target.value) })}
            />
          </div>
          <div className="flex flex-col gap-1">
            <Label className="text-xs font-semibold">
              Max Opacity&nbsp;
              <PopoverHelper text="The maximum opacity of the heatmap points. Values range from 0 to 1." />
            </Label>
            <input
              type="number"
              min="0"
              max="1"
              step="0.1"
              className={inputClass}
              value={settings.maxOpacity}
              onChange={(e) => debouncedUpdate({ maxOpacity: parseFloat(e.target.value) })}
            />
          </div>
          <div className="flex flex-col gap-1">
            <Label className="text-xs font-semibold">
              Blur&nbsp;
              <PopoverHelper text="The amount of blur applied to the heatmap. Values range from 0 to 1." />
            </Label>
            <input
              type="number"
              min="0"
              max="1"
              step="0.01"
              className={inputClass}
              value={settings.blur}
              onChange={(e) => debouncedUpdate({ blur: parseFloat(e.target.value) })}
            />
          </div>
        </div>

        {/* Gradient editor */}
        <div className="pt-2">
          <Label className="text-xs font-semibold">
            Gradient&nbsp;
            <PopoverHelper text="Define the color gradient for the heatmap. Each key represents a point in the gradient (0 to 1), and the value is the color." />
          </Label>
          <div className="mt-2">
            <div className="flex items-center gap-2 mb-1 text-xs font-semibold text-gray-500">
              <span className="w-20 text-center">Position</span>
              <span className="w-10 text-center">Color</span>
              <span className="w-20 text-center">Opacity</span>
              <span className="w-8" />
            </div>
            {sortedGradientEntries().map(([key, value]) => {
              const hexColor = rgbaToHex(value);
              const alpha = parseFloat(value.split(",")[3]) || 1;
              return (
                <div key={key} className="flex items-center gap-2 mt-2">
                  <input
                    type="text"
                    value={key}
                    onChange={(e) => {
                      const newGradient = { ...settings.gradient };
                      delete newGradient[parseInt(key)];
                      newGradient[parseInt(e.target.value)] = value;
                      debouncedUpdate({ gradient: newGradient });
                    }}
                    className={inputClass + " w-20"}
                  />
                  <input
                    type="color"
                    value={hexColor}
                    onChange={(e) => {
                      const newColor = hexToRgba(e.target.value, alpha);
                      const newGradient = { ...settings.gradient, [key]: newColor };
                      debouncedUpdate({ gradient: newGradient });
                    }}
                    className="w-10 h-8 border border-gray-200 rounded-sm cursor-pointer"
                  />
                  <input
                    type="number"
                    min="0"
                    max="1"
                    step="0.1"
                    value={alpha}
                    onChange={(e) => {
                      const newAlpha = parseFloat(e.target.value);
                      const newColor = hexToRgba(hexColor, newAlpha);
                      const newGradient = { ...settings.gradient, [key]: newColor };
                      debouncedUpdate({ gradient: newGradient });
                    }}
                    className={inputClass + " w-20"}
                  />
                  <Button
                    variant="ghost"
                    size="sm"
                    type="button"
                    onClick={() => {
                      const newGradient = { ...settings.gradient };
                      delete newGradient[parseFloat(key)];
                      debouncedUpdate({ gradient: newGradient });
                    }}
                    title="Remove color stop"
                    className="text-gray-400 hover:text-red-500"
                  >
                    ✕
                  </Button>
                </div>
              );
            })}
            <Button
              variant="outline"
              size="sm"
              type="button"
              onClick={() => {
                const newGradient = { ...settings.gradient, [0.5]: "rgba(0, 0, 0, 1)" };
                debouncedUpdate({ gradient: newGradient });
              }}
              className="mt-3"
            >
              + Add Color Stop
            </Button>
          </div>
        </div>
      </section>

      {/* ══ 6. WALL EDITOR ══ */}
      <section className="space-y-3">
        <h3 className={sectionHeaderClass}>Wall Editor</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div className="flex flex-col gap-1">
            <Label className="text-xs font-semibold">
              Snap Radius (px)&nbsp;
              <PopoverHelper text="How close (in pixels) the cursor needs to be to snap to an existing wall endpoint or to close a room." />
            </Label>
            <input
              type="number"
              min={2}
              max={30}
              value={settings.snapRadius}
              onChange={(e) => updateSettings({ snapRadius: Math.max(2, Math.min(30, parseInt(e.target.value) || 8)) })}
              className={inputClass}
            />
          </div>
        </div>
      </section>

      {/* ══ 7. RESET ══ */}
      <section className="pt-4 border-t border-gray-200">
        <Button variant="destructive" size="sm" onClick={() => {
          const defaults = getDefaults(settings.floorplanImageName);
          updateSettings({
            maxOpacity: defaults.maxOpacity,
            minOpacity: defaults.minOpacity,
            blur: defaults.blur,
            gradient: defaults.gradient,
            iperfCommands: defaults.iperfCommands,
            iperfServerAdrs: defaults.iperfServerAdrs,
            testDuration: defaults.testDuration,
            wifiInterface: defaults.wifiInterface,
            targetSSID: "",
            snapRadius: defaults.snapRadius,
            sudoerPassword: "",
          });
        }}>
          Reset Settings to Defaults
        </Button>
      </section>
    </div>
  );
}

export default function TabPanel() {
  const [activeTab, setActiveTab] = useState("site-setup");
  const { settings, updateSettings, surveyPointActions } = useSettings();

  return (
    <div className="w-full p-2">
      <Tabs.Root value={activeTab} onValueChange={setActiveTab}>
        <Tabs.List className="flex items-end gap-2 pt-1">
          <Tabs.Trigger
            value="site-setup"
            data-radix-collection-item
            className={tabTriggerClass}
          >
            Site&nbsp;Setup
          </Tabs.Trigger>
          <Tabs.Trigger
            value="survey"
            data-radix-collection-item
            className={tabTriggerClass}
          >
            Survey
          </Tabs.Trigger>
          <Tabs.Trigger
            value="report"
            data-radix-collection-item
            className={tabTriggerClass}
          >
            Report
          </Tabs.Trigger>

          <div className="flex-1" />

          <div className="w-px h-8 bg-gray-300 mx-1 self-center" />

          <Tabs.Trigger
            value="settings"
            data-radix-collection-item
            className={settingsTriggerClass}
            title="Settings"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
              <circle cx="12" cy="12" r="3" />
            </svg>
          </Tabs.Trigger>
        </Tabs.List>

        {/* Settings tab — organized configuration sections */}
        <Tabs.Content value="settings" className="p-4">
          <SettingsPanel />
        </Tabs.Content>

        {/* Tab 1: Site Setup — site manager + wall editor */}
        <Tabs.Content value="site-setup" className="p-4">
          <div className="mb-4">
            <SiteManager />
          </div>
          <WallEditor />
        </Tabs.Content>

        {/* Tab 2: Survey — floor selector, compact settings bar, floor plan + sidebar */}
        <Tabs.Content value="survey" className="p-4">
          <FloorSelector />
          <SurveySettingsBar />
          <div className="flex gap-4">
            <div className="flex-1 min-w-0">
              <ClickableFloorplan />
            </div>
            <div className="w-[320px] shrink-0 overflow-auto">
              <PointsTable
                data={settings.surveyPoints}
                surveyPointActions={surveyPointActions}
                apMapping={settings.apMapping}
              />
            </div>
          </div>
        </Tabs.Content>

        {/* Tab 3: Report — floor selector + heatmaps */}
        <Tabs.Content value="report" className="p-4">
          <FloorSelector />
          <Heatmaps />
        </Tabs.Content>
      </Tabs.Root>
    </div>
  );
}
