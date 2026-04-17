"use client";

import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { PasswordInput } from "@/components/PasswordInput";
import { PopoverHelper } from "@/components/PopoverHelpText";
import { useSettings } from "@/components/GlobalSettings";
import { Wifi, WifiOff, RefreshCw, Loader2 } from "lucide-react";

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

interface HotspotStatus {
  active: boolean;
  ssid: string;
  ifname: string;
}

const inputClass =
  "w-full border border-gray-200 rounded-sm p-1.5 text-sm focus:outline-none focus:ring focus:ring-blue-300 focus:border-blue-400";

const sectionHeaderClass = "text-sm font-semibold text-gray-700 mb-2 mt-0";

export default function NetworkManager() {
  const { settings } = useSettings();
  const sudoerPassword = settings.sudoerPassword || "";

  // Interface state
  const [wifiInterfaces, setWifiInterfaces] = useState<string[]>([]);
  const [networkDevices, setNetworkDevices] = useState<NetworkDevice[]>([]);

  // Hotspot state
  const [hotspotIface, setHotspotIface] = useState("");
  const [hotspotSsid, setHotspotSsid] = useState("BlckIT-Survey");
  const [hotspotPassword, setHotspotPassword] = useState("");
  const [hotspotStatus, setHotspotStatus] = useState<HotspotStatus>({
    active: false,
    ssid: "",
    ifname: "",
  });
  const [hotspotLoading, setHotspotLoading] = useState(false);

  // WiFi connect state
  const [connectIface, setConnectIface] = useState("");
  const [scannedNetworks, setScannedNetworks] = useState<ScannedNetwork[]>([]);
  const [scanning, setScanning] = useState(false);
  const [connectDialogOpen, setConnectDialogOpen] = useState(false);
  const [selectedNetwork, setSelectedNetwork] = useState<ScannedNetwork | null>(null);
  const [connectPassword, setConnectPassword] = useState("");
  const [connecting, setConnecting] = useState(false);
  const [isHidden, setIsHidden] = useState(false);
  const [hiddenSsid, setHiddenSsid] = useState("");

  // Disconnect state
  const [disconnecting, setDisconnecting] = useState(false);

  // Status message
  const [statusMsg, setStatusMsg] = useState("");

  // ── Fetch interfaces ──
  const fetchInterfaces = useCallback(async () => {
    try {
      const res = await fetch("/api/wifi-interfaces");
      const data = await res.json();
      const ifaces: string[] = data.interfaces || [];
      setWifiInterfaces(ifaces);
      if (ifaces.length > 0) {
        if (!hotspotIface) setHotspotIface(ifaces[0]);
        if (!connectIface) setConnectIface(ifaces[0]);
      }
    } catch {
      setWifiInterfaces([]);
    }
  }, [hotspotIface, connectIface]);

  // ── Fetch network device status ──
  const fetchDeviceStatus = useCallback(async () => {
    try {
      const res = await fetch("/api/network/status");
      const data = await res.json();
      setNetworkDevices(data.devices || []);
    } catch {
      setNetworkDevices([]);
    }
  }, []);

  // ── Fetch hotspot status ──
  const fetchHotspotStatus = useCallback(async () => {
    if (!hotspotIface) return;
    try {
      const res = await fetch(
        `/api/network/hotspot?ifname=${encodeURIComponent(hotspotIface)}`,
      );
      const data = await res.json();
      setHotspotStatus(data);
    } catch {
      setHotspotStatus({ active: false, ssid: "", ifname: hotspotIface });
    }
  }, [hotspotIface]);

  // ── Scan networks ──
  const scanNetworks = useCallback(async () => {
    if (!connectIface) return;
    setScanning(true);
    try {
      const res = await fetch(
        `/api/wifi-scan?iface=${encodeURIComponent(connectIface)}`,
      );
      const data = await res.json();
      setScannedNetworks(data.ssids || []);
    } catch {
      setScannedNetworks([]);
    } finally {
      setScanning(false);
    }
  }, [connectIface]);

  // ── Toggle hotspot ──
  const toggleHotspot = async () => {
    setHotspotLoading(true);
    setStatusMsg("");
    try {
      const action = hotspotStatus.active ? "stop" : "start";
      const res = await fetch("/api/network/hotspot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action,
          ifname: hotspotIface,
          ssid: hotspotSsid,
          password: hotspotPassword,
          sudoerPassword,
        }),
      });
      const data = await res.json();
      setStatusMsg(data.message);
      await fetchHotspotStatus();
      await fetchDeviceStatus();
    } catch (err) {
      setStatusMsg(`Error: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setHotspotLoading(false);
    }
  };

  // ── Connect to network ──
  const connectToNetwork = async () => {
    const ssid = isHidden ? hiddenSsid : selectedNetwork?.ssid;
    if (!ssid || !connectIface) return;

    setConnecting(true);
    setStatusMsg("");
    try {
      const res = await fetch("/api/network/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ssid,
          password: connectPassword,
          ifname: connectIface,
          hidden: isHidden,
          sudoerPassword,
        }),
      });
      const data = await res.json();
      setStatusMsg(data.message);
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
      setStatusMsg(`Error: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setConnecting(false);
    }
  };

  // ── Disconnect ──
  const disconnectIface = async (ifname: string) => {
    setDisconnecting(true);
    setStatusMsg("");
    try {
      const res = await fetch("/api/network/disconnect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ifname, sudoerPassword }),
      });
      const data = await res.json();
      setStatusMsg(data.message);
      await fetchDeviceStatus();
      await fetchHotspotStatus();
    } catch (err) {
      setStatusMsg(`Error: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setDisconnecting(false);
    }
  };

  // ── Initial load ──
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

  // ── Signal strength indicator ──
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

  const wifiDevices = networkDevices.filter((d) => d.type === "wifi");

  return (
    <div className="space-y-6">
      {/* Status message */}
      {statusMsg && (
        <div className="text-sm px-3 py-2 rounded-sm bg-blue-50 border border-blue-200 text-blue-800">
          {statusMsg}
        </div>
      )}

      {/* ── Device Status ── */}
      <section className="space-y-3">
        <h3 className={sectionHeaderClass}>
          Device Status&nbsp;
          <PopoverHelper text="Shows the current state of all WiFi interfaces on this device." />
        </h3>
        {wifiDevices.length === 0 ? (
          <p className="text-sm text-gray-500">No WiFi devices found.</p>
        ) : (
          <div className="space-y-2">
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
                    {d.connection ? `— ${d.connection}` : "— disconnected"}
                  </span>
                </div>
                {d.state.includes("connected") && d.connection && (
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={disconnecting}
                    onClick={() => disconnectIface(d.device)}
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

      {/* ── Hotspot ── */}
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
              disabled={hotspotStatus.active}
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
              disabled={hotspotStatus.active}
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
                checked={hotspotStatus.active}
                onCheckedChange={toggleHotspot}
                disabled={
                  hotspotLoading ||
                  (!hotspotStatus.active && (hotspotPassword.length < 8 || !hotspotSsid))
                }
                aria-label="Toggle hotspot"
              />
              <span className="text-sm">
                {hotspotLoading ? (
                  <Loader2 className="w-4 h-4 animate-spin inline" />
                ) : hotspotStatus.active ? (
                  <span className="text-green-600 font-medium">Active</span>
                ) : (
                  <span className="text-gray-500">Inactive</span>
                )}
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* ── WiFi Connect ── */}
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

        {/* Network list */}
        {scannedNetworks.length > 0 && (
          <div className="space-y-1 max-h-64 overflow-y-auto">
            {scannedNetworks.map((net) => {
              const isConnected = net.currentSSID;
              return (
                <div
                  key={net.ssid}
                  className={`flex items-center justify-between text-sm border rounded-sm px-3 py-2 cursor-pointer hover:bg-gray-50 ${
                    isConnected ? "border-green-300 bg-green-50" : "border-gray-200"
                  }`}
                  onClick={() => {
                    if (!isConnected) {
                      setSelectedNetwork(net);
                      setIsHidden(false);
                      setConnectPassword("");
                      setConnectDialogOpen(true);
                    }
                  }}
                >
                  <div className="flex items-center gap-2">
                    {isConnected && <Wifi className="w-3 h-3 text-green-600" />}
                    <span className={isConnected ? "font-medium" : ""}>{net.ssid}</span>
                    {signalBars(net.signalStrength)}
                    <span className="text-xs text-gray-400">ch{net.channel}</span>
                    <span className="text-xs text-gray-400">{net.security}</span>
                  </div>
                  {isConnected ? (
                    <span className="text-xs text-green-600 font-medium">Connected</span>
                  ) : (
                    <span className="text-xs text-blue-500">Connect</span>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {scannedNetworks.length === 0 && !scanning && connectIface && (
          <p className="text-sm text-gray-500">No networks found. Click Scan to search.</p>
        )}
      </section>

      {/* ── Connect Dialog ── */}
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
                <Input
                  value={hiddenSsid}
                  onChange={(e) => setHiddenSsid(e.target.value)}
                  placeholder="Network name"
                  className="h-8 text-sm"
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
    </div>
  );
}
