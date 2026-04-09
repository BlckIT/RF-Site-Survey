import React, { useRef, useState, useEffect, ReactNode } from "react";
import { useSettings } from "./GlobalSettings";
import { Wall } from "@/lib/types";

/**
 * WallEditor — Canvas-editor för att rita väggar på planritningen.
 * Klicka för att sätta startpunkt, klicka igen för slutpunkt.
 * Högerklicka på en vägg för att ta bort den.
 */
export default function WallEditor(): ReactNode {
  const { settings, updateSettings } = useSettings();

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);
  const [imageLoaded, setImageLoaded] = useState(false);
  const [scale, setScale] = useState(1);
  const [drawStart, setDrawStart] = useState<{ x: number; y: number } | null>(
    null,
  );
  const [mousePos, setMousePos] = useState<{ x: number; y: number } | null>(
    null,
  );

  // Ladda planritningen
  useEffect(() => {
    if (settings.floorplanImagePath) {
      const img = new Image();
      img.src = settings.floorplanImagePath;
      img.onload = () => {
        imageRef.current = img;
        setImageLoaded(true);
      };
    }
  }, [settings.floorplanImagePath]);

  // Rita canvas när bild eller väggar ändras
  useEffect(() => {
    if (imageLoaded && canvasRef.current) {
      const canvas = canvasRef.current;
      const containerWidth = containerRef.current?.clientWidth || canvas.width;
      const scaleX = containerWidth / settings.dimensions.width;
      setScale(scaleX);
      canvas.style.width = "100%";
      canvas.style.height = "auto";
      drawCanvas();
    }
  }, [imageLoaded, settings.dimensions, settings.walls, drawStart, mousePos]);

  const drawCanvas = () => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx || !imageRef.current) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(imageRef.current, 0, 0);

    // Rita befintliga väggar
    for (const wall of settings.walls) {
      drawWall(ctx, wall.x1, wall.y1, wall.x2, wall.y2, "#dc2626", 3);
    }

    // Rita pågående vägg (förhandsvisning)
    if (drawStart && mousePos) {
      drawWall(
        ctx,
        drawStart.x,
        drawStart.y,
        mousePos.x,
        mousePos.y,
        "#f97316",
        2,
      );
    }

    // Rita startpunkt om aktiv
    if (drawStart) {
      ctx.beginPath();
      ctx.arc(drawStart.x, drawStart.y, 5, 0, Math.PI * 2);
      ctx.fillStyle = "#f97316";
      ctx.fill();
      ctx.strokeStyle = "#000";
      ctx.lineWidth = 1;
      ctx.stroke();
    }
  };

  const drawWall = (
    ctx: CanvasRenderingContext2D,
    x1: number,
    y1: number,
    x2: number,
    y2: number,
    color: string,
    width: number,
  ) => {
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.lineCap = "round";
    ctx.stroke();

    // Ändpunkter
    const r = width;
    for (const [px, py] of [
      [x1, y1],
      [x2, y2],
    ]) {
      ctx.beginPath();
      ctx.arc(px, py, r, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.fill();
    }
  };

  const getCanvasCoords = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = e.currentTarget;
    const rect = canvas.getBoundingClientRect();
    return {
      x: (e.clientX - rect.left) / scale,
      y: (e.clientY - rect.top) / scale,
    };
  };

  const handleClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (e.button !== 0) return; // Bara vänsterklick
    const { x, y } = getCanvasCoords(e);

    if (!drawStart) {
      setDrawStart({ x, y });
    } else {
      // Skapa ny vägg
      const newWall: Wall = {
        id: `wall_${Date.now()}`,
        x1: drawStart.x,
        y1: drawStart.y,
        x2: x,
        y2: y,
      };
      updateSettings({ walls: [...settings.walls, newWall] });
      setDrawStart(null);
      setMousePos(null);
    }
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (drawStart) {
      setMousePos(getCanvasCoords(e));
    }
  };

  const handleContextMenu = (e: React.MouseEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const { x, y } = getCanvasCoords(e);

    // Hitta närmaste vägg inom 10px
    const threshold = 10;
    let closestIdx = -1;
    let closestDist = Infinity;

    settings.walls.forEach((wall, idx) => {
      const dist = pointToSegmentDist(x, y, wall.x1, wall.y1, wall.x2, wall.y2);
      if (dist < closestDist) {
        closestDist = dist;
        closestIdx = idx;
      }
    });

    if (closestDist < threshold && closestIdx >= 0) {
      const newWalls = settings.walls.filter((_, i) => i !== closestIdx);
      updateSettings({ walls: newWalls });
    }

    // Avbryt pågående ritning vid högerklick
    if (drawStart) {
      setDrawStart(null);
      setMousePos(null);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape" && drawStart) {
      setDrawStart(null);
      setMousePos(null);
    }
  };

  const clearAllWalls = () => {
    updateSettings({ walls: [] });
    setDrawStart(null);
    setMousePos(null);
  };

  return (
    <div className="bg-white p-6 rounded-lg shadow-md">
      <h2 className="text-2xl font-semibold text-gray-800 mb-2">Walls</h2>
      <div className="p-2 rounded-md text-sm mb-2">
        <p>Klicka för att sätta startpunkt, klicka igen för slutpunkt.</p>
        <p>Högerklicka på en vägg för att ta bort den. Escape avbryter.</p>
        <p className="mt-1 text-gray-500">
          Antal väggar: {settings.walls.length}
          {drawStart && " — Ritar vägg..."}
        </p>
      </div>
      {settings.walls.length > 0 && (
        <button
          className="mb-2 px-3 py-1 bg-red-500 text-white text-sm rounded hover:bg-red-600"
          onClick={clearAllWalls}
        >
          Ta bort alla väggar
        </button>
      )}
      <div
        className="relative"
        ref={containerRef}
        onKeyDown={handleKeyDown}
        tabIndex={0}
      >
        <canvas
          ref={canvasRef}
          width={settings.dimensions.width}
          height={settings.dimensions.height}
          onClick={handleClick}
          onMouseMove={handleMouseMove}
          onContextMenu={handleContextMenu}
          className="border border-gray-300 rounded-lg cursor-crosshair"
        />
      </div>
    </div>
  );
}

/**
 * Beräkna avstånd från punkt (px,py) till linjesegment (x1,y1)-(x2,y2)
 */
function pointToSegmentDist(
  px: number,
  py: number,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
): number {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return Math.hypot(px - x1, py - y1);

  let t = ((px - x1) * dx + (py - y1) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));

  const projX = x1 + t * dx;
  const projY = y1 + t * dy;
  return Math.hypot(px - projX, py - projY);
}
