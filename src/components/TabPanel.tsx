import * as Tabs from "@radix-ui/react-tabs";
import { useState } from "react";
import { useSettings } from "./GlobalSettings";

import FloorPlanSelector from "@/components/FloorPlanSelector";
import SurveySettingsBar from "@/components/SurveySettingsBar";
import ClickableFloorplan from "@/components/Floorplan";
import { Heatmaps } from "@/components/Heatmaps";
import PointsTable from "@/components/PointsTable";
import WallEditor from "@/components/WallEditor";
import HeatmapAdvancedConfig from "@/components/HeatmapAdvancedConfig";
import EditableApMapping from "@/components/ApMapping";

const tabTriggerClass =
  "px-4 py-2.5 text-base font-medium bg-gray-300 text-gray-800 border border-gray-400 border-b-0 rounded-t-md cursor-pointer transition-all duration-300 ease-in-out hover:bg-gray-200 data-[state=active]:bg-white data-[state=active]:text-black data-[state=active]:font-semibold data-[state=active]:border-gray-500";

const settingsTriggerClass =
  "flex items-center justify-center w-10 h-10 rounded-md border border-gray-400 bg-gray-200 text-gray-600 cursor-pointer transition-all duration-300 ease-in-out hover:bg-gray-100 hover:text-gray-800 data-[state=active]:bg-white data-[state=active]:text-black data-[state=active]:border-gray-500";

export default function TabPanel() {
  const [activeTab, setActiveTab] = useState("site-setup");
  const { settings, updateSettings, surveyPointActions } = useSettings();

  return (
    <div className="w-full p-2">
      <Tabs.Root value={activeTab} onValueChange={setActiveTab}>
        <Tabs.List className="flex items-end gap-2 pt-1">
          <Tabs.Trigger
            value="settings"
            data-radix-collection-item
            className={settingsTriggerClass}
            title="Advanced Settings"
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

          <div className="w-px h-8 bg-gray-300 mx-1 self-center" />

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
        </Tabs.List>

        {/* Settings tab — advanced configuration */}
        <Tabs.Content value="settings" className="p-4">
          <div className="max-w-3xl space-y-6">
            <HeatmapAdvancedConfig />
            <div className="border border-gray-200 rounded-md p-4">
              <EditableApMapping
                apMapping={settings.apMapping}
                onSave={(apMapping) => updateSettings({ apMapping })}
              />
            </div>
          </div>
        </Tabs.Content>

        {/* Tab 1: Site Setup — floor plan selector + wall editor */}
        <Tabs.Content value="site-setup" className="p-4">
          <div className="mb-4">
            <FloorPlanSelector />
          </div>
          <WallEditor />
        </Tabs.Content>

        {/* Tab 2: Survey — compact settings bar, floor plan + sidebar */}
        <Tabs.Content value="survey" className="p-4">
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

        {/* Tab 3: Report — heatmaps */}
        <Tabs.Content value="report" className="p-4">
          <Heatmaps />
        </Tabs.Content>
      </Tabs.Root>
    </div>
  );
}
