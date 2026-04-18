import React, {
  useRef,
  useState,
  useEffect,
  useCallback,
  ReactNode,
} from "react";
import { useSettings } from "./GlobalSettings";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PopoverHelper } from "@/components/PopoverHelpText";

type CalibrationPoint = { x: number; y: number };

/**
 * ScaleCalibration — two-point scale tool.
 * User clicks two points on the floor plan and enters the real-world distance.
 * Computes pixelsPerMeter and saves it to the active floor.
 */
export default function ScaleCalibration(): ReactNode {
  const { settings, updateActiveFloor } = useSettings();

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);
  const [imageLoaded, setImageLoaded] = useState(false);
  const [scale, setScale] = useState(1);

  const [point1, setPoint1] = useState<CalibrationPoint | null>(null);
  const [point2, setPoint2] = useState<CalibrationPoint | null>(null);
  const [distanceMeters, setDistanceMeters] = useState("");
  const [mousePos, setMousePos] = useState<CalibrationPoint | null>(null);

  const pixelsPerMeter = settings.pixelsPerMeter;
  const hasCalibration = pixelsPerMeter > 0 && pixelsPerMeter !== 10; // 10 is default/uncalibrated

  // Load floor plan image
  useEffect(() => {
    if (settings.floorplanImagePath) {
      setImageLoaded(false);
      const img = new Image();
      img.src = settings.floorplanImagePath;
      img.onload = () => {
        imageRef.current = img;
        setImageLoaded(true);
      };
      img.onerror = () => {
        setImageLoaded(false);
      };
      return () => {
        img.onload = null;
        img.onerror = null;
      };
    } else {
      setImageLoaded(false);
    }
  }, [settings.floorplanImagePath]);

  // Beräkna skalning
  useEffect(() => {
    if (imageLoaded && canvasRef.current && containerRef.current) {
      const containerWidth = containerRef.current.clientWidth;
      const scaleX = containerWidth / settings.dimensions.width;
      const scaledHeight = settings.dimensions.height * scaleX;
      const maxH = window.innerHeight - 200;
      if (scaledHeight > maxH) {
        const constrainedScale = maxH / settings.dimensions.height;
        setScale(constrainedScale);
        canvasRef.current.style.width = `${settings.dimensions.width * constrainedScale}px`;
        canvasRef.current.style.height = `${maxH}px`;
      } else {
        setScale(scaleX);
        canvasRef.current.style.width = "100%";
        canvasRef.current.style.height = "auto";
      }
    }
  }, [imageLoaded, settings.dimensions]);

  const getCanvasCoords = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = e.currentTarget;
    const rect = canvas.getBoundingClientRect();
    return {
      x: (e.clientX - rect.left) / scale,
      y: (e.clientY - rect.top) / scale,
    };
  };

  // Pixel distance between the two calibration points
  const pixelDistance =
    point1 && point2 ? Math.hypot(point2.x - point1.x, point2.y - point1.y) : 0;

  const canApply =
    point1 && point2 && pixelDistance > 1 && parseFloat(distanceMeters) > 0;

  const applyCalibration = () => {
    if (!canApply) return;
    const meters = parseFloat(distanceMeters);
    const ppm = pixelDistance / meters;
    updateActiveFloor({ pixelsPerMeter: Math.round(ppm * 100) / 100 });
    // Reset state
    setPoint1(null);
    setPoint2(null);
    setDistanceMeters("");
  };

  const resetCalibration = () => {
    setPoint1(null);
    setPoint2(null);
    setDistanceMeters("");
  };

  const clearCalibration = () => {
    updateActiveFloor({ pixelsPerMeter: 10 });
    resetCalibration();
  };

  // Draw canvas
  const drawCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx || !imageRef.current) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(imageRef.current, 0, 0);

    // Draw existing walls faintly for reference
    for (const wall of settings.walls) {
      ctx.beginPath();
      ctx.moveTo(wall.x1, wall.y1);
      ctx.lineTo(wall.x2, wall.y2);
      ctx.strokeStyle = "rgba(128, 128, 128, 0.3)";
      ctx.lineWidth = 2;
      ctx.stroke();
    }

    const drawMarker = (p: CalibrationPoint, color: string, label: string) => {
      const r = 6;
      // Crosshair
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(p.x - r * 2, p.y);
      ctx.lineTo(p.x + r * 2, p.y);
      ctx.moveTo(p.x, p.y - r * 2);
      ctx.lineTo(p.x, p.y + r * 2);
      ctx.stroke();
      // Circle
      ctx.beginPath();
      ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.fill();
      ctx.strokeStyle = "#fff";
      ctx.lineWidth = 1.5;
      ctx.stroke();
      // Label
      ctx.font = "bold 14px Arial";
      ctx.fillStyle = color;
      ctx.textAlign = "left";
      ctx.textBaseline = "bottom";
      ctx.fillText(label, p.x + r + 4, p.y - 4);
    };

    // Draw calibration line
    if (point1) {
      drawMarker(point1, "#ef4444", "A");

      const endPoint = point2 || mousePos;
      if (endPoint) {
        // Dashed line between points
        ctx.setLineDash([8, 4]);
        ctx.strokeStyle = "#3b82f6";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(point1.x, point1.y);
        ctx.lineTo(endPoint.x, endPoint.y);
        ctx.stroke();
        ctx.setLineDash([]);

        // Distance label at midpoint
        const midX = (point1.x + endPoint.x) / 2;
        const midY = (point1.y + endPoint.y) / 2;
        const dist = Math.hypot(endPoint.x - point1.x, endPoint.y - point1.y);
        const label = point2
          ? `${dist.toFixed(0)} px`
          : `${dist.toFixed(0)} px`;
        ctx.font = "12px Arial";
        ctx.fillStyle = "rgba(255, 255, 255, 0.85)";
        const textWidth = ctx.measureText(label).width;
        ctx.fillRect(midX - textWidth / 2 - 4, midY - 8, textWidth + 8, 18);
        ctx.fillStyle = "#1f2937";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(label, midX, midY);
      }
    }

    if (point2) {
      drawMarker(point2, "#3b82f6", "B");
    }
  }, [settings.walls, settings.dimensions, point1, point2, mousePos]);

  useEffect(() => {
    if (imageLoaded) drawCanvas();
  }, [imageLoaded, drawCanvas]);

  const handleClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (e.button !== 0) return;
    const pos = getCanvasCoords(e);

    if (!point1) {
      setPoint1(pos);
    } else if (!point2) {
      setPoint2(pos);
    } else {
      // Reset and start over
      setPoint1(pos);
      setPoint2(null);
      setDistanceMeters("");
    }
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (point1 && !point2) {
      setMousePos(getCanvasCoords(e));
    }
  };

  if (!settings.floorplanImagePath) {
    return (
      <div className="text-sm text-gray-500 italic">
        Select a floor plan image first.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        <h3 className="text-sm font-semibold text-gray-700">
          Scale Calibration
        </h3>
        {hasCalibration && (
          <span className="text-xs text-green-600 font-medium">
            ✓ {pixelsPerMeter.toFixed(1)} px/m
          </span>
        )}
      </div>

      <p className="text-xs text-gray-500">
        Click two points on a known distance (e.g. a door opening, corridor
        length), then enter the real-world distance in meters.
      </p>

      {/* Status and input */}
      <div className="flex items-end gap-3 flex-wrap">
        <div className="flex flex-col gap-1">
          <Label className="text-xs font-semibold">Point A&nbsp;</Label>
          <div className="text-xs text-gray-600 min-w-[80px]">
            {point1
              ? `(${point1.x.toFixed(0)}, ${point1.y.toFixed(0)})`
              : "Click on floor plan"}
          </div>
        </div>

        <div className="flex flex-col gap-1">
          <Label className="text-xs font-semibold">Point B&nbsp;</Label>
          <div className="text-xs text-gray-600 min-w-[80px]">
            {point2
              ? `(${point2.x.toFixed(0)}, ${point2.y.toFixed(0)})`
              : point1
                ? "Click second point"
                : "—"}
          </div>
        </div>

        {point1 && point2 && (
          <>
            <div className="flex flex-col gap-1">
              <Label className="text-xs font-semibold">Pixel distance</Label>
              <div className="text-xs text-gray-600">
                {pixelDistance.toFixed(1)} px
              </div>
            </div>

            <div className="flex flex-col gap-1">
              <Label className="text-xs font-semibold">
                Real distance (m)&nbsp;
                <PopoverHelper text="Enter the real-world distance between the two points in meters." />
              </Label>
              <Input
                type="number"
                step="0.01"
                min="0.01"
                className="w-24 h-7 text-xs"
                value={distanceMeters}
                onChange={(e) => setDistanceMeters(e.target.value)}
                placeholder="e.g. 3.5"
                autoFocus
              />
            </div>

            <Button size="sm" disabled={!canApply} onClick={applyCalibration}>
              Apply
            </Button>
          </>
        )}

        <Button variant="ghost" size="sm" onClick={resetCalibration}>
          Reset points
        </Button>

        {hasCalibration && (
          <Button
            variant="ghost"
            size="sm"
            className="text-red-500"
            onClick={clearCalibration}
          >
            Clear calibration
          </Button>
        )}
      </div>

      {/* Canvas */}
      <div
        className="relative max-h-[calc(100vh-200px)] overflow-hidden flex items-center justify-center"
        ref={containerRef}
      >
        <div>
          <canvas
            ref={canvasRef}
            width={settings.dimensions.width}
            height={settings.dimensions.height}
            onClick={handleClick}
            onMouseMove={handleMouseMove}
            className="border border-gray-200 rounded-sm cursor-crosshair w-full h-auto max-h-[calc(100vh-200px)] object-contain"
          />
        </div>
      </div>
    </div>
  );
}
