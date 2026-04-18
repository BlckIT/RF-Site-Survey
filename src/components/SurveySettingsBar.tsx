import { useSettings } from "@/components/GlobalSettings";
import { Label } from "@/components/ui/label";
import { PopoverHelper } from "@/components/PopoverHelpText";
import { useState, useEffect, useCallback } from "react";
import { WifiResults } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { groupNetworksBySSID } from "@/lib/groupNetworks";

/**
 * SurveySettingsBar — compact horizontal settings bar for the Survey tab.
 * Contains only per-measurement settings: Target SSID and Test Duration.
 * Set-and-forget settings (WiFi Interface, iperf server, sudo password) live in the Settings tab.
 */
export default function SurveySettingsBar() {
  const { settings, updateSettings } = useSettings();
  const [scannedSSIDs, setScannedSSIDs] = useState<WifiResults[]>([]);
  const [ssidLoading, setSsidLoading] = useState(false);

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

  const grouped = groupNetworksBySSID(scannedSSIDs);
  const selectedGrouped = grouped.find((n) => n.ssid === settings.targetSSID);

  const inputClass =
    "w-full border border-gray-200 rounded-sm p-1.5 text-sm focus:outline-none focus:ring focus:ring-blue-300 focus:border-blue-400";

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 p-3 bg-gray-50 border border-gray-200 rounded-md mb-4">
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
            {grouped.map((net) => (
              <option key={net.ssid} value={net.ssid}>
                {net.ssid} (
                {net.bands
                  .map((b) => (b === "2.4" ? "2.4 GHz" : "5 GHz"))
                  .join(" + ")}
                )
              </option>
            ))}
          </select>
          <Button
            variant="ghost"
            size="sm"
            type="button"
            onClick={fetchSSIDs}
            disabled={ssidLoading}
            title="Refresh SSID list"
          >
            {ssidLoading ? "..." : "↻"}
          </Button>
        </div>
        {selectedGrouped && (
          <div className="flex items-center gap-1 mt-1">
            {selectedGrouped.bands.map((b) => (
              <span
                key={b}
                className={
                  b === "2.4"
                    ? "bg-blue-100 text-blue-700 text-xs px-1.5 py-0.5 rounded"
                    : "bg-green-100 text-green-700 text-xs px-1.5 py-0.5 rounded"
                }
              >
                {b === "2.4" ? "2.4 GHz" : "5 GHz"}
              </span>
            ))}
          </div>
        )}
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
    </div>
  );
}
