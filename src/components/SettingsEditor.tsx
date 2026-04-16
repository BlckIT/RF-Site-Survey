import { useSettings } from "@/components/GlobalSettings";
import { PasswordInput } from "./PasswordInput";
import { Label } from "@/components/ui/label";
import { PopoverHelper } from "@/components/PopoverHelpText";
import HeatmapAdvancedConfig from "./HeatmapAdvancedConfig";
import MediaDropdown from "./MediaDropdown";
import { sanitizeFilename } from "@/lib/utils";
import { useState, useEffect, useCallback } from "react";
import { WifiResults } from "@/lib/types";

export default function SettingsEditor() {
  const { settings, updateSettings, readNewSettingsFromFile } = useSettings();
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
    const params = settings.wifiInterface ? `?iface=${encodeURIComponent(settings.wifiInterface)}` : "";
    fetch(`/api/wifi-scan${params}`)
      .then((res) => res.json())
      .then((data) => setScannedSSIDs(data.ssids || []))
      .catch(() => setScannedSSIDs([]))
      .finally(() => setSsidLoading(false));
  }, [settings.wifiInterface]);

  useEffect(() => {
    fetchSSIDs();
  }, [fetchSSIDs]);

  /**
   * handleNewImageFile - given the name of a new image file,
   *    get the settings for that floor image
   * @param theFile - name of the new image file
   */
  function handleNewImageFile(theFile: string): void {
    readNewSettingsFromFile(theFile); // tell the parent about the new file
  }

  return (
    <table className="w-full max-w-4xl">
      <tbody>
        <tr>
          <td className="text-right pr-4">
            <Label htmlFor="Files" className="font-bold text-lg">
              Floor plan&nbsp;
              <PopoverHelper text="Choose a file to be used as a background image, or upload another PNG or JPEG file." />
            </Label>
          </td>
          <td className="max-w-[400px] p-0 m-0">
            <MediaDropdown
              defaultValue={settings.floorplanImageName}
              onChange={(val) => handleNewImageFile(val)}
            />
            {settings.floorplanImageName && (
              <p className="text-xs text-gray-500 mt-1">
                Data: data/surveys/
                {sanitizeFilename(settings.floorplanImageName)}.json
              </p>
            )}
          </td>
        </tr>

        <tr>
          <td className="text-right pr-4">
            <Label htmlFor="iperfServer" className="font-bold text-lg">
              iperfServer&nbsp;
              <PopoverHelper text="Address of an iperf3 server (e.g., 192.168.1.10 or 192.168.1.10:5201). Port 5201 is used by default. Set to 'localhost' to skip iperf tests." />
            </Label>{" "}
          </td>
          <td>
            <input
              type="text"
              placeholder="e.g., 192.168.1.10 or 192.168.1.10:5201"
              className="w-full border border-gray-200 rounded-sm p-2 focus:outline-none focus:ring focus:ring-blue-300 focus:border-blue-400"
              value={settings.iperfServerAdrs}
              onChange={(e) =>
                updateSettings({ iperfServerAdrs: e.target.value.trim() })
              }
            />
          </td>
        </tr>

        <tr>
          <td className="text-right pr-4">
            <Label htmlFor="testDuration" className="font-bold text-lg">
              Test Duration&nbsp;
              <PopoverHelper text="Duration of the speed test (in seconds)." />
            </Label>
          </td>
          <td>
            <input
              type="number"
              className="w-full border border-gray-200 rounded-sm p-2 focus:outline-none focus:ring focus:ring-blue-300 focus:border-blue-400"
              value={settings.testDuration}
              onChange={(e) =>
                updateSettings({ testDuration: Number(e.target.value.trim()) })
              }
            />
          </td>
        </tr>

        <tr>
          <td className="text-right pr-4">
            <Label htmlFor="wifiInterface" className="font-bold text-lg">
              WiFi Interface&nbsp;
              <PopoverHelper text="Select which WiFi interface to use for scanning. 'Auto' picks the first available." />
            </Label>
          </td>
          <td>
            <select
              className="w-full border border-gray-200 rounded-sm p-2 focus:outline-none focus:ring focus:ring-blue-300 focus:border-blue-400"
              value={settings.wifiInterface || ""}
              onChange={(e) =>
                updateSettings({ wifiInterface: e.target.value })
              }
            >
              <option value="">Auto (first available)</option>
              {wifiInterfaces.map((iface) => (
                <option key={iface} value={iface}>
                  {iface}
                </option>
              ))}
            </select>
          </td>
        </tr>

        <tr>
          <td className="text-right pr-4">
            <Label htmlFor="targetSSID" className="font-bold text-lg">
              Target SSID&nbsp;
              <PopoverHelper text="Measure a specific SSID without being connected to it (passive scanning). Leave empty to use the currently connected network." />
            </Label>
          </td>
          <td>
            <div className="flex gap-2">
              <select
                className="w-full border border-gray-200 rounded-sm p-2 focus:outline-none focus:ring focus:ring-blue-300 focus:border-blue-400"
                value={settings.targetSSID || ""}
                onChange={(e) => updateSettings({ targetSSID: e.target.value })}
              >
                <option value="">Connected network (auto)</option>
                {scannedSSIDs.map((s) => (
                  <option key={`${s.ssid}-${s.bssid}`} value={s.ssid}>
                    {s.ssid} ({s.rssi} dBm, {s.band === 5 ? "5 GHz" : s.band === 6 ? "6 GHz" : "2.4 GHz"})
                  </option>
                ))}
              </select>
              <button
                type="button"
                className="px-3 py-2 border border-gray-200 rounded-sm hover:bg-gray-100 focus:outline-none focus:ring focus:ring-blue-300 disabled:opacity-50"
                onClick={fetchSSIDs}
                disabled={ssidLoading}
                title="Refresh SSID list"
              >
                {ssidLoading ? "..." : "↻"}
              </button>
            </div>
          </td>
        </tr>

        <tr>
          <td className="text-right pr-4">
            <Label htmlFor="sudoPassword" className="font-bold text-lg">
              sudo password&nbsp;
              <PopoverHelper text="Enter the sudo password: required on macOS or Linux." />
            </Label>
          </td>
          <td>
            <PasswordInput
              value={settings.sudoerPassword}
              onChange={(e) => updateSettings({ sudoerPassword: e })}
            />
          </td>
        </tr>

        <tr>
          <td colSpan={2} className="text-right">
            <HeatmapAdvancedConfig />
          </td>
        </tr>
      </tbody>
    </table>
  );
}
