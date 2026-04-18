import React, {
  useRef,
  useState,
  useEffect,
  useCallback,
  ReactNode,
} from "react";
import { useSettings } from "./GlobalSettings";
import { Wall, WallMaterial, MATERIAL_PRESETS } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";

const WALL_HIT_RADIUS = 10; // px radius for detecting wall clicks (for splitting)
const SHARED_ENDPOINT_EPSILON = 0.5; // px epsilon for detecting shared endpoints

const inputClass =
  "w-full border border-gray-200 rounded-sm p-1.5 text-sm focus:outline-none focus:ring focus:ring-blue-300 focus:border-blue-400";

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

  // Material popover state (visas vid klick på vägg)
  const [materialPopover, setMaterialPopover] = useState<{
    wallId: string;
    x: number;
    y: number;
  } | null>(null);

  // Material selection state
  const [activeMaterial, setActiveMaterial] = useState<WallMaterial>("drywall");
  const [selectedWallId, setSelectedWallId] = useState<string | null>(null);

  // Snap radius from global settings
  const snapRadius = settings.snapRadius ?? 8;
  const [snapTarget, setSnapTarget] = useState<{
    x: number;
    y: number;
    type: "close" | "endpoint" | "t-junction";
    wallId?: string;
  } | null>(null);

  // Samla T-junction splits som ska utföras vid commit
  const pendingTJunctionSplits = useRef<
    { wallId: string; x: number; y: number }[]
  >([]);

  const isDrawing = chainPoints.length > 0;

  // Load floor plan image and update dimensions if needed
  useEffect(() => {
    if (settings.floorplanImagePath) {
      setImageLoaded(false);
      const img = new Image();
      img.src = settings.floorplanImagePath;
      img.onload = () => {
        imageRef.current = img;
        const imgW = img.naturalWidth;
        const imgH = img.naturalHeight;
        if (
          imgW !== settings.dimensions.width ||
          imgH !== settings.dimensions.height
        ) {
          updateSettings({ dimensions: { width: imgW, height: imgH } });
        }
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

  // Track shift key globally
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Shift") setShiftHeld(true);
      if (e.key === "Escape") {
        setChainPoints([]);
        setMousePos(null);
        setSnapTarget(null);
        pendingTJunctionSplits.current = [];
        setMaterialPopover(null);
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

  // Beräkna skalning när bilden laddas eller dimensioner ändras
  useEffect(() => {
    if (imageLoaded && canvasRef.current && containerRef.current) {
      const containerWidth = containerRef.current.clientWidth;
      const scaleX = containerWidth / settings.dimensions.width;
      const scaledHeight = settings.dimensions.height * scaleX;
      // Begränsa till max viewport-höjd
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

  // Apply shift-snap to a point relative to a reference point
  const applySnap = useCallback(
    (pos: { x: number; y: number }, ref: { x: number; y: number }) => {
      if (!shiftHeld) return pos;
      const dx = Math.abs(pos.x - ref.x);
      const dy = Math.abs(pos.y - ref.y);
      if (dx <= dy) {
        return { x: ref.x, y: pos.y };
      } else {
        return { x: pos.x, y: ref.y };
      }
    },
    [shiftHeld],
  );

  // Collect all existing wall endpoints
  const getAllEndpoints = useCallback((): { x: number; y: number }[] => {
    const points: { x: number; y: number }[] = [];
    for (const wall of settings.walls) {
      points.push({ x: wall.x1, y: wall.y1 });
      points.push({ x: wall.x2, y: wall.y2 });
    }
    return points;
  }, [settings.walls]);

  // Find nearest snap target (existing endpoint, chain-close, or T-junction on wall segment)
  const findSnapTarget = useCallback(
    (pos: {
      x: number;
      y: number;
    }): {
      x: number;
      y: number;
      type: "close" | "endpoint" | "t-junction";
      wallId?: string;
    } | null => {
      const threshold = snapRadius / scale;
      let bestDist = threshold;
      let bestTarget: {
        x: number;
        y: number;
        type: "close" | "endpoint" | "t-junction";
        wallId?: string;
      } | null = null;

      // Check chain-close (first point of current chain) — högsta prioritet
      if (chainPoints.length >= 2) {
        const first = chainPoints[0];
        const dist = Math.hypot(pos.x - first.x, pos.y - first.y);
        if (dist < bestDist) {
          bestDist = dist;
          bestTarget = { x: first.x, y: first.y, type: "close" };
        }
      }

      // Check all existing wall endpoints
      const endpoints = getAllEndpoints();
      for (const ep of endpoints) {
        const dist = Math.hypot(pos.x - ep.x, pos.y - ep.y);
        if (dist < bestDist) {
          bestDist = dist;
          bestTarget = { x: ep.x, y: ep.y, type: "endpoint" };
        }
      }

      // Check T-junction: närmaste punkt på befintliga väggsegment (inte endpoints)
      for (const wall of settings.walls) {
        const closest = closestPointOnSegment(
          pos.x,
          pos.y,
          wall.x1,
          wall.y1,
          wall.x2,
          wall.y2,
        );
        // Skippa om närmaste punkten är en endpoint (redan hanterad ovan)
        const distToStart = Math.hypot(
          closest.x - wall.x1,
          closest.y - wall.y1,
        );
        const distToEnd = Math.hypot(closest.x - wall.x2, closest.y - wall.y2);
        if (distToStart < 1 || distToEnd < 1) continue;

        const dist = Math.hypot(pos.x - closest.x, pos.y - closest.y);
        if (dist < bestDist) {
          bestDist = dist;
          bestTarget = {
            x: closest.x,
            y: closest.y,
            type: "t-junction",
            wallId: wall.id,
          };
        }
      }

      return bestTarget;
    },
    [snapRadius, scale, chainPoints, getAllEndpoints, settings.walls],
  );

  // Get the effective mouse position (with endpoint snap > shift-snap)
  const getEffectiveMousePos = useCallback(() => {
    if (!mousePos) return null;
    if (chainPoints.length > 0) {
      // First check endpoint/close snap
      const snap = findSnapTarget(mousePos);
      if (snap) return { x: snap.x, y: snap.y };
      // Fall back to shift-snap
      const lastPoint = chainPoints[chainPoints.length - 1];
      return applySnap(mousePos, lastPoint);
    }
    return mousePos;
  }, [mousePos, chainPoints, applySnap, findSnapTarget]);

  // Draw canvas
  const drawCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx || !imageRef.current) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(imageRef.current, 0, 0);

    // Draw existing walls with material colors and thickness
    for (const wall of settings.walls) {
      const preset = MATERIAL_PRESETS[wall.material || "drywall"];
      drawWall(
        ctx,
        wall.x1,
        wall.y1,
        wall.x2,
        wall.y2,
        preset.color,
        preset.thickness,
      );
    }

    // Draw endpoint handles for existing walls (for drag-to-adjust)
    for (const wall of settings.walls) {
      for (const [px, py] of [
        [wall.x1, wall.y1],
        [wall.x2, wall.y2],
      ]) {
        ctx.beginPath();
        ctx.arc(px, py, 5, 0, Math.PI * 2);
        ctx.fillStyle = selectedWallId === wall.id ? "#3b82f6" : "#dc2626";
        ctx.fill();
        ctx.strokeStyle = "#fff";
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }
    }

    // Draw snap target highlight
    if (snapTarget && isDrawing) {
      ctx.beginPath();
      ctx.arc(snapTarget.x, snapTarget.y, 10, 0, Math.PI * 2);
      const snapColor =
        snapTarget.type === "close"
          ? "rgba(34, 197, 94, 0.35)"
          : snapTarget.type === "t-junction"
            ? "rgba(249, 115, 22, 0.35)"
            : "rgba(59, 130, 246, 0.35)";
      const snapStroke =
        snapTarget.type === "close"
          ? "#22c55e"
          : snapTarget.type === "t-junction"
            ? "#f97316"
            : "#3b82f6";
      ctx.fillStyle = snapColor;
      ctx.fill();
      ctx.strokeStyle = snapStroke;
      ctx.lineWidth = 2;
      ctx.stroke();
    }

    // Draw split indicators (hover over wall to show + marker)
    if (mousePos && !isDrawing && !dragging) {
      const threshold = WALL_HIT_RADIUS / scale;
      for (const wall of settings.walls) {
        const dist = pointToSegmentDist(
          mousePos.x,
          mousePos.y,
          wall.x1,
          wall.y1,
          wall.x2,
          wall.y2,
        );
        if (dist < threshold) {
          // Draw + marker at closest point on wall
          const closest = closestPointOnSegment(
            mousePos.x,
            mousePos.y,
            wall.x1,
            wall.y1,
            wall.x2,
            wall.y2,
          );
          ctx.fillStyle = "rgba(34, 197, 94, 0.8)";
          ctx.font = "bold 20px Arial";
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.fillText("+", closest.x, closest.y);
        }
      }
    }

    // Draw chain points and segments already placed
    if (chainPoints.length > 0) {
      // Draw completed chain segments
      for (let i = 0; i < chainPoints.length - 1; i++) {
        const preset = MATERIAL_PRESETS[activeMaterial];
        drawWall(
          ctx,
          chainPoints[i].x,
          chainPoints[i].y,
          chainPoints[i + 1].x,
          chainPoints[i + 1].y,
          preset.color,
          preset.thickness,
        );
      }

      // Draw preview line from last point to snapped/effective mouse position
      const effectivePos = getEffectiveMousePos();
      if (effectivePos) {
        const lastPoint = chainPoints[chainPoints.length - 1];
        drawWall(
          ctx,
          lastPoint.x,
          lastPoint.y,
          effectivePos.x,
          effectivePos.y,
          snapTarget
            ? snapTarget.type === "close"
              ? "#22c55e"
              : snapTarget.type === "t-junction"
                ? "#f97316"
                : "#3b82f6"
            : "#f97316",
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
  }, [
    settings.walls,
    chainPoints,
    mousePos,
    dragging,
    getEffectiveMousePos,
    activeMaterial,
    selectedWallId,
    isDrawing,
    snapTarget,
    scale,
  ]);

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
    const threshold = snapRadius / scale;
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

  // Find if a point is near a wall (for splitting)
  const findNearWall = (x: number, y: number): string | null => {
    const threshold = WALL_HIT_RADIUS / scale;
    let closestWallId: string | null = null;
    let closestDist = Infinity;

    for (const wall of settings.walls) {
      const dist = pointToSegmentDist(x, y, wall.x1, wall.y1, wall.x2, wall.y2);
      if (dist < closestDist) {
        closestDist = dist;
        closestWallId = wall.id;
      }
    }

    return closestDist < threshold ? closestWallId : null;
  };

  // Store the original position of the dragged endpoint for shared-endpoint detection
  const dragOriginRef = useRef<{ x: number; y: number } | null>(null);

  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (e.button !== 0) return;
    const { x, y } = getCanvasCoords(e);

    if (!isDrawing) {
      const hit = findNearEndpoint(x, y);
      if (hit) {
        // Store the original endpoint position for shared-endpoint matching
        const wall = settings.walls.find((w) => w.id === hit.wallId);
        if (wall) {
          dragOriginRef.current =
            hit.endpoint === "start"
              ? { x: wall.x1, y: wall.y1 }
              : { x: wall.x2, y: wall.y2 };
        }
        setDragging(hit);
        setMousePos({ x, y });
        return;
      }
    }
  };

  const handleClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (e.button !== 0) return;
    if (dragging) return;

    const raw = getCanvasCoords(e);

    // Vänsterklick = ALLTID bygga väggar, aldrig material-picker
    if (!isDrawing) {
      setSelectedWallId(null);
      setMaterialPopover(null);
      // Starta ny kedja — kolla endpoint/t-junction snap först
      const snap = findSnapTarget(raw);
      if (snap) {
        if (snap.type === "t-junction" && snap.wallId) {
          pendingTJunctionSplits.current.push({
            wallId: snap.wallId,
            x: snap.x,
            y: snap.y,
          });
        }
        setChainPoints([{ x: snap.x, y: snap.y }]);
      } else {
        // Kolla om klick är nära mitten av en vägg (splitta + starta kedja)
        const nearWallId = findNearWall(raw.x, raw.y);
        if (nearWallId) {
          const wall = settings.walls.find((w) => w.id === nearWallId);
          if (wall) {
            const closest = closestPointOnSegment(
              raw.x,
              raw.y,
              wall.x1,
              wall.y1,
              wall.x2,
              wall.y2,
            );
            // Kolla om det är nära en endpoint (redan hanterat av snap ovan)
            const distToStart = Math.hypot(
              closest.x - wall.x1,
              closest.y - wall.y1,
            );
            const distToEnd = Math.hypot(
              closest.x - wall.x2,
              closest.y - wall.y2,
            );
            if (distToStart > 1 && distToEnd > 1) {
              // Mitt på väggen — registrera T-junction split och starta kedja
              pendingTJunctionSplits.current.push({
                wallId: nearWallId,
                x: closest.x,
                y: closest.y,
              });
              setChainPoints([{ x: closest.x, y: closest.y }]);
            } else {
              setChainPoints([{ x: closest.x, y: closest.y }]);
            }
          } else {
            setChainPoints([raw]);
          }
        } else {
          setChainPoints([raw]);
        }
      }
      return;
    }

    // Check for endpoint/close/t-junction snap first
    const snap = findSnapTarget(raw);
    if (snap) {
      if (snap.type === "close" && chainPoints.length >= 2) {
        // Snap-to-close: add the closing point and auto-commit
        setChainPoints((prev) => {
          const updated = [...prev, { x: snap.x, y: snap.y }];
          return updated;
        });
        const closedChain = [...chainPoints, { x: snap.x, y: snap.y }];
        commitChainWith(closedChain);
        return;
      }
      // Registrera T-junction split om det är en mitt-på-vägg snap
      if (snap.type === "t-junction" && snap.wallId) {
        pendingTJunctionSplits.current.push({
          wallId: snap.wallId,
          x: snap.x,
          y: snap.y,
        });
      }
      // Snap to existing endpoint or T-junction point
      setChainPoints((prev) => [...prev, { x: snap.x, y: snap.y }]);
      return;
    }

    // Apply shift-snap if we have a previous chain point
    const pos =
      chainPoints.length > 0
        ? applySnap(raw, chainPoints[chainPoints.length - 1])
        : raw;

    setChainPoints((prev) => [...prev, pos]);
  };

  const handleDoubleClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (e.button !== 0) return;
    commitChain();
  };

  const commitChainWith = useCallback(
    (points: { x: number; y: number }[]) => {
      if (points.length < 2) {
        setChainPoints([]);
        setMousePos(null);
        setSnapTarget(null);
        pendingTJunctionSplits.current = [];
        return;
      }

      // Utför T-junction splits på befintliga väggar
      const existingWalls = [...settings.walls];
      for (const split of pendingTJunctionSplits.current) {
        const wallIdx = existingWalls.findIndex((w) => w.id === split.wallId);
        if (wallIdx === -1) continue;
        const wall = existingWalls[wallIdx];
        // Splitta väggen i två segment vid T-junction-punkten
        const wallA: Wall = {
          id: `wall_${Date.now()}_tsplit_a_${wallIdx}`,
          x1: wall.x1,
          y1: wall.y1,
          x2: split.x,
          y2: split.y,
          material: wall.material,
          customAttenuationDb: wall.customAttenuationDb,
        };
        const wallB: Wall = {
          id: `wall_${Date.now()}_tsplit_b_${wallIdx}`,
          x1: split.x,
          y1: split.y,
          x2: wall.x2,
          y2: wall.y2,
          material: wall.material,
          customAttenuationDb: wall.customAttenuationDb,
        };
        existingWalls.splice(wallIdx, 1, wallA, wallB);
      }
      pendingTJunctionSplits.current = [];

      const newWalls: Wall[] = [];
      for (let i = 0; i < points.length - 1; i++) {
        newWalls.push({
          id: `wall_${Date.now()}_${i}`,
          x1: points[i].x,
          y1: points[i].y,
          x2: points[i + 1].x,
          y2: points[i + 1].y,
          material: activeMaterial,
        });
      }

      updateSettings({ walls: [...existingWalls, ...newWalls] });
      setChainPoints([]);
      setMousePos(null);
      setSnapTarget(null);
    },
    [activeMaterial, settings.walls, updateSettings],
  );

  const commitChain = useCallback(() => {
    commitChainWith(chainPoints);
  }, [chainPoints, commitChainWith]);

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const pos = getCanvasCoords(e);
    setMousePos(pos);

    // Update snap target for visual feedback
    if (isDrawing) {
      setSnapTarget(findSnapTarget(pos));
    } else {
      setSnapTarget(null);
    }

    if (dragging && dragOriginRef.current) {
      const origPt = dragOriginRef.current;

      const updatedWalls = settings.walls.map((wall) => {
        const updated = { ...wall };
        if (
          Math.hypot(wall.x1 - origPt.x, wall.y1 - origPt.y) <
          SHARED_ENDPOINT_EPSILON
        ) {
          updated.x1 = pos.x;
          updated.y1 = pos.y;
        }
        if (
          Math.hypot(wall.x2 - origPt.x, wall.y2 - origPt.y) <
          SHARED_ENDPOINT_EPSILON
        ) {
          updated.x2 = pos.x;
          updated.y2 = pos.y;
        }
        return updated;
      });
      updateSettings({ walls: updatedWalls });
      // Update origin to track the new position for continuous dragging
      dragOriginRef.current = { x: pos.x, y: pos.y };
    }
  };

  const handleMouseUp = (_e: React.MouseEvent<HTMLCanvasElement>) => {
    if (dragging) {
      setDragging(null);
      dragOriginRef.current = null;
    }
  };

  const handleContextMenu = (e: React.MouseEvent<HTMLCanvasElement>) => {
    e.preventDefault();

    if (isDrawing) {
      commitChain();
      return;
    }

    // Högerklick på vägg → öppna material-picker popover
    const { x, y } = getCanvasCoords(e);
    const wallId = findNearWall(x, y);
    if (wallId) {
      setSelectedWallId(wallId);
      const rect = e.currentTarget.getBoundingClientRect();
      const containerRect = containerRef.current?.getBoundingClientRect();
      const offsetX = containerRect ? rect.left - containerRect.left : 0;
      const offsetY = containerRect ? rect.top - containerRect.top : 0;
      setMaterialPopover({
        wallId,
        x: e.clientX - rect.left + offsetX,
        y: e.clientY - rect.top + offsetY,
      });
    } else {
      setMaterialPopover(null);
      setSelectedWallId(null);
    }
  };

  // Split wall at mouse position
  const splitWall = (wallId: string) => {
    if (!mousePos) return;

    const wall = settings.walls.find((w) => w.id === wallId);
    if (!wall) return;

    const closest = closestPointOnSegment(
      mousePos.x,
      mousePos.y,
      wall.x1,
      wall.y1,
      wall.x2,
      wall.y2,
    );

    const newWalls = settings.walls.map((w) => {
      if (w.id !== wallId) return w;
      return w; // Keep original
    });

    // Add two new walls (split)
    newWalls.push({
      id: `wall_${Date.now()}_a`,
      x1: wall.x1,
      y1: wall.y1,
      x2: closest.x,
      y2: closest.y,
      material: wall.material,
      customAttenuationDb: wall.customAttenuationDb,
    });

    newWalls.push({
      id: `wall_${Date.now()}_b`,
      x1: closest.x,
      y1: closest.y,
      x2: wall.x2,
      y2: wall.y2,
      material: wall.material,
      customAttenuationDb: wall.customAttenuationDb,
    });

    // Remove original wall
    const filtered = newWalls.filter((w) => w.id !== wallId);
    updateSettings({ walls: filtered });
  };

  const clearAllWalls = () => {
    updateSettings({ walls: [] });
    setChainPoints([]);
    setMousePos(null);
    setSelectedWallId(null);
    setSnapTarget(null);
  };

  const updateSelectedWallMaterial = (material: WallMaterial) => {
    if (!selectedWallId) return;
    const updatedWalls = settings.walls.map((wall) => {
      if (wall.id !== selectedWallId) return wall;
      return { ...wall, material };
    });
    updateSettings({ walls: updatedWalls });
  };

  const updateSelectedWallCustomAttenuationDb = (attenuationDb: number) => {
    if (!selectedWallId) return;
    const updatedWalls = settings.walls.map((wall) => {
      if (wall.id !== selectedWallId) return wall;
      return { ...wall, customAttenuationDb: attenuationDb };
    });
    updateSettings({ walls: updatedWalls });
  };

  const selectedWall = settings.walls.find((w) => w.id === selectedWallId);

  return (
    <div>
      <div className="p-2 rounded-md text-sm mb-4">
        <p>
          Click to place wall points. Double-click or right-click to finish a
          chain.
        </p>
        <p>
          Points snap to nearby endpoints, wall midpoints (T-junctions), and to
          the first point to close a room.
        </p>
        <p>
          Hold Shift for horizontal/vertical snap. Drag endpoints to adjust.
        </p>
        <p>Right-click a wall to change its material.</p>
        <p className="mt-1 text-gray-500">
          Wall count: {settings.walls.length}
          {isDrawing &&
            ` — Drawing chain (${chainPoints.length} point${chainPoints.length !== 1 ? "s" : ""})...`}
        </p>
      </div>

      {/* Active material indicator */}
      <div className="mb-4">
        <Label className="text-xs font-semibold text-gray-700">
          Active Material
        </Label>
        <div className="flex items-center gap-2 mt-1">
          <div
            className="w-6 h-6 rounded border border-gray-300"
            style={{ backgroundColor: MATERIAL_PRESETS[activeMaterial].color }}
          />
          <select
            value={activeMaterial}
            onChange={(e) => setActiveMaterial(e.target.value as WallMaterial)}
            className={inputClass}
          >
            {(Object.keys(MATERIAL_PRESETS) as WallMaterial[]).map((mat) => (
              <option key={mat} value={mat}>
                {MATERIAL_PRESETS[mat].label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Material legend */}
      <div className="mb-4">
        <h3 className="text-xs font-semibold text-gray-700 mb-2">
          Material Legend
        </h3>
        <div className="grid grid-cols-2 gap-2 text-xs">
          {(Object.keys(MATERIAL_PRESETS) as WallMaterial[]).map((mat) => {
            const preset = MATERIAL_PRESETS[mat];
            return (
              <div key={mat} className="flex items-center gap-2">
                <div
                  className="w-4 h-4 rounded border border-gray-300"
                  style={{ backgroundColor: preset.color }}
                />
                <span className="text-gray-700">
                  {preset.label} ({preset.attenuationDb} dB)
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Selected wall panel */}
      {selectedWall && (
        <div className="mb-4 p-3 border border-gray-200 rounded-sm">
          <h3 className="text-xs font-semibold text-gray-700 mb-2">
            Selected Wall
          </h3>
          <div className="space-y-3">
            <div className="flex flex-col gap-1">
              <Label className="text-xs font-semibold text-gray-700">
                Material
              </Label>
              <select
                value={selectedWall.material || "drywall"}
                onChange={(e) =>
                  updateSelectedWallMaterial(e.target.value as WallMaterial)
                }
                className={inputClass}
              >
                {(Object.keys(MATERIAL_PRESETS) as WallMaterial[]).map(
                  (mat) => (
                    <option key={mat} value={mat}>
                      {MATERIAL_PRESETS[mat].label}
                    </option>
                  ),
                )}
              </select>
            </div>

            {selectedWall.material === "custom" && (
              <div className="flex flex-col gap-1">
                <Label className="text-xs font-semibold text-gray-700">
                  Custom Attenuation (dB):{" "}
                  {(selectedWall.customAttenuationDb ?? 5).toFixed(0)}
                </Label>
                <input
                  type="range"
                  min="0"
                  max="30"
                  step="1"
                  value={selectedWall.customAttenuationDb ?? 5}
                  onChange={(e) =>
                    updateSelectedWallCustomAttenuationDb(
                      parseFloat(e.target.value),
                    )
                  }
                  className="w-full"
                />
              </div>
            )}

            <Button
              variant="outline"
              size="sm"
              onClick={() => splitWall(selectedWallId!)}
            >
              Split Wall
            </Button>
          </div>
        </div>
      )}

      {isDrawing && (
        <Button
          variant="outline"
          size="sm"
          className="mb-2 mr-2"
          onClick={commitChain}
        >
          Finish chain
        </Button>
      )}

      {settings.walls.length > 0 && (
        <Button
          variant="destructive"
          size="sm"
          className="mb-2"
          onClick={clearAllWalls}
        >
          Remove all walls
        </Button>
      )}

      <div
        className="relative max-h-[calc(100vh-200px)] overflow-hidden"
        ref={containerRef}
        tabIndex={0}
      >
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
          className="border border-gray-200 rounded-sm cursor-crosshair w-full h-auto max-h-[calc(100vh-200px)] object-contain"
        />

        {/* Material popover vid klick på vägg */}
        {materialPopover &&
          (() => {
            const popoverWall = settings.walls.find(
              (w) => w.id === materialPopover.wallId,
            );
            if (!popoverWall) return null;
            return (
              <div
                className="absolute z-20 bg-white border border-gray-300 rounded-md shadow-lg p-2 min-w-[140px]"
                style={{
                  left: `${materialPopover.x + 8}px`,
                  top: `${materialPopover.y - 4}px`,
                }}
              >
                <p className="text-xs font-semibold text-gray-600 mb-1">
                  Wall Material
                </p>
                {(Object.keys(MATERIAL_PRESETS) as WallMaterial[]).map(
                  (mat) => {
                    const preset = MATERIAL_PRESETS[mat];
                    const isActive =
                      (popoverWall.material || "drywall") === mat;
                    return (
                      <button
                        key={mat}
                        className={`flex items-center gap-2 w-full text-left px-2 py-1 text-xs rounded hover:bg-gray-100 ${
                          isActive ? "bg-blue-50 font-semibold" : ""
                        }`}
                        onClick={(e) => {
                          e.stopPropagation();
                          const updatedWalls = settings.walls.map((w) =>
                            w.id === materialPopover.wallId
                              ? { ...w, material: mat }
                              : w,
                          );
                          updateSettings({ walls: updatedWalls });
                          setMaterialPopover(null);
                        }}
                      >
                        <span
                          className="w-3 h-3 rounded-sm border border-gray-300 inline-block"
                          style={{ backgroundColor: preset.color }}
                        />
                        {preset.label} ({preset.attenuationDb} dB)
                      </button>
                    );
                  },
                )}
                <button
                  className="mt-1 text-xs text-gray-400 hover:text-gray-600 w-full text-left px-2"
                  onClick={(e) => {
                    e.stopPropagation();
                    setMaterialPopover(null);
                  }}
                >
                  Close
                </button>
              </div>
            );
          })()}
      </div>
    </div>
  );
}

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

function closestPointOnSegment(
  px: number,
  py: number,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
): { x: number; y: number } {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return { x: x1, y: y1 };

  let t = ((px - x1) * dx + (py - y1) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));

  return {
    x: x1 + t * dx,
    y: y1 + t * dy,
  };
}
