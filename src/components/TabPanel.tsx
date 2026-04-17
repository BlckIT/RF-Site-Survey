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
import NetworkManager from "@/components/NetworkManager";
import { PasswordInput } from "@/components/PasswordInput";
import { Label } from "@/components/ui/label";
import { PopoverHelper } from "@/components/PopoverHelpText";
import { HeatmapSettings, WifiResults } from "@/lib/types";
import { rgbaToHex, hexToRgba } from "@/lib/utils-gradient";
import { Button } from "@/components/ui/button";
import { getDefaults } from "@/components/GlobalSettings";

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

  useEffect(() => {
    fetch("/api/wifi-interfaces")
      .then((res) => res.json())
      .then((data) => setWifiInterfaces(data.interfaces || []))
      .catch(() => setWifiInterfaces([]));
  }, []);

  const debouncedUpdate = useCallback(
    debounce((s: Partial<HeatmapSettings>) => updateSettings(s), 500),
    [updateSettings],
  );

  const sortedGradientEntries = () => {
    return Object.entries(settings.gradient).sort(([a], [b]) => {
      const numA = parseFloat(a);
      const numB = parseFloat(b);
      return isNaN(numA) || isNaN(numB) ? 0 : numA - numB;
    });
  };

  return (
    <div className="max-w-3xl space-y-6">
      {/* ── 1. Network ── */}
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
                <option key={iface} value={iface}>
                  {iface}
                </option>
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
      </section>

      {/* ── 2. iperf ── */}
      <section className="space-y-3">
        <h3 className={sectionHeaderClass}>
          iperf&nbsp;
          <PopoverHelper text="Customize the iperf3 commands. Placeholders: {server}, {port}, {duration}. See https://iperf.fr/iperf-doc.php for documentation." />
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
              onChange={(e) =>
                updateSettings({ iperfServerAdrs: e.target.value.trim() })
              }
            />
          </div>
        </div>
        <div className="space-y-3">
          <div className="flex flex-col gap-1">
            <Label className="text-xs font-semibold">TCP Download</Label>
            <input
              type="text"
              className={inputClass + " font-mono"}
              value={settings.iperfCommands?.tcpDownload || ""}
              onChange={(e) =>
                debouncedUpdate({
                  iperfCommands: {
                    ...settings.iperfCommands,
                    tcpDownload: e.target.value,
                  },
                })
              }
            />
          </div>
          <div className="flex flex-col gap-1">
            <Label className="text-xs font-semibold">TCP Upload</Label>
            <input
              type="text"
              className={inputClass + " font-mono"}
              value={settings.iperfCommands?.tcpUpload || ""}
              onChange={(e) =>
                debouncedUpdate({
                  iperfCommands: {
                    ...settings.iperfCommands,
                    tcpUpload: e.target.value,
                  },
                })
              }
            />
          </div>
          <div className="flex flex-col gap-1">
            <Label className="text-xs font-semibold">
              UDP Download&nbsp;
              <PopoverHelper text="The -b 100M bitrate is a safe default that works on most networks. If you consistently hit 100 Mbps on UDP tests, try increasing to -b 300M or higher for faster home networks." />
            </Label>
            <input
              type="text"
              className={inputClass + " font-mono"}
              value={settings.iperfCommands?.udpDownload || ""}
              onChange={(e) =>
                debouncedUpdate({
                  iperfCommands: {
                    ...settings.iperfCommands,
                    udpDownload: e.target.value,
                  },
                })
              }
            />
          </div>
          <div className="flex flex-col gap-1">
            <Label className="text-xs font-semibold">
              UDP Upload&nbsp;
              <PopoverHelper text="The -b 100M bitrate is a safe default that works on most networks. If you consistently hit 100 Mbps on UDP tests, try increasing to -b 300M or higher for faster home networks." />
            </Label>
            <input
              type="text"
              className={inputClass + " font-mono"}
              value={settings.iperfCommands?.udpUpload || ""}
              onChange={(e) =>
                debouncedUpdate({
                  iperfCommands: {
                    ...settings.iperfCommands,
                    udpUpload: e.target.value,
                  },
                })
              }
            />
          </div>
        </div>
      </section>

      {/* ── 3. Heatmap ── */}
      <section className="space-y-3">
        <h3 className={sectionHeaderClass}>Heatmap</h3>
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
              onChange={(e) =>
                debouncedUpdate({ minOpacity: parseFloat(e.target.value) })
              }
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
              onChange={(e) =>
                debouncedUpdate({ maxOpacity: parseFloat(e.target.value) })
              }
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
              onChange={(e) =>
                debouncedUpdate({ blur: parseFloat(e.target.value) })
              }
            />
          </div>
        </div>
      </section>

      {/* ── 4. Gradient ── */}
      <section className="space-y-3">
        <h3 className={sectionHeaderClass}>
          Gradient&nbsp;
          <PopoverHelper text="Define the color gradient for the heatmap. Each key represents a point in the gradient (0 to 1), and the value is the color." />
        </h3>
        <div>
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
                    const newGradient = {
                      ...settings.gradient,
                      [key]: newColor,
                    };
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
                    const newGradient = {
                      ...settings.gradient,
                      [key]: newColor,
                    };
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
              const newGradient = {
                ...settings.gradient,
                [0.5]: "rgba(0, 0, 0, 1)",
              };
              debouncedUpdate({ gradient: newGradient });
            }}
            className="mt-3"
          >
            + Add Color Stop
          </Button>
        </div>
      </section>

      {/* ── 5. Wall Editor ── */}
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
              onChange={(e) =>
                updateSettings({ snapRadius: Math.max(2, Math.min(30, parseInt(e.target.value) || 8)) })
              }
              className={inputClass}
            />
          </div>
        </div>
      </section>

      {/* ── 6. Network Management ── */}
      <section className="space-y-3">
        <h3 className={sectionHeaderClass}>Network Management</h3>
        <div className="border border-gray-200 rounded-sm p-4">
          <NetworkManager />
        </div>
      </section>

      {/* ── 7. AP Mapping ── */}
      <section className="space-y-3">
        <h3 className={sectionHeaderClass}>AP Mapping</h3>
        <div className="border border-gray-200 rounded-sm p-4">
          <EditableApMapping
            apMapping={settings.apMapping}
            onSave={(apMapping) => updateSettings({ apMapping })}
          />
        </div>
      </section>

      {/* ── Reset to Defaults ── */}
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
