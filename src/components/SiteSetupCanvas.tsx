import { useState } from "react";
import { useSettings } from "./GlobalSettings";
import ScaleCalibration from "./ScaleCalibration";
import WallEditor from "./WallEditor";
import { Button } from "@/components/ui/button";
import { Ruler, Layers, Check, RotateCw } from "lucide-react";
import * as SliderPrimitive from "@radix-ui/react-slider";
import { rotateImage, rotatePoint, getRotationOffset } from "@/lib/rotateImage";

type SetupTool = "scale" | "walls" | "rotate";

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
      id: "rotate",
      label: "Rotate",
      icon: <RotateCw className="w-4 h-4" />,
      done: false,
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

/**
 * Rotera planritningen med slider (-15° till +15°, steg 0.5°).
 * CSS-preview medan man drar, Apply-knapp som faktiskt roterar bilden
 * och transformerar befintliga väggkoordinater.
 */
function RotateFloorPlan() {
  const { settings, updateSettings } = useSettings();
  const [previewAngle, setPreviewAngle] = useState(0);
  const [applying, setApplying] = useState(false);

  const handleApply = async () => {
    if (previewAngle === 0) return;
    setApplying(true);
    try {
      // Rotera bilden via offscreen canvas
      const result = await rotateImage(
        settings.floorplanImagePath,
        previewAngle,
      );

      // Ladda upp den roterade bilden
      const formData = new FormData();
      const filename =
        settings.floorplanImagePath.split("/").pop() || "floor.png";
      const rotatedName = filename.replace(/(\.\w+)$/, `-rotated$1`);
      formData.append("file", result.blob, rotatedName);

      const res = await fetch("/api/media", { method: "POST", body: formData });
      if (!res.ok) throw new Error("Upload failed");

      // Transformera befintliga väggkoordinater
      const oldW = settings.dimensions.width;
      const oldH = settings.dimensions.height;
      const cx = oldW / 2;
      const cy = oldH / 2;
      const offset = getRotationOffset(oldW, oldH, result.width, result.height);

      const transformedWalls = settings.walls.map((wall) => {
        const p1 = rotatePoint(wall.x1, wall.y1, previewAngle, cx, cy);
        const p2 = rotatePoint(wall.x2, wall.y2, previewAngle, cx, cy);
        return {
          ...wall,
          x1: p1.x + offset.dx,
          y1: p1.y + offset.dy,
          x2: p2.x + offset.dx,
          y2: p2.y + offset.dy,
        };
      });

      // Uppdatera settings med ny bild, dimensioner och transformerade väggar
      updateSettings({
        floorplanImagePath: `/media/${rotatedName}`,
        dimensions: { width: result.width, height: result.height },
        walls: transformedWalls,
        rotation: 0,
      });

      setPreviewAngle(0);
    } catch (err) {
      console.error("Rotation failed:", err);
    } finally {
      setApplying(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <SliderPrimitive.Root
          className="relative flex items-center h-3 select-none touch-none w-64"
          min={-15}
          max={15}
          step={0.5}
          value={[previewAngle]}
          onValueChange={(val) => setPreviewAngle(val[0])}
          disabled={applying}
        >
          <SliderPrimitive.Track className="relative grow rounded-full h-2 bg-gray-200">
            <SliderPrimitive.Range className="absolute bg-blue-500 rounded-full h-full" />
          </SliderPrimitive.Track>
          <SliderPrimitive.Thumb
            className="block w-5 h-5 bg-white border border-gray-300 rounded-full shadow hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
            aria-label="Floor plan rotation in degrees"
          />
        </SliderPrimitive.Root>
        <span className="text-sm text-gray-600 tabular-nums w-14 text-right">
          {previewAngle.toFixed(1)}°
        </span>
        {previewAngle !== 0 && (
          <>
            <Button
              variant="default"
              size="sm"
              onClick={handleApply}
              disabled={applying}
            >
              {applying ? "Applying..." : "Apply"}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPreviewAngle(0)}
              disabled={applying}
            >
              Reset
            </Button>
          </>
        )}
      </div>
      {previewAngle !== 0 && (
        <p className="text-xs text-amber-600">
          Drag the slider to preview. Click Apply to permanently rotate the
          image and adjust wall coordinates.
        </p>
      )}
      <div className="relative max-h-[calc(100vh-280px)] overflow-hidden flex items-center justify-center bg-gray-50 rounded border border-gray-200">
        <img
          key={settings.floorplanImagePath}
          src={settings.floorplanImagePath}
          alt="Floor plan preview"
          className="max-w-full max-h-[calc(100vh-280px)] object-contain transition-transform duration-300"
          style={{ transform: `rotate(${previewAngle}deg)` }}
        />
      </div>
    </div>
  );
}
