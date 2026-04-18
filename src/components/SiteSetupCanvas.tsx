import { useState } from "react";
import { useSettings } from "./GlobalSettings";
import ScaleCalibration from "./ScaleCalibration";
import WallEditor from "./WallEditor";
import { Button } from "@/components/ui/button";
import { Ruler, Layers, Eye, Check } from "lucide-react";

type SetupTool = "scale" | "walls" | "preview";

/** Verktygsväljare + en gemensam vy för Site Setup-fliken */
export default function SiteSetupCanvas() {
  const { settings } = useSettings();
  const [activeTool, setActiveTool] = useState<SetupTool>("scale");

  const hasCalibration =
    settings.pixelsPerMeter > 0 && settings.pixelsPerMeter !== 10;
  const hasWalls = settings.walls.length > 0;

  if (!settings.floorplanImagePath) {
    return (
      <div className="text-sm text-gray-500 italic mt-4">
        Upload a floor plan image to get started.
      </div>
    );
  }

  const tools: {
    id: SetupTool;
    label: string;
    icon: React.ReactNode;
    done: boolean;
  }[] = [
    {
      id: "scale",
      label: "Scale",
      icon: <Ruler className="w-4 h-4" />,
      done: hasCalibration,
    },
    {
      id: "walls",
      label: "Walls",
      icon: <Layers className="w-4 h-4" />,
      done: hasWalls,
    },
    {
      id: "preview",
      label: "Preview",
      icon: <Eye className="w-4 h-4" />,
      done: false,
    },
  ];

  return (
    <div className="mt-4">
      {/* Toolbar */}
      <div className="flex items-center gap-1 mb-3">
        {tools.map((tool) => (
          <Button
            key={tool.id}
            variant={activeTool === tool.id ? "default" : "outline"}
            size="sm"
            onClick={() => setActiveTool(tool.id)}
            className="relative gap-1.5"
          >
            {tool.icon}
            {tool.label}
            {tool.done && <Check className="w-3 h-3 text-green-500 ml-0.5" />}
          </Button>
        ))}
      </div>

      {/* Aktivt verktyg */}
      {activeTool === "scale" && <ScaleCalibration />}
      {activeTool === "walls" && <WallEditor />}
      {activeTool === "preview" && <PreviewPane />}
    </div>
  );
}

/** Enkel förhandsvisning av planritningen utan verktyg */
function PreviewPane() {
  const { settings } = useSettings();

  const hasCalibration =
    settings.pixelsPerMeter > 0 && settings.pixelsPerMeter !== 10;

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-3 text-xs text-gray-500">
        {hasCalibration && (
          <span>Scale: {settings.pixelsPerMeter.toFixed(1)} px/m</span>
        )}
        <span>Walls: {settings.walls.length}</span>
        <span>
          Image: {settings.dimensions.width} × {settings.dimensions.height} px
        </span>
      </div>
      <div className="relative max-h-[calc(100vh-200px)] overflow-hidden">
        <img
          key={settings.floorplanImagePath}
          src={settings.floorplanImagePath}
          alt="Floor plan preview"
          className="border border-gray-200 rounded-sm w-full h-auto max-h-[calc(100vh-200px)] object-contain"
        />
      </div>
    </div>
  );
}
