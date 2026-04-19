import { useSettings } from "@/components/GlobalSettings";
import { Label } from "@/components/ui/label";
import { PopoverHelper } from "@/components/PopoverHelpText";
import { useState, useEffect, useCallback } from "react";
import { WifiResults } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { groupNetworksBySSID } from "@/lib/groupNetworks";
import SSIDDropdown from "@/components/SSIDDropdown";

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

  return (
    <div className="flex items-end gap-2 p-2 bg-gray-50 border border-gray-200 rounded-md mb-2">
      {/* Target SSID */}
      <div className="flex flex-col gap-1 flex-1 min-w-0">
        <Label className="text-xs font-semibold">
          Target SSID&nbsp;
          <PopoverHelper text="Measure a specific SSID without being connected to it (passive scanning). Leave empty to use the currently connected network." />
        </Label>
        <div className="flex gap-1">
          <SSIDDropdown
            value={settings.targetSSID || ""}
            onChange={(ssid) => updateSettings({ targetSSID: ssid })}
            networks={grouped}
          />
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
      </div>

      {/* Test Duration */}
      <div className="flex flex-col gap-1 w-32 shrink-0">
        <Label className="text-xs font-semibold">
          Duration (s)&nbsp;
          <PopoverHelper text="Duration of the speed test (in seconds)." />
        </Label>
        <Input
          type="number"
          value={settings.testDuration}
          onChange={(e) =>
            updateSettings({ testDuration: Number(e.target.value.trim()) })
          }
        />
      </div>
    </div>
  );
}
