import React, { useCallback, useEffect, useRef, useState } from "react";

import { useSettings } from "@/components/GlobalSettings";

import { calculateRadiusByBoundingBox } from "../lib/radiusCalculations";

import {
  SurveyPoint,
  testProperties,
  MeasurementTestType,
  testTypes,
  MATERIAL_PRESETS,
  BandMeasurement,
} from "@/lib/types";
import { getColorAt, objectToRGBAString } from "@/lib/utils-gradient";

import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { HeatmapSlider } from "./Slider";

import { IperfTestProperty } from "@/lib/types";
import { metricFormatter } from "@/lib/utils";
import { getLogger } from "@/lib/logger";
import createHeatmapWebGLRenderer from "../app/webGL/renderers/mainRenderer";
import HeatmapImage from "./HeatmapImage";
import HeatmapModal from "./HeatmapModal";

const logger = getLogger("Heatmaps");

/**
 * Applicera BandMeasurement-data ovanpå en SurveyPoint.
 * Returnerar en kopia med justerade wifi/iperf-värden.
 */
function applyBandOverlay(
  point: SurveyPoint,
  bm: BandMeasurement,
): SurveyPoint {
  return {
    ...point,
    wifiData: {
      ...point.wifiData,
      signalStrength: Math.round(((bm.signal + 100) / 60) * 100), // dBm → ungefärlig procent
      rssi: bm.signal,
    },
    iperfData: {
      ...point.iperfData,
      tcpDownload: {
        ...point.iperfData.tcpDownload,
        bitsPerSecond: (bm.tcpDown ?? 0) * 1e6,
      },
      tcpUpload: {
        ...point.iperfData.tcpUpload,
        bitsPerSecond: (bm.tcpUp ?? 0) * 1e6,
      },
      udpDownload: {
        ...point.iperfData.udpDownload,
        bitsPerSecond: (bm.udpDown ?? 0) * 1e6,
      },
      udpUpload: {
        ...point.iperfData.udpUpload,
        bitsPerSecond: (bm.udpUp ?? 0) * 1e6,
      },
    },
  };
}

const metricTitles: Record<MeasurementTestType, string> = {
  signalStrength: "Signal Strength",
  tcpDownload: "TCP Download",
  tcpUpload: "TCP Upload",
  udpDownload: "UDP Download",
  udpUpload: "UDP Upload",
};

const propertyTitles: Record<keyof IperfTestProperty, string> = {
  bitsPerSecond: "Bits Per Second [Mbps]",
  jitterMs: "Jitter [ms] (UDP Only)",
  lostPackets: "Lost Packets (UDP Only)",
  retransmits: "Retransmits (TCP Download Only)",
  packetsReceived: "Packets Received (UDP Only)",
  signalStrength: "dBm or %",
};

const getAvailableProperties = (
  metric: MeasurementTestType,
): (keyof IperfTestProperty)[] => {
  switch (metric) {
    case "tcpDownload":
      return ["bitsPerSecond", "retransmits"];
    case "tcpUpload":
      return ["bitsPerSecond"];
    case "udpDownload":
    case "udpUpload":
      return ["bitsPerSecond", "jitterMs", "lostPackets", "packetsReceived"];
    default:
      return [];
  }
};

/**
 * Heatmaps component - this is responsible for drawing all the heat maps
 * that are selected in the checkboxes
 * @returns the rendered heat maps
 */
