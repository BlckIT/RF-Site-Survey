import * as Tabs from "@radix-ui/react-tabs";
import { useState } from "react";
import { useSettings } from "./GlobalSettings";

import FloorPlanSelector from "@/components/FloorPlanSelector";
import SurveySettingsBar from "@/components/SurveySettingsBar";
import ClickableFloorplan from "@/components/Floorplan";
import { Heatmaps } from "@/components/Heatmaps";
import PointsTable from "@/components/PointsTable";
import WallEditor from "@/components/WallEditor";

const tabTriggerClass =
  "px-4 py-2.5 text-base font-medium bg-gray-300 text-gray-800 border border-gray-400 border-b-0 rounded-t-md cursor-pointer transition-all duration-300 ease-in-out hover:bg-gray-200 data-[state=active]:bg-white data-[state=active]:text-black data-[state=active]:font-semibold data-[state=active]:border-gray-500";

export default function TabPanel() {
  const [activeTab, setActiveTab] = useState("site-setup");
  const { settings, surveyPointActions } = useSettings();

  return (
    <div className="w-full p-2">
      <Tabs.Root value={activeTab} onValueChange={setActiveTab}>
        <Tabs.List className="flex gap-2 pt-1">
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
