import React, {
  useRef,
  useState,
  useEffect,
  useCallback,
  ReactNode,
} from "react";
import { useSettings } from "./GlobalSettings";
import { Wall } from "@/lib/types";

/**
 * WallEditor — Canvas editor for drawing walls on the floor plan.
 *
 * Features:
 * - Chain-drawing: click to place points, each segment becomes a wall.
 *   Double-click or Escape to end the chain.
 * - Shift-snap: hold Shift to snap to horizontal or vertical alignment
 *   relative to the previous point.
 * - Drag-to-adjust: click and drag an existing wall endpoint to reposition it.
 * - Right-click a wall to delete it. Right-click during drawing to cancel.
 */

const POINT_HIT_RADIUS = 8; // px radius for detecting endpoint clicks

export default function WallEditor(): ReactNode {
  const { settings, updateSettings } = useSettings();

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);
  const [imageLoaded, setImageLoaded] = useState(false);
  const [scale, setScale] = useState(1);

  // Chain-drawing state
  const [chainPoints, setChainPoints] = useState<{ x: number; y: number }[]>(
    [],
  );
  const [mousePos, setMousePos] = useState<{ x: number; y: number } | null>(
    null,
  );
  const [shiftHeld, setShiftHeld] = useState(false);

  // Drag-to-adjust state
  const [dragging, setDragging] = useState<{
    wallId: string;
    endpoint: "start" | "end";
  } | null>(null);

  const isDrawing = chainPoints.length > 0;

  // Load floor plan image
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

  // Track shift key globally
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Shift") setShiftHeld(true);
      if (e.key === "Escape") {
        setChainPoints([]);
        setMousePos(null);
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.key === "Shift") setShiftHeld(false);
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, []);

  // Compute scale when image loads or dimensions change
  useEffect(() => {
    if (imageLoaded && canvasRef.current && containerRef.current) {
      const containerWidth = containerRef.current.clientWidth;
      const scaleX = containerWidth / settings.dimensions.width;
      setScale(scaleX);
      canvasRef.current.style.width = "100%";
      canvasRef.current.style.height = "auto";
    }
  }, [imageLoaded, settings.dimensions]);

  // Apply shift-snap to a point relative to a reference point
  const applySnap = useCallback(
    (pos: { x: number; y: number }, ref: { x: number; y: number }) => {
      if (!shiftHeld) return pos;
      const dx = Math.abs(pos.x - ref.x);
      const dy = Math.abs(pos.y - ref.y);
      // Snap to the axis that is closest (smallest delta)
      if (dx <= dy) {
        return { x: ref.x, y: pos.y }; // snap horizontal (lock x)
      } else {
        return { x: pos.x, y: ref.y }; // snap vertical (lock y)
      }
    },
    [shiftHeld],
  );

  // Get the effective mouse position (with snap applied if in chain-drawing)
  const getEffectiveMousePos = useCallback(() => {
    if (!mousePos) return null;
    if (chainPoints.length > 0) {
      const lastPoint = chainPoints[chainPoints.length - 1];
      return applySnap(mousePos, lastPoint);
    }
    return mousePos;
  }, [mousePos, chainPoints, applySnap]);

  // Draw canvas
  const drawCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx || !imageRef.current) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(imageRef.current, 0, 0);

    // Draw existing walls
    for (const wall of settings.walls) {
      drawWall(ctx, wall.x1, wall.y1, wall.x2, wall.y2, "#dc2626", 3);
    }

    // Draw endpoint handles for existing walls (for drag-to-adjust)
    for (const wall of settings.walls) {
      for (const [px, py] of [
        [wall.x1, wall.y1],
        [wall.x2, wall.y2],
      ]) {
        ctx.beginPath();
        ctx.arc(px, py, 5, 0, Math.PI * 2);
        ctx.fillStyle = "#dc2626";
        ctx.fill();
        ctx.strokeStyle = "#fff";
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }
    }

    // Draw chain points and segments already placed
    if (chainPoints.length > 0) {
      // Draw completed chain segments
      for (let i = 0; i < chainPoints.length - 1; i++) {
        drawWall(
          ctx,
          chainPoints[i].x,
          chainPoints[i].y,
          chainPoints[i + 1].x,
          chainPoints[i + 1].y,
          "#22c55e",
          2,
        );
      }

      // Draw preview line from last point to mouse
      const effectivePos = getEffectiveMousePos();
      if (effectivePos) {
        const lastPoint = chainPoints[chainPoints.length - 1];
        drawWall(
          ctx,
          lastPoint.x,
          lastPoint.y,
          effectivePos.x,
          effectivePos.y,
          "#f97316",
          2,
        );
      }

      // Draw all chain points
      for (const pt of chainPoints) {
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, 5, 0, Math.PI * 2);
        ctx.fillStyle = "#22c55e";
        ctx.fill();
        ctx.strokeStyle = "#000";
        ctx.lineWidth = 1;
        ctx.stroke();
      }
    }

    // Highlight dragged endpoint
    if (dragging) {
      const wall = settings.walls.find((w) => w.id === dragging.wallId);
      if (wall && mousePos) {
        const pos =
          dragging.endpoint === "start"
            ? { x: mousePos.x, y: mousePos.y }
            : { x: mousePos.x, y: mousePos.y };
        ctx.beginPath();
        ctx.arc(pos.x, pos.y, 7, 0, Math.PI * 2);
        ctx.fillStyle = "#3b82f6";
        ctx.fill();
        ctx.strokeStyle = "#fff";
        ctx.lineWidth = 2;
        ctx.stroke();
      }
    }
  }, [settings.walls, chainPoints, mousePos, dragging, getEffectiveMousePos]);

  // Redraw on any state change
  useEffect(() => {
    if (imageLoaded) {
      drawCanvas();
    }
  }, [imageLoaded, drawCanvas]);

  const getCanvasCoords = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = e.currentTarget;
    const rect = canvas.getBoundingClientRect();
    return {
      x: (e.clientX - rect.left) / scale,
      y: (e.clientY - rect.top) / scale,
    };
  };

  // Find if a point is near an existing wall endpoint
  const findNearEndpoint = (
    x: number,
    y: number,
  ): { wallId: string; endpoint: "start" | "end" } | null => {
    const threshold = POINT_HIT_RADIUS / scale;
    for (const wall of settings.walls) {
      if (Math.hypot(x - wall.x1, y - wall.y1) < threshold) {
        return { wallId: wall.id, endpoint: "start" };
      }
      if (Math.hypot(x - wall.x2, y - wall.y2) < threshold) {
        return { wallId: wall.id, endpoint: "end" };
      }
    }
    return null;
  };

  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (e.button !== 0) return; // Left click only
    const { x, y } = getCanvasCoords(e);

    // If not currently chain-drawing, check if we're clicking an endpoint to drag
    if (!isDrawing) {
      const hit = findNearEndpoint(x, y);
      if (hit) {
        setDragging(hit);
        setMousePos({ x, y });
        return;
      }
    }
  };

  const handleClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (e.button !== 0) return; // Left click only
    if (dragging) return; // Don't place points while dragging

    const raw = getCanvasCoords(e);

    // Apply snap if we have a previous chain point
    const pos =
      chainPoints.length > 0
        ? applySnap(raw, chainPoints[chainPoints.length - 1])
        : raw;

    // Add point to chain
    setChainPoints((prev) => [...prev, pos]);
  };

  const handleDoubleClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (e.button !== 0) return;
    // Finalize chain — the last single-click already added a point,
    // and the double-click adds another. We commit all segments.
    // Since the double-click fires two click events + one dblclick,
    // we need to commit what we have and clear.
    commitChain();
  };

  const commitChain = useCallback(() => {
    if (chainPoints.length < 2) {
      setChainPoints([]);
      setMousePos(null);
      return;
    }

    const newWalls: Wall[] = [];
    for (let i = 0; i < chainPoints.length - 1; i++) {
      newWalls.push({
        id: `wall_${Date.now()}_${i}`,
        x1: chainPoints[i].x,
        y1: chainPoints[i].y,
        x2: chainPoints[i + 1].x,
        y2: chainPoints[i + 1].y,
      });
    }

    updateSettings({ walls: [...settings.walls, ...newWalls] });
    setChainPoints([]);
    setMousePos(null);
  }, [chainPoints, settings.walls, updateSettings]);

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const pos = getCanvasCoords(e);
    setMousePos(pos);

    // If dragging an endpoint, update the wall in real-time
    if (dragging) {
      const updatedWalls = settings.walls.map((wall) => {
        if (wall.id !== dragging.wallId) return wall;
        if (dragging.endpoint === "start") {
          return { ...wall, x1: pos.x, y1: pos.y };
        } else {
          return { ...wall, x2: pos.x, y2: pos.y };
        }
      });
      updateSettings({ walls: updatedWalls });
    }
  };

  const handleMouseUp = (_e: React.MouseEvent<HTMLCanvasElement>) => {
    if (dragging) {
      setDragging(null);
    }
  };

  const handleContextMenu = (e: React.MouseEvent<HTMLCanvasElement>) => {
    e.preventDefault();

    // Cancel chain-drawing on right-click
    if (isDrawing) {
      // Commit what we have so far (if >= 2 points)
      commitChain();
      return;
    }

    const { x, y } = getCanvasCoords(e);

    // Find nearest wall within threshold and delete it
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
  };

  const clearAllWalls = () => {
    updateSettings({ walls: [] });
    setChainPoints([]);
    setMousePos(null);
  };

  return (
    <div className="bg-white p-6 rounded-lg shadow-md">
      <h2 className="text-2xl font-semibold text-gray-800 mb-2">Walls</h2>
      <div className="p-2 rounded-md text-sm mb-2">
        <p>
          Click to place points. Each segment becomes a wall. Double-click or
          press Escape to finish.
        </p>
        <p>
          Hold Shift to snap to horizontal or vertical. Right-click a wall to
          delete it.
        </p>
        <p>Drag an existing endpoint to adjust its position.</p>
        <p className="mt-1 text-gray-500">
          Wall count: {settings.walls.length}
          {isDrawing &&
            ` — Drawing chain (${chainPoints.length} point${chainPoints.length !== 1 ? "s" : ""})...`}
        </p>
      </div>
      {settings.walls.length > 0 && (
        <button
          className="mb-2 px-3 py-1 bg-red-500 text-white text-sm rounded hover:bg-red-600"
          onClick={clearAllWalls}
        >
          Remove all walls
        </button>
      )}
      <div className="relative" ref={containerRef} tabIndex={0}>
        <canvas
          ref={canvasRef}
          width={settings.dimensions.width}
          height={settings.dimensions.height}
          onMouseDown={handleMouseDown}
          onClick={handleClick}
          onDoubleClick={handleDoubleClick}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onContextMenu={handleContextMenu}
          className="border border-gray-300 rounded-lg cursor-crosshair"
        />
      </div>
    </div>
  );
}

/**
 * Draw a wall segment with endpoint circles.
 */
function drawWall(
  ctx: CanvasRenderingContext2D,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  color: string,
  width: number,
) {
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.lineCap = "round";
  ctx.stroke();

  // Endpoints
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
}

/**
 * Calculate distance from point (px,py) to line segment (x1,y1)-(x2,y2)
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
