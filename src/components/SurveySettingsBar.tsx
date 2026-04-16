import { useSettings } from "@/components/GlobalSettings";
import { PasswordInput } from "./PasswordInput";
import { Label } from "@/components/ui/label";
import { PopoverHelper } from "@/components/PopoverHelpText";
import { useState, useEffect, useCallback } from "react";
import { WifiResults } from "@/lib/types";

/**
 * SurveySettingsBar — compact horizontal settings bar for the Survey tab.
 * Contains: WiFi Interface, Target SSID, iperf server, test duration, sudo password.
 */
export default function SurveySettingsBar() {
  const { settings, updateSettings } = useSettings();
  const [wifiInterfaces, setWifiInterfaces] = useState<string[]>([]);
  const [scannedSSIDs, setScannedSSIDs] = useState<WifiResults[]>([]);
  const [ssidLoading, setSsidLoading] = useState(false);

  useEffect(() => {
    fetch("/api/wifi-interfaces")
      .then((res) => res.json())
      .then((data) => setWifiInterfaces(data.interfaces || []))
      .catch(() => setWifiInterfaces([]));
  }, []);

  const fetchSSIDs = useCallback(() => {
    setSsidLoading(true);
    const params = settings.wifiInterface
      ? `?iface=${encodeURIComponent(settings.wifiInterface)}`
      : "";
    fetch(`/api/wifi-scan${params}`)
      .then((res) => res.json())
      .then((data) => setScannedSSIDs(data.ssids || []))
      .catch(() => setScannedSSIDs([]))
      .finally(() => setSsidLoading(false));
  }, [settings.wifiInterface]);

  useEffect(() => {
    fetchSSIDs();
  }, [fetchSSIDs]);

  const inputClass =
    "w-full border border-gray-200 rounded-sm p-1.5 text-sm focus:outline-none focus:ring focus:ring-blue-300 focus:border-blue-400";

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3 p-3 bg-gray-50 border border-gray-200 rounded-md mb-2">
      {/* WiFi Interface */}
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
            <option key={iface} value={iface}>
              {iface}
            </option>
          ))}
        </select>
      </div>

      {/* Target SSID */}
      <div className="flex flex-col gap-1">
        <Label className="text-xs font-semibold">
          Target SSID&nbsp;
          <PopoverHelper text="Measure a specific SSID without being connected to it (passive scanning). Leave empty to use the currently connected network." />
        </Label>
        <div className="flex gap-1">
          <select
            className={inputClass}
            value={settings.targetSSID || ""}
            onChange={(e) => updateSettings({ targetSSID: e.target.value })}
          >
            <option value="">Connected (auto)</option>
            {scannedSSIDs.map((s) => (
              <option key={`${s.ssid}-${s.bssid}`} value={s.ssid}>
                {s.ssid} ({s.rssi} dBm,{" "}
                {s.band === 5 ? "5G" : s.band === 6 ? "6G" : "2.4G"})
              </option>
            ))}
          </select>
          <button
            type="button"
            className="px-2 py-1 border border-gray-200 rounded-sm hover:bg-gray-100 focus:outline-none focus:ring focus:ring-blue-300 disabled:opacity-50 text-sm"
            onClick={fetchSSIDs}
            disabled={ssidLoading}
            title="Refresh SSID list"
          >
            {ssidLoading ? "..." : "↻"}
          </button>
        </div>
      </div>

      {/* iperf Server */}
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
          onChange={(e) =>
            updateSettings({ iperfServerAdrs: e.target.value.trim() })
          }
        />
      </div>

      {/* Test Duration */}
      <div className="flex flex-col gap-1">
        <Label className="text-xs font-semibold">
          Duration (s)&nbsp;
          <PopoverHelper text="Duration of the speed test (in seconds)." />
        </Label>
        <input
          type="number"
          className={inputClass}
          value={settings.testDuration}
          onChange={(e) =>
            updateSettings({ testDuration: Number(e.target.value.trim()) })
          }
        />
      </div>

      {/* sudo password */}
      <div className="flex flex-col gap-1">
        <Label className="text-xs font-semibold">
          sudo password&nbsp;
          <PopoverHelper text="Enter the sudo password: required on macOS or Linux." />
        </Label>
        <PasswordInput
          value={settings.sudoerPassword}
          onChange={(e) => updateSettings({ sudoerPassword: e })}
        />
      </div>
    </div>
  );
}
