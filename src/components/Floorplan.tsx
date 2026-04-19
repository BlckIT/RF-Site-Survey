import React, { ReactNode, useRef, useState } from "react";
import { useEffect } from "react";
import { rssiToPercentage, delay } from "../lib/utils";
import { getColorAt, objectToRGBAString } from "@/lib/utils-gradient";
import { useSettings } from "./GlobalSettings";
import { HeatmapSettings, SurveyResult, SurveyPoint } from "../lib/types";
import NewToast from "@/components/NewToast";
import PopupDetails from "@/components/PopupDetails";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { getLogger } from "../lib/logger";
const logger = getLogger("Floorplan");

export default function ClickableFloorplan({
  overlay,
}: {
  overlay?: React.ReactNode;
}): ReactNode {
  const { settings, updateSettings, surveyPointActions } = useSettings();

  const [imageLoaded, setImageLoaded] = useState(false);
  const imageRef = useRef<HTMLImageElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [selectedPoint, setSelectedPoint] = useState<SurveyPoint | null>(null);
  const [popupPosition, setPopupPosition] = useState({ x: 0, y: 0 });
  const [alertMessage, setAlertMessage] = useState("");
  const [isToastOpen, setIsToastOpen] = useState(false);
  const [surveyClick, setSurveyClick] = useState({ x: 0, y: 0 });

  /**
   * Ladda planritningsbild — använd decode() för att undvika race condition
   * med cachade bilder där onload kan triggas synkront innan handler sätts
   */
  useEffect(() => {
    if (settings.floorplanImagePath != "") {
      setImageLoaded(false);
      let cancelled = false;
      const img = new Image();
      img.src = settings.floorplanImagePath;
      img
        .decode()
        .then(() => {
          if (cancelled) return;
          const newDimensions = { width: img.width, height: img.height };
          imageRef.current = img;
          // Uppdatera dimensions och markera som laddad i samma tick
          // så att nästa useEffect ritar canvasen korrekt
          updateSettings({ dimensions: newDimensions });
          setImageLoaded(true);
        })
        .catch(() => {
          if (!cancelled) {
            console.log(`image error`);
            setImageLoaded(false);
          }
        });
      return () => {
        cancelled = true;
      };
    } else {
      setImageLoaded(false);
    }
  }, [settings.floorplanImagePath]);

  useEffect(() => {
    if (imageLoaded && canvasRef.current) {
      const canvas = canvasRef.current;
      const containerWidth = containerRef.current?.clientWidth || canvas.width;
      const scaleX = containerWidth / settings.dimensions.width;
      const scaledHeight = settings.dimensions.height * scaleX;
      const maxH = window.innerHeight - 200;
      if (scaledHeight > maxH) {
        const constrainedScale = maxH / settings.dimensions.height;
        canvas.style.width = `${settings.dimensions.width * constrainedScale}px`;
        canvas.style.height = `${maxH}px`;
      } else {
        canvas.style.width = "100%";
        canvas.style.height = "auto";
      }
      drawCanvas();
    }
  }, [imageLoaded, settings.dimensions, settings.surveyPoints]);

  const handleToastIsReady = (): void => {
    measureSurveyPoint(surveyClick);
  };

  /**
   * Kör en enskild mätning mot API:et och returnera resultatet.
   */
  const runSingleMeasurement = async (
    overrideInterface?: string,
  ): Promise<SurveyResult> => {
    const partialSettings = {
      settings: {
        iperfServerAdrs: settings.iperfServerAdrs,
        testDuration: settings.testDuration,
        sudoerPassword: settings.sudoerPassword,
        wifiInterface: overrideInterface || settings.wifiInterface || "",
        targetSSID: settings.targetSSID || "",
      },
    };

    const res = await fetch("/api/start-task?action=start", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(partialSettings),
    });
    if (!res.ok) {
      throw new Error(`Server error: ${res.status}`);
    }

    let result: SurveyResult = { state: "pending" };
    while (true) {
      try {
        const pollRes = await fetch("/api/start-task?action=results");
        if (!pollRes.ok) throw new Error(`HTTP ${pollRes.status}`);
        result = await pollRes.json();
        logger.debug(`Status is: ${JSON.stringify(result)}`);
        if (result.state !== "pending") break;
      } catch (err) {
        console.error(`Measurement process gave error: ${err}`);
      }
      await delay(1000);
    }
    return result;
  };

  /**
   * measureSurveyPoint - make measurements for point at x/y
   * Triggered by a click on the canvas that _isn't_ an existing
   *    surveypoint
   * @param surveyClick
   * @returns null, but after having added the point to surveyPoints[]
   *
   * Error handling:
   * If there are errors, this routine throws a string with an explanation
   */
  const measureSurveyPoint = async (surveyClick: { x: number; y: number }) => {
    const x = Math.round(surveyClick.x);
    const y = Math.round(surveyClick.y);

    // Dual-band hanteras server-side i iperfRunner — kör alltid EN mätning
    const result = await runSingleMeasurement();

    if (result.state === "error") {
      cleanupFailedTest(`${result.explanation}`);
      return;
    }
    if (!result.results?.wifiData || !result.results?.iperfData) {
      cleanupFailedTest("Measurement cancelled");
      return;
    }
    const { wifiData, iperfData, bandMeasurements, scannedBSSList } =
      result.results;
    const newPoint: SurveyPoint = {
      wifiData,
      iperfData,
      x,
      y,
      timestamp: Date.now(),
      isEnabled: true,
      id: `Point_${settings.nextPointNum}`,
      bandMeasurements,
      scannedBSSList,
    };
    addSurveyPoint(newPoint, x, y, settings);
  };

  /**
   * cleanupFailedTest() - if something went wrong during the measurement,
   *   close NewToast
   *   remove the empty survey point by re-drawing the canvas
   *     (without the prospective empty survey point)
   *   set the proper alert message
   * @param errorMessage Message to reuturn
   * @returns void
   */
  function cleanupFailedTest(errorMessage: string): void {
    setIsToastOpen(false);
    drawCanvas(); // restore the points on the canvas (not the empty point)
    setAlertMessage(errorMessage);
    return;
  }

  function addSurveyPoint(
    newPoint: SurveyPoint,
    x: number,
    y: number,
    settings: HeatmapSettings,
  ): void {
    // otherwise, add the point, bumping the point number
    const pointNum = settings.nextPointNum;
    const addedPoint = {
      ...newPoint,
      x,
      y,
      isEnabled: true,
      id: `Point_${pointNum}`,
    };
    updateSettings({ nextPointNum: pointNum + 1 });
    surveyPointActions.add(addedPoint);
  }

  /**
   * drawCanvas - make the entire drawing go...
   */
  const drawCanvas = () => {
    const canvas = canvasRef.current;
    if (canvas && imageRef.current) {
      const ctx = canvas.getContext("2d");
      if (ctx) {
        // clear the canvas
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        // draw the image "behind" everything else
        ctx.drawImage(imageRef.current, 0, 0);
        // draw the points on top
        drawPoints(settings.surveyPoints, ctx);
      }
    }
  };

  /**
   * Close the popup window by setting selectedPoint to null
   */
  const closePopup = (): void => {
    setSelectedPoint(null);
  };
  /**
   * drawPoints - draw the list of points in the specified context
   * @param ctx
   * @param points
   */
  const drawPoints = (points: SurveyPoint[], ctx: CanvasRenderingContext2D) => {
    const canvas = canvasRef.current;
    points.forEach((point) => drawPoint(point, ctx, { bgW: canvas!.width }));
  };

  type ScaleOpts = {
    bgW: number; // background width in CSS px
    crisp1px?: boolean; // keep borders at ~1px regardless of scale
    dpr?: number; // pass window.devicePixelRatio
  };

  function drawPoint(
    point: SurveyPoint,
    ctx: CanvasRenderingContext2D,
    opts: ScaleOpts,
  ) {
    if (!point.wifiData) return;

    const { bgW, crisp1px = true, dpr = window.devicePixelRatio || 1 } = opts;

    // All sizes derived from bg width
    const R = 0.008 * bgW; // marker radius = 0.8% of bg width
    const BORDER = crisp1px ? 1 / dpr : 0.002 * bgW; // ~1px or 0.2% of bg width
    const FONT = 0.012 * bgW; // 1.2% of bg width
    const LINE_H = 1.2 * FONT;
    const PAD = 0.004 * bgW;
    const LABEL_OFFSET_Y = 0.015 * bgW;
    const SHADOW_BLUR = 0.004 * bgW;
    const SHADOW_OFF = 0.002 * bgW;

    const wifiInfo = point.wifiData;

    // Main point
    ctx.beginPath();
    ctx.arc(point.x, point.y, R, 0, 2 * Math.PI);
    ctx.fillStyle = point.isEnabled
      ? objectToRGBAString(
          getColorAt(rssiToPercentage(wifiInfo.rssi) / 100, settings.gradient),
        )
      : "rgba(156, 163, 175, 0.9)";
    ctx.fill();

    // Border
    ctx.strokeStyle = "grey";
    ctx.lineWidth = BORDER;
    ctx.closePath();
    ctx.stroke();

    // Annotation — visa dBm som primärt värde
    const annotation = `${wifiInfo.rssi} dBm`;
    ctx.font = `${FONT}px Arial`;
    const lines = annotation.split("\n");
    const boxWidth =
      Math.max(...lines.map((line) => ctx.measureText(line).width)) + PAD * 2;
    const boxHeight = lines.length * LINE_H + PAD * 2;

    // Shadow
    ctx.shadowColor = "rgba(0, 0, 0, 0.2)";
    ctx.shadowBlur = SHADOW_BLUR;
    ctx.shadowOffsetX = SHADOW_OFF;
    ctx.shadowOffsetY = SHADOW_OFF;

    // Label box
    ctx.fillStyle = "rgba(255, 255, 255, 0.6)";
    ctx.fillRect(
      point.x - boxWidth / 2,
      point.y + LABEL_OFFSET_Y,
      boxWidth,
      boxHeight,
    );

    // Reset shadow
    ctx.shadowColor = "transparent";
    ctx.shadowBlur = 0;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 0;

    // Text
    ctx.fillStyle = "#1F2937";
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    lines.forEach((line, i) => {
      ctx.fillText(line, point.x, point.y + LABEL_OFFSET_Y + PAD + i * LINE_H);
    });
  }

  /**
   * drawEmptyPoint() - draw an empty point, grey boundary to be filled
   *   in when the data returns.
   * @param point
   * @param ctx
   * @param opts
   */
  function drawEmptyPoint(
    point: SurveyPoint,
    ctx: CanvasRenderingContext2D,
    opts: ScaleOpts,
  ) {
    const { R, BORDER } = sizesFrom(opts);

    // ensure no inherited shadows
    ctx.shadowColor = "transparent";
    ctx.shadowBlur = 0;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 0;

    ctx.beginPath();
    ctx.arc(point.x, point.y, R, 0, Math.PI * 2);
    ctx.fillStyle = "#fff";
    ctx.fill();
    ctx.strokeStyle = "grey";
    ctx.lineWidth = BORDER;
    ctx.stroke();
  }

  function sizesFrom(opts: ScaleOpts) {
    const dpr = opts.dpr ?? (window.devicePixelRatio || 1);
    return {
      R: 0.008 * opts.bgW,
      BORDER: (opts.crisp1px ?? true) ? 1 / dpr : 0.002 * opts.bgW,
    };
  }

  /**
   * handleCanvasClick - a click anywhere in the canvas
   * @param event click point
   * @returns nothing
   */

  /**
   * Beräkna canvas-koordinater från musklick, med rotationskompensation.
   * Samma logik som WallEditor.getCanvasCoords.
   */
  const getCanvasCoords = (event: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = event.currentTarget;
    const rect = canvas.getBoundingClientRect();
    const rotation = settings.rotation ?? 0;

    // Beräkna faktisk skalning från renderad storlek vs logisk storlek
    // Detta är alltid korrekt oavsett CSS-skalning, viewport eller ritning
    const actualScaleX = rect.width / canvas.width;
    const actualScaleY = rect.height / canvas.height;

    if (rotation === 0) {
      return {
        x: (event.clientX - rect.left) / actualScaleX,
        y: (event.clientY - rect.top) / actualScaleY,
      };
    }

    // När canvasen är CSS-roterad returnerar getBoundingClientRect() den
    // axis-aligned bounding boxen av det roterade elementet.
    // Beräkna klickpositionen relativt canvasens oroterade centrum.
    const rad = (-rotation * Math.PI) / 180;
    const cos = Math.cos(rad);
    const sin = Math.sin(rad);

    // Canvasens visuella mitt (rect-mitt = roterad mitt)
    const rcx = rect.left + rect.width / 2;
    const rcy = rect.top + rect.height / 2;

    // Klickposition relativt visuell mitt
    const dx = event.clientX - rcx;
    const dy = event.clientY - rcy;

    // Rotera tillbaka till canvasens lokala koordinatsystem
    const localX = cos * dx - sin * dy;
    const localY = sin * dx + cos * dy;

    // Canvasens oroterade dimensioner i skärmpixlar
    const canvasScreenW = canvas.width * actualScaleX;
    const canvasScreenH = canvas.height * actualScaleY;

    return {
      x: (localX + canvasScreenW / 2) / actualScaleX,
      y: (localY + canvasScreenH / 2) / actualScaleY,
    };
  };

  /**
   * Beräkna skärmposition (pixlar) för en canvas-punkt, med rotationskompensation.
   * Används för att positionera popup-element korrekt.
   */
  const canvasToScreenPos = (
    canvasX: number,
    canvasY: number,
    canvasEl: HTMLCanvasElement,
  ) => {
    const rotation = settings.rotation ?? 0;
    const rect = canvasEl.getBoundingClientRect();
    // Beräkna faktisk skalning från renderad storlek vs logisk storlek
    const actualScaleX = rect.width / canvasEl.width;
    const actualScaleY = rect.height / canvasEl.height;

    if (rotation === 0) {
      return { x: canvasX * actualScaleX, y: canvasY * actualScaleY };
    }

    const containerRect = containerRef.current?.getBoundingClientRect();
    const rad = (rotation * Math.PI) / 180;
    const cos = Math.cos(rad);
    const sin = Math.sin(rad);

    // Punkt relativt canvasens oroterade centrum (i skärmpixlar)
    const canvasScreenW = canvasEl.width * actualScaleX;
    const canvasScreenH = canvasEl.height * actualScaleY;
    const lx = canvasX * actualScaleX - canvasScreenW / 2;
    const ly = canvasY * actualScaleY - canvasScreenH / 2;

    // Rotera till skärmkoordinater
    const sx = cos * lx - sin * ly;
    const sy = sin * lx + cos * ly;

    // Absolut skärmposition
    const rcx = rect.left + rect.width / 2;
    const rcy = rect.top + rect.height / 2;

    // Returnera relativt containern
    const contLeft = containerRect?.left ?? 0;
    const contTop = containerRect?.top ?? 0;
    return {
      x: rcx + sx - contLeft,
      y: rcy + sy - contTop,
    };
  };

  const handleCanvasClick = (event: React.MouseEvent<HTMLCanvasElement>) => {
    // if a point was selected, they have "clicked away"
    // also closes PopupDetails by clicking away
    if (selectedPoint) {
      setSelectedPoint(null);
      return;
    }

    //if the click was on a survey point,
    // then display the popup window
    // otherwise, measure the signal strength/speeds at that X/Y
    const canvas = event.currentTarget;
    const { x, y } = getCanvasCoords(event);
    setSurveyClick({ x: x, y: y }); // retain the X/Y of the clicked point

    // Find closest surveyPoint (within 20 units?)
    const clickedPoint = settings.surveyPoints.find(
      (point) => Math.sqrt((point.x - x) ** 2 + (point.y - y) ** 2) < 20,
    );

    // if they clicked an existing point, set the selected point
    // and display the PopupDetails
    if (clickedPoint) {
      setSelectedPoint(selectedPoint == clickedPoint ? null : clickedPoint);
      setPopupPosition(
        canvasToScreenPos(clickedPoint.x, clickedPoint.y, canvas),
      );
    } else {
      // otherwise, start a measurement
      drawEmptyPoint({ x, y } as SurveyPoint, canvas.getContext("2d")!, {
        bgW: canvas!.width,
      });
      setSelectedPoint(null);
      setAlertMessage("");
      setIsToastOpen(true);
    }
  };

  return (
    <div className="bg-white p-4 rounded-md shadow-md">
      <h2 className="text-lg font-semibold text-gray-800">
        Interactive Floorplan
      </h2>
      <div className="p-2 rounded-md text-sm">
        <p>Click on the floor plan to start a new measurement.</p>
        <p>Click on existing points to see the measurement details.</p>

        <div className="space-y-2 flex flex-col">
          {settings.surveyPoints?.length > 0 && (
            <div>Total Measurements: {settings.surveyPoints.length}</div>
          )}
        </div>
      </div>
      {alertMessage != "" && (
        <Alert variant="destructive">
          <AlertTitle>Error Summary</AlertTitle>
          <AlertDescription>{alertMessage}</AlertDescription>
        </Alert>
      )}
      <div
        className="relative max-h-[calc(100vh-200px)] overflow-hidden"
        ref={containerRef}
      >
        {/* Wrapper som matchar canvasens exakta storlek så overlay hamnar rätt */}
        <div className="relative inline-block">
          <canvas
            ref={canvasRef}
            width={settings.dimensions.width}
            height={settings.dimensions.height}
            onClick={handleCanvasClick}
            className="border border-gray-200 rounded-md cursor-pointer w-full h-auto max-h-[calc(100vh-200px)] object-contain block"
          />

          {overlay}
        </div>

        <div
          style={{
            position: "absolute",
            left: `${popupPosition.x}px`,
            top: `${popupPosition.y}px`,
            transform: "translate(10px, -50%)",
          }}
        >
          <PopupDetails
            point={selectedPoint}
            settings={settings}
            surveyPointActions={surveyPointActions}
            onClose={closePopup}
          />
        </div>

        {isToastOpen && (
          <NewToast
            onClose={() => setIsToastOpen(false)}
            toastIsReady={handleToastIsReady}
          />
        )}
      </div>
    </div>
  );
}
