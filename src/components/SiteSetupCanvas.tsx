import { useState } from "react";
import { useSettings } from "./GlobalSettings";
import ScaleCalibration from "./ScaleCalibration";
import WallEditor from "./WallEditor";
import { Button } from "@/components/ui/button";
import { Ruler, Layers, Check, RotateCw } from "lucide-react";
import * as SliderPrimitive from "@radix-ui/react-slider";

type SetupTool = "scale" | "walls" | "rotate";

/** Verktygsväljare + en gemensam vy för Site Setup-fliken */
export default function SiteSetupCanvas() {
  const { settings } = useSettings();
  const [activeTool, setActiveTool] = useState<SetupTool>("scale");

  const hasCalibration =
    settings.pixelsPerMeter > 0 && settings.pixelsPerMeter !== 10;
  const hasWalls = settings.walls.length > 0;
  const hasRotation = (settings.rotation ?? 0) !== 0;

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
      id: "rotate",
      label: "Rotate",
      icon: <RotateCw className="w-4 h-4" />,
      done: hasRotation,
    },
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
      {activeTool === "rotate" && <RotateFloorPlan />}
    </div>
  );
}

/** Rotera planritningen med slider (0°–360°) */
function RotateFloorPlan() {
  const { settings, updateSettings } = useSettings();
  const currentRotation = settings.rotation ?? 0;

  const setRotation = (deg: number) => {
    updateSettings({ rotation: deg });
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <SliderPrimitive.Root
          className="relative flex items-center h-3 select-none touch-none w-64"
          min={0}
          max={360}
          step={1}
          value={[currentRotation]}
          onValueChange={(val) => setRotation(val[0])}
        >
          <SliderPrimitive.Track className="relative grow rounded-full h-2 bg-gray-200">
            <SliderPrimitive.Range className="absolute bg-blue-500 rounded-full h-full" />
          </SliderPrimitive.Track>
          <SliderPrimitive.Thumb
            className="block w-5 h-5 bg-white border border-gray-300 rounded-full shadow hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
            aria-label="Floor plan rotation in degrees"
          />
        </SliderPrimitive.Root>
        <span className="text-sm text-gray-600 tabular-nums w-10 text-right">
          {currentRotation}°
        </span>
        {currentRotation !== 0 && (
          <Button variant="outline" size="sm" onClick={() => setRotation(0)}>
            Reset
          </Button>
        )}
      </div>
      <div className="relative max-h-[calc(100vh-280px)] overflow-hidden flex items-center justify-center bg-gray-50 rounded border border-gray-200">
        <img
          key={settings.floorplanImagePath}
          src={settings.floorplanImagePath}
          alt="Floor plan preview"
          className="max-w-full max-h-[calc(100vh-280px)] object-contain transition-transform duration-300"
          style={{ transform: `rotate(${currentRotation}deg)` }}
        />
      </div>
    </div>
  );
}