export function Heatmaps({ showWalls = true }: { showWalls?: boolean } = {}) {
  const { settings, updateSettings } = useSettings();

  // array of surveyPoints passed in props
  const points = settings.surveyPoints;

  const [heatmaps, setHeatmaps] = useState<{ [key: string]: string | null }>(
    {},
  );
  const [selectedHeatmap, setSelectedHeatmap] = useState<{
    src: string;
    alt: string;
  } | null>(null);

  const [selectedMetrics, setSelectedMetrics] = useState<MeasurementTestType[]>(
    ["signalStrength"],
  );
  const [selectedProperties, setSelectedProperties] = useState<
    (keyof IperfTestProperty)[]
  >(["bitsPerSecond"]);

  const [showSignalStrengthAsPercentage, setShowSignalStrengthAsPercentage] =
    useState(true);

  // Dual-band filter: '2.4' | '5' | 'combined' | null (null = inga dual-band data)
  type BandFilter = "2.4" | "5" | "combined";
  const hasDualBandData = points.some(
    (p) => p.bandMeasurements && p.bandMeasurements.length > 0,
  );
  const [bandFilter, setBandFilter] = useState<BandFilter>("combined");

  /**
   * Filtrera och transformera surveyPoints baserat på valt band.
   * Om dual-band data saknas returneras punkterna oförändrade.
   */
  const filteredPoints = React.useMemo(() => {
    if (!hasDualBandData) return points;

    return points
      .map((p) => {
        if (!p.bandMeasurements || p.bandMeasurements.length === 0) return p;

        if (bandFilter === "combined") {
          // Välj bästa signalvärde per punkt
          const best = p.bandMeasurements.reduce((a, b) =>
            a.signal > b.signal ? a : b,
          );
          return applyBandOverlay(p, best);
        }

        const match = p.bandMeasurements.find((bm) => bm.band === bandFilter);
        if (!match) return null; // Ingen data för detta band
        return applyBandOverlay(p, match);
      })
      .filter((p): p is SurveyPoint => p !== null);
  }, [points, bandFilter, hasDualBandData]);

  // const r1 = calculateRadiusByDensity; // bad for small numbers of points
  const r2 = calculateRadiusByBoundingBox;
  // const r3 = calculateOptimalRadius; // bad for small numbers of points

  // Beräkna default-radie baserat på skala om kalibrerad, annars bounding box
  const isCalibrated =
    settings.pixelsPerMeter > 0 && settings.pixelsPerMeter !== 10;
  const DEFAULT_RADIUS_METERS = 8; // Rimlig inomhus-WiFi-radie
  const scaleBasedRadius = isCalibrated
    ? Math.round(DEFAULT_RADIUS_METERS * settings.pixelsPerMeter)
    : null;

  const displayedRadius = settings.radiusDivider // om manuellt satt
    ? settings.radiusDivider
    : scaleBasedRadius || Math.round(r2(filteredPoints)); // skala > bounding box

  const handleRadiusChange = (r: number) => {
    let savedVal: number | null = null;
    if (r != 0) {
      savedVal = r;
    }
    updateSettings({ radiusDivider: savedVal });
  };

  /**
   * getMetricValue - return the number for the metric and test type
   * for the designated point
   * @param point - the survey point
   * @param metric - name of the property to return
   * @param testType - if it's an iperf3 result, which one?
   * @returns number
   */
  const getMetricValue = useCallback(
    (
      point: SurveyPoint,
      metric: MeasurementTestType,
      testType?: keyof IperfTestProperty,
    ): number => {
      // console.log(`metric/testType: ${metric} ${testType}`);
      // console.log(`getMetricValue: ${JSON.stringify(point, null, 2)}`);
      switch (metric) {
        case "signalStrength": // data collection always captures both values
          return showSignalStrengthAsPercentage
            ? point.wifiData.signalStrength
            : point.wifiData.rssi;
        case "tcpDownload":
        case "tcpUpload":
        case "udpDownload":
        case "udpUpload":
          return testType
            ? point.iperfData[metric][testType] || 0
            : point.iperfData[metric].bitsPerSecond;
        default:
          return 0;
      }
    },
    [showSignalStrengthAsPercentage, settings.radiusDivider],
  );

  /**
   * generateHeatmapData - from the heatmap's points and criteria
   *   return an array of data points that are
   *   enabled, non-null and non-zero (if iperf results)
   * @param metric - which measurement
   * @param testType - which of the iperf3 test results
   * @returns array of {x, y, value}
   */
  const generateHeatmapData = useCallback(
    (metric: MeasurementTestType, testType?: keyof IperfTestProperty) => {
      const data = filteredPoints
        .filter((p) => p.isEnabled)
        .map((point) => {
          let value = getMetricValue(point, metric, testType);
          switch (metric) {
            case "tcpDownload":
            case "tcpUpload":
            case "udpDownload":
            case "udpUpload":
              if (value == 0) return null;
              break;
            case "signalStrength":
              // Skicka rssi (dBm) direkt — shadern interpolerar i dBm-domänen
              value = point.wifiData.rssi;
          }
          return value !== null ? { x: point.x, y: point.y, value } : null;
        })
        .filter((value) => value !== null); // filter out any values that are null
      return data;
    },
    [filteredPoints, getMetricValue],
  );

  const offScreenContainerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    // Create an off-screen container for heatmap generation
    const container = document.createElement("div");
    container.style.position = "absolute";
    container.style.left = "-9999px";
    container.style.top = "-9999px";
    document.body.appendChild(container);
    offScreenContainerRef.current = container;

    return () => {
      if (offScreenContainerRef.current) {
        document.body.removeChild(offScreenContainerRef.current);
      }
    };
  }, []);

  const formatValue = useCallback(
    (
      value: number,
      metric: MeasurementTestType,
      testType?: keyof IperfTestProperty,
    ): string => {
      return metricFormatter(
        value,
        metric,
        testType,
        showSignalStrengthAsPercentage,
      );
    },
    [showSignalStrengthAsPercentage],
  );

  /**
   * drawMaterialLegend - Rita en liten förklaring av materialfärgerna
   */
  function drawMaterialLegend(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
  ) {
    const materials = Object.entries(MATERIAL_PRESETS);
    const itemHeight = 18;
    const boxSize = 12;
    const spacing = 4;

    ctx.fillStyle = "rgba(255, 255, 255, 0.9)";
    ctx.fillRect(x - 5, y - 5, 180, materials.length * itemHeight + 10);

    ctx.strokeStyle = "#ccc";
    ctx.lineWidth = 1;
    ctx.strokeRect(x - 5, y - 5, 180, materials.length * itemHeight + 10);

    ctx.font = "11px Arial";
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";

    materials.forEach(([_key, preset], idx) => {
      const itemY = y + idx * itemHeight;

      // Color box
      ctx.fillStyle = preset.color;
      ctx.fillRect(x, itemY, boxSize, boxSize);
      ctx.strokeStyle = "#333";
      ctx.lineWidth = 0.5;
      ctx.strokeRect(x, itemY, boxSize, boxSize);

      // Label
      ctx.fillStyle = "#333";
      ctx.fillText(
        `${preset.label} (${preset.attenuationDb} dB)`,
        x + boxSize + spacing,
        itemY + boxSize / 2,
      );
    });
  }

  /**
   * drawColorBar - take the parameters and create the color gradient
   */
  function drawColorBar(
    ctx: CanvasRenderingContext2D,
    w: number,
    h: number,
    x: number,
    y: number,
    min: number,
    max: number,
    metric: MeasurementTestType,
    testType: keyof IperfTestProperty,
  ) {
    const colorBarWidth = 50;
    const colorBarHeight = settings.dimensions.height;
    const colorBarX = settings.dimensions.width + 40;
    const colorBarY = 20;

    // create the gradient by sampling each element in the color bar
    for (let i = 0; i < colorBarHeight; i++) {
      const normalized = (colorBarHeight - i) / colorBarHeight;
      ctx.fillStyle = objectToRGBAString(
        getColorAt(normalized, settings.gradient),
      );
      ctx.fillRect(colorBarX, colorBarY + i, colorBarWidth, 1);
    }

    // define ticks and labels
    const numTicks = 10;
    ctx.fillStyle = "black";
    ctx.font = "14px Arial";
    ctx.textAlign = "left";

    for (let i = 0; i <= numTicks; i++) {
      const y = colorBarY + (colorBarHeight * i) / numTicks;
      const value = max - ((max - min) * i) / numTicks;
      const label = formatValue(value, metric, testType);

      // Draw tick
      ctx.beginPath();
      ctx.moveTo(colorBarX, y);
      ctx.lineTo(colorBarX + 10, y);
      ctx.stroke();

      // Draw label
      ctx.fillText(label, colorBarX + colorBarWidth + 15, y + 5);
    }
  }

  /**
   * getHeatmapRange - scan the array and return the range
   * @param heatmapVals array of readings (number)
   * @param metric - kind of measurement
   * @param asPct - signalStrength as % or dBm
   * @returns both the min and max values
   */
  function getHeatmapRange(
    heatmapVals: number[],
    metric: MeasurementTestType,
    asPct: boolean,
  ): { min: number; max: number } {
    let min, max: number;
    if (metric == "signalStrength") {
      if (asPct) {
        max = 100;
        min = 0;
      } else {
        max = -40;
        min = -100;
      }
    } else {
      max = Math.max(...heatmapVals);
      min = Math.min(...heatmapVals);
    }
    return { min, max };
  }
  /**
   * renderHeatmap - top-level code to draw a single heat map
   *   including floor plan, scale on the side, and the heat map
   *   or diagnostic info about why it wasn't drawn
   * @param metric - signalStrength or one of the iperf3 tests
   * @param testType - which of the iperf3 tests
   * @returns none - result is that heat map has been drawn
   */
  const renderHeatmap = useCallback(
    (
      metric: MeasurementTestType,
      testType: keyof IperfTestProperty,
    ): Promise<string | null> => {
      return (async () => {
        if (
          settings.dimensions.width === 0 ||
          settings.dimensions.height === 0 ||
          !offScreenContainerRef.current
        ) {
          logger.error(
            "Image dimensions not set or off-screen container not available",
          );
          return null;
        }

        const colorBarWidth = 50;
        const labelWidth = 150;
        const canvasRightPadding = 20;

        const outputCanvas = document.createElement("canvas");
        outputCanvas.width =
          settings.dimensions.width +
          colorBarWidth +
          labelWidth +
          canvasRightPadding;
        outputCanvas.height = settings.dimensions.height + 40;

        const ctx = outputCanvas.getContext("2d", { willReadFrequently: true });
        if (!ctx) {
          logger.error("Failed to get 2D context");
          return null;
        }

        ctx.fillStyle = "white";
        ctx.fillRect(0, 0, outputCanvas.width, outputCanvas.height);

        // get an array of the enabled, non-null points to be plotted
        const heatmapData = generateHeatmapData(metric, testType);
        const heatmapValues = heatmapData.map((p) => p.value);

        const { min, max } = getHeatmapRange(
          heatmapValues,
          metric,
          showSignalStrengthAsPercentage,
        );

        const glCanvas = document.createElement("canvas");
        glCanvas.width = settings.dimensions.width;
        glCanvas.height = settings.dimensions.height;

        const wallsForRender = settings.walls || [];
        console.log(
          `[Heatmap] Rendering with ${wallsForRender.length} walls, dims: ${settings.dimensions.width}x${settings.dimensions.height}, points: ${heatmapData.length}`,
        );
        if (wallsForRender.length > 0) {
          console.log(`[Heatmap] First wall:`, wallsForRender[0]);
        }

        const renderer = createHeatmapWebGLRenderer(
          glCanvas,
          heatmapData,
          settings.gradient,
          wallsForRender,
        );
        await renderer.render({
          points: heatmapData,
          influenceRadius: settings.radiusDivider || displayedRadius,
          maxOpacity: settings.maxOpacity,
          minOpacity: settings.minOpacity,
          backgroundImageSrc: settings.floorplanImagePath,
          width: settings.dimensions.width,
          height: settings.dimensions.height,
          blur: settings.blur ?? 0,
          pixelsPerMeter: settings.pixelsPerMeter,
        });

        ctx.drawImage(glCanvas, 0, 20);

        // Rita väggar ovanpå heatmappen med materialfärger och tjocklek
        if (showWalls && settings.walls && settings.walls.length > 0) {
          ctx.save();
          ctx.translate(0, 20);
          for (const wall of settings.walls) {
            const preset = MATERIAL_PRESETS[wall.material || "drywall"];
            ctx.strokeStyle = preset.color;
            ctx.lineWidth = preset.thickness;
            ctx.lineCap = "round";
            ctx.beginPath();
            ctx.moveTo(wall.x1, wall.y1);
            ctx.lineTo(wall.x2, wall.y2);
            ctx.stroke();
          }
          ctx.restore();
        }

        if (!heatmapData || heatmapData.length === 0) {
          const lines = ["No heatmap:", `${metric} tests`, "not performed"];
          ctx.textAlign = "center";
          ctx.font = "72px sans-serif";

          let maxWidth = 0;
          let totalHeight = 0;
          const lineSpacing = 4;

          for (const line of lines) {
            const metrics = ctx.measureText(line);
            const lineHeight =
              metrics.actualBoundingBoxAscent +
              metrics.actualBoundingBoxDescent;
            maxWidth = Math.max(maxWidth, metrics.width);
            totalHeight += lineHeight + lineSpacing;
          }
          totalHeight += lineSpacing * 4;

          if (maxWidth > settings.dimensions.width * 0.9) {
            const optimalFontSize = (72 * settings.dimensions.width) / maxWidth;
            ctx.font = `${optimalFontSize}px sans-serif`;
          }

          ctx.fillStyle = "rgba(255, 255,255, 0.9)";
          ctx.fillRect(
            settings.dimensions.width / 2 - maxWidth / 2 + 5,
            (settings.dimensions.height * 2) / 3 - 72 + lineSpacing + 5,
            maxWidth,
            totalHeight,
          );

          ctx.fillStyle = "black";
          lines.forEach((line, index) => {
            ctx.fillText(
              line,
              settings.dimensions.width / 2,
              (settings.dimensions.height * 2) / 3 + index * 72,
            );
          });
        }

        drawColorBar(
          ctx,
          50,
          settings.dimensions.height,
          settings.dimensions.width + 40,
          20,
          min,
          max,
          metric,
          testType,
        );

        // Rita materiallegend
        if (showWalls) {
          drawMaterialLegend(
            ctx,
            settings.dimensions.width + 40,
            20 + settings.dimensions.height + 40,
          );
        }

        return outputCanvas.toDataURL();
      })();
    },
    [
      settings.dimensions,
      generateHeatmapData,
      settings.floorplanImagePath,
      settings,
    ],
  );

  const generateAllHeatmaps = useCallback(async () => {
    const newHeatmaps: { [key: string]: string | null } = {};
    for (const metric of selectedMetrics) {
      if (metric === "signalStrength") {
        newHeatmaps[metric] = await renderHeatmap(metric, "signalStrength");
      } else {
        const availableProperties = getAvailableProperties(metric);
        for (const testType of selectedProperties) {
          if (availableProperties.includes(testType)) {
            const heatmapData = generateHeatmapData(metric, testType);
            if (heatmapData) {
              newHeatmaps[`${metric}-${testType}`] = await renderHeatmap(
                metric,
                testType,
              );
            }
          }
        }
      }
    }
    setHeatmaps(newHeatmaps);
  }, [
    renderHeatmap,
    selectedMetrics,
    selectedProperties,
    generateHeatmapData,
    settings.walls,
  ]);

  const openHeatmapModal = (src: string, alt: string) => {
    setSelectedHeatmap({ src, alt });
  };

  const closeHeatmapModal = () => {
    setSelectedHeatmap(null);
  };

  useEffect(() => {
    if (settings.dimensions.width > 0 && settings.dimensions.height > 0) {
      generateAllHeatmaps();
    }
  }, [
    settings.dimensions,
    generateAllHeatmaps,
    points,
    selectedMetrics,
    selectedProperties,
    showSignalStrengthAsPercentage,
    bandFilter,
  ]);

  const toggleMetric = (metric: MeasurementTestType) => {
    setSelectedMetrics((prev) => {
      const newMetrics = prev.includes(metric)
        ? prev.filter((m) => m !== metric)
        : [...prev, metric];
      return newMetrics.sort(
        (a, b) =>
          Object.values(testTypes).indexOf(a) -
          Object.values(testTypes).indexOf(b),
      );
    });
  };

  const toggleProperty = (property: keyof IperfTestProperty) => {
    setSelectedProperties((prev) => {
      const newProperties = prev.includes(property)
        ? prev.filter((p) => p !== property)
        : [...prev, property];
      return newProperties.sort(
        (a, b) =>
          Object.values(testProperties).indexOf(a) -
          Object.values(testProperties).indexOf(b),
      );
    });
  };

  return (
    <div>
      <div className="mb-4">
        <h3 className="text-sm font-semibold text-gray-700 mb-2">
          Select Metrics
        </h3>
        <div className="flex flex-wrap gap-4">
          {Object.values(testTypes).map((metric) => (
            <div key={metric} className="flex items-center space-x-2">
              <Checkbox
                id={`metric-${metric}`}
                checked={selectedMetrics.includes(metric)}
                onCheckedChange={() => toggleMetric(metric)}
              />
              <Label
                htmlFor={`metric-${metric}`}
                className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
              >
                {metricTitles[metric]}
              </Label>
            </div>
          ))}
        </div>
      </div>

      <div className="mb-6">
        <h3 className="text-sm font-semibold text-gray-700 mb-2">
          Select Properties
        </h3>
        <div className="flex flex-wrap gap-4">
          {Object.values(testProperties)
            .filter((property) => property != "signalStrength")
            .map((property) => (
              <div key={property} className="flex items-center space-x-2">
                <Checkbox
                  id={`property-${property}`}
                  checked={selectedProperties.includes(property)}
                  onCheckedChange={() => toggleProperty(property)}
                />
                <Label
                  htmlFor={`property-${property}`}
                  className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                >
                  {propertyTitles[property]}
                </Label>
              </div>
            ))}
        </div>
      </div>

      <HeatmapSlider value={displayedRadius} onChange={handleRadiusChange} />

      {/* Band-toggle — visas bara om dual-band data finns */}
      {hasDualBandData && (
        <div className="mb-4">
          <h3 className="text-sm font-semibold text-gray-700 mb-2">
            Band Filter
          </h3>
          <div className="flex gap-2">
            {(["2.4", "5", "combined"] as const).map((band) => (
              <button
                key={band}
                onClick={() => setBandFilter(band)}
                className={`px-3 py-1.5 text-xs font-medium rounded-sm border transition-colors ${
                  bandFilter === band
                    ? "bg-gray-900 text-white border-gray-900"
                    : "bg-white text-gray-600 border-gray-300 hover:bg-gray-100"
                }`}
              >
                {band === "combined" ? "Combined" : `${band} GHz`}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {selectedMetrics.map((metric) => (
          <div key={metric} className="bg-gray-50 p-4 rounded-lg">
            <h3 className="text-sm font-semibold text-gray-700 mb-3">
              {metricTitles[metric]}
            </h3>
            {metric === "signalStrength" ? (
              heatmaps[metric] && (
                <div>
                  <div className="mb-4 flex items-center space-x-2">
                    <Switch
                      id="signal-strength-percentage"
                      checked={showSignalStrengthAsPercentage}
                      onCheckedChange={setShowSignalStrengthAsPercentage}
                    />
                    <Label
                      htmlFor="signal-strength-percentage"
                      className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                    >
                      Show Signal Strength as Percentage
                    </Label>
                  </div>
                  <HeatmapImage
                    src={heatmaps[metric]}
                    alt={`Heatmap for ${metricTitles[metric]}`}
                    onClick={() =>
                      openHeatmapModal(
                        heatmaps[metric]!,
                        `Heatmap for ${metricTitles[metric]}`,
                      )
                    }
                  />
                </div>
              )
            ) : (
              <div className="space-y-4">
                {selectedProperties.map((testType) => {
                  const heatmap = heatmaps[`${metric}-${testType}`];
                  if (!heatmap) {
                    return null;
                  }
                  const alt = `Heatmap for ${metricTitles[metric]} - ${propertyTitles[testType]}`;
                  return (
                    <div key={`${metric}-${testType}`}>
                      <h4 className="text-sm font-medium mb-2 text-gray-600">
                        {propertyTitles[testType]}
                      </h4>
                      <HeatmapImage
                        src={heatmap}
                        alt={alt}
                        onClick={() => openHeatmapModal(heatmap, alt)}
                      />
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        ))}
      </div>

      <HeatmapModal
        src={selectedHeatmap?.src ?? ""}
        alt={selectedHeatmap?.alt ?? ""}
        open={selectedHeatmap !== null}
        onClose={closeHeatmapModal}
      />
    </div>
  );
}

/**
 * Hook som genererar en heatmap-overlay (signal strength) som dataURL.
 * Används i Survey-fliken för att visa heatmap ovanpå planritningen.
 */
export function useHeatmapOverlay(): string | null {
  const { settings } = useSettings();
  const [overlayUrl, setOverlayUrl] = useState<string | null>(null);

  const points = settings.surveyPoints;
  const r2 = calculateRadiusByBoundingBox;

  // Beräkna radie baserat på skala om kalibrerad
  const isCalibrated =
    settings.pixelsPerMeter > 0 && settings.pixelsPerMeter !== 10;
  const DEFAULT_RADIUS_METERS = 8;
  const scaleBasedRadius = isCalibrated
    ? Math.round(DEFAULT_RADIUS_METERS * settings.pixelsPerMeter)
    : null;

  const displayedRadius = settings.radiusDivider
    ? settings.radiusDivider
    : scaleBasedRadius || Math.round(r2(points));

  useEffect(() => {
    if (
      settings.dimensions.width === 0 ||
      settings.dimensions.height === 0 ||
      points.length === 0
    ) {
      setOverlayUrl(null);
      return;
    }

    // Generera heatmap-data (signal strength som dBm för korrekt interpolation)
    const heatmapData = points
      .filter((p) => p.isEnabled)
      .map((point) => {
        const value = point.wifiData.rssi;
        return value !== null ? { x: point.x, y: point.y, value } : null;
      })
      .filter((v) => v !== null);

    if (heatmapData.length === 0) {
      setOverlayUrl(null);
      return;
    }

    let cancelled = false;

    const generate = async () => {
      const glCanvas = document.createElement("canvas");
      glCanvas.width = settings.dimensions.width;
      glCanvas.height = settings.dimensions.height;

      const renderer = createHeatmapWebGLRenderer(
        glCanvas,
        heatmapData,
        settings.gradient,
        settings.walls || [],
      );
      await renderer.render({
        points: heatmapData,
        influenceRadius: displayedRadius,
        maxOpacity: settings.maxOpacity,
        minOpacity: settings.minOpacity,
        width: settings.dimensions.width,
        height: settings.dimensions.height,
        blur: settings.blur ?? 0,
        pixelsPerMeter: settings.pixelsPerMeter,
      });

      if (!cancelled) {
        setOverlayUrl(glCanvas.toDataURL());
      }
    };

    generate();

    return () => {
      cancelled = true;
    };
  }, [
    points,
    settings.dimensions,
    settings.gradient,
    settings.walls,
    settings.maxOpacity,
    settings.minOpacity,
    settings.blur,
    settings.radiusDivider,
    displayedRadius,
  ]);

  return overlayUrl;
}
