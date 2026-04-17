"use client";

import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { PasswordInput } from "@/components/PasswordInput";
import { useSettings } from "@/components/GlobalSettings";
import { Wifi, WifiOff, RefreshCw, Radio, Loader2 } from "lucide-react";

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

const sectionHeaderClass = "text-sm font-semibold text-gray-700 mb-2 mt-0";
const inputClass =
  "w-full border border-gray-200 rounded-sm p-1.5 text-sm focus:outline-none focus:ring focus:ring-blue-300 focus:border-blue-400";

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
  const [selectedNetwork, setSelectedNetwork] = useState<ScannedNetwork | null>(
    null,
  );
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
      setStatusMsg(
        `Fel: ${err instanceof Error ? err.message : String(err)}`,
      );
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
      setStatusMsg(
        `Fel: ${err instanceof Error ? err.message : String(err)}`,
      );
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
      setStatusMsg(
        `Fel: ${err instanceof Error ? err.message : String(err)}`,
      );
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

  // ── Signal strength bar helper ──
  const signalBars = (strength: number) => {
    const bars = Math.ceil(strength / 25);
    return (
      <span className="inline-flex gap-0.5 items-end h-4" title={`${strength}%`}>
        {[1, 2, 3, 4].map((i) => (
          <span
            key={i}
            className={`inline-block w-1 rounded-sm ${
              i <= bars ? "bg-green-500" : "bg-gray-300"
            }`}
            style={{ height: `${i * 4}px` }}
          />
        ))}
      </span>
    );
  };

  // Find active connection for an interface
  const getDeviceInfo = (ifname: string) =>
    networkDevices.find((d) => d.device === ifname);

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
          <span className="inline-flex items-center gap-1.5">
            <Radio className="w-4 h-4" />
            Nätverksstatus
          </span>
        </h3>
        {networkDevices.length === 0 ? (
          <p className="text-sm text-gray-500">Inga enheter hittades</p>
        ) : (
          <div className="border border-gray-200 rounded-sm overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 text-left">
                  <th className="px-3 py-1.5 font-medium">Enhet</th>
                  <th className="px-3 py-1.5 font-medium">Typ</th>
                  <th className="px-3 py-1.5 font-medium">Status</th>
                  <th className="px-3 py-1.5 font-medium">Anslutning</th>
                  <th className="px-3 py-1.5 font-medium"></th>
                </tr>
              </thead>
              <tbody>
                {networkDevices
                  .filter((d) => d.type === "wifi")
                  .map((d) => (
                    <tr key={d.device} className="border-t border-gray-100">
                      <td className="px-3 py-1.5 font-mono text-xs">
                        {d.device}
                      </td>
                      <td className="px-3 py-1.5">{d.type}</td>
                      <td className="px-3 py-1.5">
                        <span
                          className={`inline-flex items-center gap-1 ${
                            d.state.includes("connected")
                              ? "text-green-600"
                              : "text-gray-500"
                          }`}
                        >
                          {d.state.includes("connected") ? (
                            <Wifi className="w-3 h-3" />
                          ) : (
                            <WifiOff className="w-3 h-3" />
                          )}
                          {d.state}
                        </span>
                      </td>
                      <td className="px-3 py-1.5">{d.connection || "—"}</td>
                      <td className="px-3 py-1.5">
                        {d.state.includes("connected") && d.connection && (
                          <Button
                            variant="ghost"
                            size="sm"
                            disabled={disconnecting}
                            onClick={() => disconnectIface(d.device)}
                            className="text-xs text-red-500 hover:text-red-700"
                          >
                            Koppla från
                          </Button>
                        )}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        )}
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            fetchDeviceStatus();
            fetchInterfaces();
          }}
        >
          <RefreshCw className="w-3 h-3 mr-1" />
          Uppdatera
        </Button>
      </section>

      {/* ── Hotspot ── */}
      <section className="space-y-3">
        <h3 className={sectionHeaderClass}>
          <span className="inline-flex items-center gap-1.5">
            <Wifi className="w-4 h-4" />
            Hotspot
          </span>
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div className="flex flex-col gap-1">
            <Label className="text-xs font-semibold">Interface</Label>
            <select
              className={inputClass}
              value={hotspotIface}
              onChange={(e) => setHotspotIface(e.target.value)}
              disabled={hotspotStatus.active}
            >
              {wifiInterfaces.map((iface) => (
                <option key={iface} value={iface}>
                  {iface}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <Label className="text-xs font-semibold">SSID</Label>
            <Input
              value={hotspotSsid}
              onChange={(e) => setHotspotSsid(e.target.value)}
              placeholder="BlckIT-Survey"
              disabled={hotspotStatus.active}
              className="h-8 text-sm"
            />
          </div>
          <div className="flex flex-col gap-1">
            <Label className="text-xs font-semibold">Lösenord (min 8 tecken)</Label>
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
                  (!hotspotStatus.active &&
                    (hotspotPassword.length < 8 || !hotspotSsid))
                }
                aria-label="Hotspot av/på"
              />
              <span className="text-sm">
                {hotspotLoading ? (
                  <Loader2 className="w-4 h-4 animate-spin inline" />
                ) : hotspotStatus.active ? (
                  <span className="text-green-600 font-medium">Aktiv</span>
                ) : (
                  <span className="text-gray-500">Inaktiv</span>
                )}
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* ── WiFi-anslutning ── */}
      <section className="space-y-3">
        <h3 className={sectionHeaderClass}>
          <span className="inline-flex items-center gap-1.5">
            <Wifi className="w-4 h-4" />
            WiFi-anslutning
          </span>
        </h3>
        <div className="flex items-end gap-3 mb-2">
          <div className="flex flex-col gap-1">
            <Label className="text-xs font-semibold">Interface</Label>
            <select
              className={inputClass}
              value={connectIface}
              onChange={(e) => setConnectIface(e.target.value)}
            >
              {wifiInterfaces.map((iface) => (
                <option key={iface} value={iface}>
                  {iface}
                </option>
              ))}
            </select>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={scanNetworks}
            disabled={scanning || !connectIface}
          >
            {scanning ? (
              <Loader2 className="w-3 h-3 mr-1 animate-spin" />
            ) : (
              <RefreshCw className="w-3 h-3 mr-1" />
            )}
            Skanna
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
            Dolt nätverk
          </Button>
        </div>

        {/* Network list */}
        {scannedNetworks.length > 0 && (
          <div className="border border-gray-200 rounded-sm overflow-hidden max-h-64 overflow-y-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 text-left sticky top-0">
                  <th className="px-3 py-1.5 font-medium">SSID</th>
                  <th className="px-3 py-1.5 font-medium">Signal</th>
                  <th className="px-3 py-1.5 font-medium">Kanal</th>
                  <th className="px-3 py-1.5 font-medium">Band</th>
                  <th className="px-3 py-1.5 font-medium">Säkerhet</th>
                  <th className="px-3 py-1.5 font-medium"></th>
                </tr>
              </thead>
              <tbody>
                {scannedNetworks.map((net) => {
                  const deviceInfo = getDeviceInfo(connectIface);
                  const isConnected =
                    net.currentSSID ||
                    (deviceInfo?.connection === net.ssid &&
                      deviceInfo?.state.includes("connected"));

                  return (
                    <tr
                      key={net.ssid}
                      className={`border-t border-gray-100 hover:bg-gray-50 cursor-pointer ${
                        isConnected ? "bg-green-50" : ""
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
                      <td className="px-3 py-1.5 font-medium">
                        {isConnected && (
                          <Wifi className="w-3 h-3 inline mr-1 text-green-600" />
                        )}
                        {net.ssid}
                      </td>
                      <td className="px-3 py-1.5">
                        {signalBars(net.signalStrength)}
                      </td>
                      <td className="px-3 py-1.5">{net.channel}</td>
                      <td className="px-3 py-1.5">{net.band}</td>
                      <td className="px-3 py-1.5 text-xs">{net.security}</td>
                      <td className="px-3 py-1.5">
                        {isConnected ? (
                          <span className="text-xs text-green-600 font-medium">
                            Ansluten
                          </span>
                        ) : (
                          <Button variant="ghost" size="sm" className="text-xs">
                            Anslut
                          </Button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {scannedNetworks.length === 0 && !scanning && connectIface && (
          <p className="text-sm text-gray-500">
            Inga nätverk hittades. Klicka Skanna för att söka.
          </p>
        )}
      </section>

      {/* ── Connect Dialog ── */}
      <Dialog open={connectDialogOpen} onOpenChange={setConnectDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {isHidden
                ? "Anslut till dolt nätverk"
                : `Anslut till "${selectedNetwork?.ssid}"`}
            </DialogTitle>
            <DialogDescription>
              {isHidden
                ? "Ange SSID och lösenord för det dolda nätverket."
                : `Ange lösenord för att ansluta via ${connectIface}.`}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            {isHidden && (
              <div className="flex flex-col gap-1">
                <Label className="text-xs font-semibold">SSID</Label>
                <Input
                  value={hiddenSsid}
                  onChange={(e) => setHiddenSsid(e.target.value)}
                  placeholder="Nätverksnamn"
                  className="h-8 text-sm"
                  autoFocus
                />
              </div>
            )}
            <div className="flex flex-col gap-1">
              <Label className="text-xs font-semibold">Lösenord</Label>
              <PasswordInput
                value={connectPassword}
                onChange={(val) => setConnectPassword(val)}
              />
            </div>
            {!isHidden && (
              <div className="flex items-center gap-2">
                <Checkbox
                  id="hidden-check"
                  checked={isHidden}
                  onCheckedChange={(checked) => setIsHidden(checked === true)}
                />
                <Label htmlFor="hidden-check" className="text-xs">
                  Dolt nätverk
                </Label>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setConnectDialogOpen(false)}
            >
              Avbryt
            </Button>
            <Button
              onClick={connectToNetwork}
              disabled={
                connecting ||
                (isHidden ? !hiddenSsid : !selectedNetwork?.ssid)
              }
            >
              {connecting ? (
                <>
                  <Loader2 className="w-4 h-4 mr-1 animate-spin" />
                  Ansluter...
                </>
              ) : (
                "Anslut"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
