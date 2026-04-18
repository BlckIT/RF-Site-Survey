"use client";

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useRef,
  useCallback,
  ReactNode,
} from "react";
import { readSettingsFromFile, writeSettingsToFile } from "../lib/fileHandler";
import {
  hasLocalStorageData,
  hasMigrated,
  migrateLocalStorageToFiles,
} from "../lib/localStorageMigration";
import { toast } from "./ui/use-toast";
import {
  HeatmapSettings,
  Floor,
  Site,
  SurveyPoint,
  SurveyPointActions,
  KnownWifi,
  DualBandConfig,
} from "../lib/types";
import { join } from "path";

// ── Helpers ──

function createEmptyFloor(
  name: string,
  imageName: string = "",
  imagePath: string = "",
): Floor {
  return {
    name,
    floorplanImageName: imageName,
    floorplanImagePath: imagePath,
    dimensions: { width: 100, height: 100 },
    walls: [],
    surveyPoints: [],
    pixelsPerMeter: 10,
    nextPointNum: 1,
  };
}

function createEmptySite(name: string): Site {
  return {
    name,
    floors: [createEmptyFloor("Floor 1")],
    activeFloorIndex: 0,
  };
}

function getActiveFloor(site: Site): Floor {
  const idx = Math.min(site.activeFloorIndex, site.floors.length - 1);
  return site.floors[Math.max(0, idx)] || createEmptyFloor("Floor 1");
}

/**
 * Build a HeatmapSettings object from a Site + global settings.
 * The floor-specific fields are computed from the active floor.
 */
function buildSettings(
  site: Site,
  globals: Omit<
    HeatmapSettings,
    | "site"
    | "surveyPoints"
    | "floorplanImageName"
    | "floorplanImagePath"
    | "nextPointNum"
    | "dimensions"
    | "walls"
    | "pixelsPerMeter"
    | "rotation"
  >,
): HeatmapSettings {
  const floor = getActiveFloor(site);
  return {
    ...globals,
    site,
    // Backward-compat computed fields from active floor
    surveyPoints: floor.surveyPoints,
    floorplanImageName: floor.floorplanImageName,
    floorplanImagePath: floor.floorplanImagePath,
    nextPointNum: floor.nextPointNum,
    dimensions: floor.dimensions,
    walls: floor.walls,
    pixelsPerMeter: floor.pixelsPerMeter,
    rotation: floor.rotation ?? 0,
  };
}

/**
 * Extract global settings from a HeatmapSettings object (strip floor-specific + site).
 */
function extractGlobals(settings: HeatmapSettings) {
  return {
    iperfServerAdrs: settings.iperfServerAdrs,
    testDuration: settings.testDuration,
    sudoerPassword: settings.sudoerPassword,
    apMapping: settings.apMapping,
    radiusDivider: settings.radiusDivider,
    maxOpacity: settings.maxOpacity,
    minOpacity: settings.minOpacity,
    blur: settings.blur,
    gradient: settings.gradient,
    iperfCommands: settings.iperfCommands,
    wifiInterface: settings.wifiInterface,
    targetSSID: settings.targetSSID,
    snapRadius: settings.snapRadius,
    knownWifiNetworks: settings.knownWifiNetworks,
    dualBand: settings.dualBand,
  };
}

const DEFAULT_GLOBALS = {
  iperfServerAdrs: "localhost",
  testDuration: 1,
  sudoerPassword: "",
  apMapping: [] as HeatmapSettings["apMapping"],
  radiusDivider: null as number | null,
  maxOpacity: 0.7,
  minOpacity: 0.2,
  blur: 0.99,
  gradient: {
    0: "rgba(255, 0, 0, 0.6)",
    0.45: "rgba(255, 255, 0, 0.6)",
    0.5: "rgba(0, 0, 255, 0.6)",
    0.6: "rgba(0, 255, 255, 0.6)",
    0.75: "rgba(0, 255, 0, 0.6)",
    0.9: "rgba(0, 255, 0, 0.6)",
    1.0: "rgba(0, 255, 0, 0.6)",
  } as HeatmapSettings["gradient"],
  iperfCommands: {
    tcpDownload: "iperf3 -c {server} {port} -t {duration} -R -J",
    tcpUpload: "iperf3 -c {server} {port} -t {duration} -J",
    udpDownload: "iperf3 -c {server} {port} -t {duration} -R -u -b 100M -J",
    udpUpload: "iperf3 -c {server} {port} -t {duration} -u -b 100M -J",
  },
  wifiInterface: "",
  targetSSID: "",
  snapRadius: 8,
  knownWifiNetworks: [] as KnownWifi[],
  dualBand: {
    enabled: false,
    mode: "sequential",
  } as DualBandConfig,
};

/**
 * getDefaults()
 * @param floorPlan - desired floor plan, or "" if unknown
 * @returns Set of default settings for that floor plan
 */
export const getDefaults = (floorPlan: string): HeatmapSettings => {
  const imagePath = floorPlan ? join("/media", floorPlan) : "";
  const floor = createEmptyFloor("Floor 1", floorPlan, imagePath);
  const site: Site = {
    name: floorPlan ? floorPlan.replace(/\.[^.]+$/, "") : "New Site",
    floors: [floor],
    activeFloorIndex: 0,
  };
  return buildSettings(site, DEFAULT_GLOBALS);
};

/**
 * Migrate old flat JSON (no `site` property) to the new Site model.
 */
function migrateOldFormat(data: any, fileName: string): HeatmapSettings {
  const floorName = "Floor 1";
  const imageName = data.floorplanImageName || fileName;
  const imagePath =
    data.floorplanImagePath || (imageName ? join("/media", imageName) : "");

  const floor: Floor = {
    name: floorName,
    floorplanImageName: imageName,
    floorplanImagePath: imagePath,
    dimensions: data.dimensions || { width: 100, height: 100 },
    walls: data.walls || [],
    surveyPoints: data.surveyPoints || [],
    pixelsPerMeter: data.pixelsPerMeter || 10,
    nextPointNum: data.nextPointNum || 1,
  };

  const site: Site = {
    name: fileName.replace(/\.[^.]+$/, "") || "Migrated Site",
    floors: [floor],
    activeFloorIndex: 0,
  };

  const globals = {
    iperfServerAdrs: data.iperfServerAdrs ?? DEFAULT_GLOBALS.iperfServerAdrs,
    testDuration: data.testDuration ?? DEFAULT_GLOBALS.testDuration,
    sudoerPassword: "",
    apMapping: data.apMapping ?? DEFAULT_GLOBALS.apMapping,
    radiusDivider: data.radiusDivider ?? DEFAULT_GLOBALS.radiusDivider,
    maxOpacity: data.maxOpacity ?? DEFAULT_GLOBALS.maxOpacity,
    minOpacity: data.minOpacity ?? DEFAULT_GLOBALS.minOpacity,
    blur: data.blur ?? DEFAULT_GLOBALS.blur,
    gradient: data.gradient ?? DEFAULT_GLOBALS.gradient,
    iperfCommands: data.iperfCommands ?? DEFAULT_GLOBALS.iperfCommands,
    wifiInterface: data.wifiInterface ?? DEFAULT_GLOBALS.wifiInterface,
    targetSSID: data.targetSSID ?? DEFAULT_GLOBALS.targetSSID,
    snapRadius: data.snapRadius ?? DEFAULT_GLOBALS.snapRadius,
    knownWifiNetworks:
      data.knownWifiNetworks ?? DEFAULT_GLOBALS.knownWifiNetworks,
    dualBand: data.dualBand ?? DEFAULT_GLOBALS.dualBand,
  };

  return buildSettings(site, globals);
}

// ── Context ──

interface SettingsContextType {
  settings: HeatmapSettings;
  updateSettings: (newSettings: Partial<HeatmapSettings>) => void;
  surveyPointActions: SurveyPointActions;
  // Site/floor management
  loadSite: (siteName: string) => void;
  createSite: (name: string) => void;
  deleteSite: (siteName: string) => Promise<void>;
  renameSite: (newName: string) => void;
  // Floor management
  addFloor: (name: string, imageName: string) => void;
  removeFloor: (index: number) => void;
  setActiveFloor: (index: number) => void;
  renameFloor: (index: number, name: string) => void;
  updateFloorImage: (index: number, imageName: string) => void;
  updateActiveFloor: (partial: Partial<Floor>) => void;
}

const SettingsContext = createContext<SettingsContextType | undefined>(
  undefined,
);

export function useSettings() {
  const context = useContext(SettingsContext);
  if (!context)
    throw new Error("useSettings must be used within a SettingsProvider");
  return context;
}

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<HeatmapSettings>(getDefaults(""));
  const [currentSiteName, setCurrentSiteName] = useState<string>("");
  const migrationDone = useRef(false);
  const defaultFloorPlan = "Planritning_nybyggnad";

  // Load settings (and migrate on first run)
  useEffect(() => {
    async function loadSettings() {
      // One-time migration from localStorage
      if (!migrationDone.current) {
        if (hasLocalStorageData() && !hasMigrated()) {
          console.log("Migrating localStorage data to file-based storage...");
          const count = await migrateLocalStorageToFiles();
          console.log(`Migration complete. Migrated ${count} survey(s).`);
          if (count > 0) {
            toast({
              title: "Survey data migrated",
              description: `Migrated ${count} survey(s) from browser storage to data/surveys/. Your data is now stored as JSON files.`,
            });
          }
        }
        migrationDone.current = true;
      }

      // Load settings for current site
      const fileToLoad = currentSiteName || defaultFloorPlan;
      const rawData = await readSettingsFromFile(fileToLoad);

      if (rawData) {
        const defaults = getDefaults(fileToLoad);
        let mergedSettings: HeatmapSettings;

        if (rawData.site) {
          // New format — has site property
          const globals = {
            ...extractGlobals(defaults),
            ...extractGlobals(rawData as HeatmapSettings),
          };
          globals.sudoerPassword = "";
          mergedSettings = buildSettings(rawData.site, globals);
        } else {
          // Old format — migrate
          mergedSettings = migrateOldFormat(rawData, fileToLoad);
        }
        setSettings(mergedSettings);
      } else {
        const defaults = getDefaults(fileToLoad);
        writeSettingsToFile(defaults);
        setSettings(defaults);
      }
    }
    loadSettings();
  }, [currentSiteName]);

  const loadSite = useCallback((siteName: string) => {
    setCurrentSiteName(siteName);
  }, []);

  // ── Save helper ──
  const saveSettings = useCallback((updated: HeatmapSettings) => {
    setSettings(updated);
    writeSettingsToFile(updated);
  }, []);

  // ── updateSettings — backward-compatible partial update ──
  const updateSettings = useCallback(
    (newSettings: Partial<HeatmapSettings>) => {
      setSettings((prev) => {
        // Separate floor-specific fields from global fields
        const floorFields: (keyof Floor)[] = [
          "surveyPoints",
          "floorplanImageName",
          "floorplanImagePath",
          "nextPointNum",
          "dimensions",
          "walls",
          "pixelsPerMeter",
          "rotation",
        ];

        const floorUpdates: Partial<Floor> = {};
        const globalUpdates: Partial<HeatmapSettings> = {};
        let siteUpdate: Site | undefined;

        for (const [key, value] of Object.entries(newSettings)) {
          if (key === "site") {
            siteUpdate = value as Site;
          } else if (floorFields.includes(key as keyof Floor)) {
            (floorUpdates as any)[key] = value;
            // Also map floorplanImageName -> name mapping
            if (key === "floorplanImageName") {
              floorUpdates.floorplanImageName = value as string;
              floorUpdates.floorplanImagePath = value
                ? join("/media", value as string)
                : "";
            }
          } else {
            (globalUpdates as any)[key] = value;
          }
        }

        // Build updated site
        let updatedSite = siteUpdate || { ...prev.site };
        if (!siteUpdate && Object.keys(floorUpdates).length > 0) {
          const idx = Math.min(
            updatedSite.activeFloorIndex,
            updatedSite.floors.length - 1,
          );
          const safeIdx = Math.max(0, idx);
          const updatedFloors = [...updatedSite.floors];
          updatedFloors[safeIdx] = {
            ...updatedFloors[safeIdx],
            ...floorUpdates,
          };
          updatedSite = { ...updatedSite, floors: updatedFloors };
        }

        // Only override globals that were explicitly passed in
        const prevGlobals = extractGlobals(prev);
        const overrides = Object.fromEntries(
          Object.entries(globalUpdates).filter(([, v]) => v !== undefined),
        );
        const updatedSettings = buildSettings(updatedSite, {
          ...prevGlobals,
          ...overrides,
        });

        writeSettingsToFile(updatedSettings);
        return updatedSettings;
      });
    },
    [],
  );

  // ── Site management ──
  const createSite = useCallback(
    (name: string) => {
      const site = createEmptySite(name);
      const newSettings = buildSettings(site, DEFAULT_GLOBALS);
      saveSettings(newSettings);
      setCurrentSiteName(name);
    },
    [saveSettings],
  );

  const deleteSite = useCallback(async (siteName: string) => {
    try {
      await fetch(
        `/api/settings?name=${encodeURIComponent(siteName)}&action=delete`,
        {
          method: "DELETE",
        },
      );
    } catch (err) {
      console.error("Failed to delete site:", err);
    }
  }, []);

  const renameSite = useCallback((newName: string) => {
    setSettings((prev) => {
      const updatedSite = { ...prev.site, name: newName };
      const updated = buildSettings(updatedSite, extractGlobals(prev));
      writeSettingsToFile(updated);
      return updated;
    });
  }, []);

  // ── Floor management ──
  const addFloor = useCallback((name: string, imageName: string) => {
    setSettings((prev) => {
      const imagePath = imageName ? join("/media", imageName) : "";
      const newFloor = createEmptyFloor(name, imageName, imagePath);
      const newFloors = [...prev.site.floors, newFloor];
      const updatedSite: Site = {
        ...prev.site,
        floors: newFloors,
        activeFloorIndex: newFloors.length - 1,
      };
      const updated = buildSettings(updatedSite, extractGlobals(prev));
      writeSettingsToFile(updated);
      return updated;
    });
  }, []);

  const removeFloor = useCallback((index: number) => {
    setSettings((prev) => {
      if (prev.site.floors.length <= 1) return prev; // Don't remove last floor
      const newFloors = prev.site.floors.filter((_, i) => i !== index);
      let newActiveIndex = prev.site.activeFloorIndex;
      if (newActiveIndex >= newFloors.length) {
        newActiveIndex = newFloors.length - 1;
      }
      const updatedSite: Site = {
        ...prev.site,
        floors: newFloors,
        activeFloorIndex: newActiveIndex,
      };
      const updated = buildSettings(updatedSite, extractGlobals(prev));
      writeSettingsToFile(updated);
      return updated;
    });
  }, []);

  const setActiveFloor = useCallback((index: number) => {
    setSettings((prev) => {
      if (index < 0 || index >= prev.site.floors.length) return prev;
      const updatedSite: Site = { ...prev.site, activeFloorIndex: index };
      const updated = buildSettings(updatedSite, extractGlobals(prev));
      writeSettingsToFile(updated);
      return updated;
    });
  }, []);

  const renameFloor = useCallback((index: number, name: string) => {
    setSettings((prev) => {
      const newFloors = [...prev.site.floors];
      newFloors[index] = { ...newFloors[index], name };
      const updatedSite: Site = { ...prev.site, floors: newFloors };
      const updated = buildSettings(updatedSite, extractGlobals(prev));
      writeSettingsToFile(updated);
      return updated;
    });
  }, []);

  const updateFloorImage = useCallback((index: number, imageName: string) => {
    setSettings((prev) => {
      const imagePath = imageName ? join("/media", imageName) : "";
      const newFloors = [...prev.site.floors];
      newFloors[index] = {
        ...newFloors[index],
        floorplanImageName: imageName,
        floorplanImagePath: imagePath,
      };
      const updatedSite: Site = { ...prev.site, floors: newFloors };
      const updated = buildSettings(updatedSite, extractGlobals(prev));
      writeSettingsToFile(updated);
      return updated;
    });
  }, []);

  const updateActiveFloor = useCallback((partial: Partial<Floor>) => {
    setSettings((prev) => {
      const idx = prev.site.activeFloorIndex;
      const newFloors = [...prev.site.floors];
      newFloors[idx] = { ...newFloors[idx], ...partial };
      const updatedSite: Site = { ...prev.site, floors: newFloors };
      const updated = buildSettings(updatedSite, extractGlobals(prev));
      writeSettingsToFile(updated);
      return updated;
    });
  }, []);

  // ── SurveyPoint actions ──
  const surveyPointActions: SurveyPointActions = {
    add: (newPoint: SurveyPoint) => {
      const newPoints = [...settings.surveyPoints, newPoint];
      updateSettings({ surveyPoints: newPoints });
    },
    update: (thePoint: SurveyPoint, updatedData: object) => {
      const newPoints = settings.surveyPoints.map((point) =>
        point.id === thePoint.id ? { ...point, ...updatedData } : point,
      );
      updateSettings({ surveyPoints: newPoints });
    },
    delete: (points: SurveyPoint[]) => {
      const pointsToRemove = new Set(points.map((point) => point.id));
      const newPoints = settings.surveyPoints.filter(
        (point) => !pointsToRemove.has(point.id),
      );
      updateSettings({ surveyPoints: newPoints });
    },
  };

  return (
    <SettingsContext.Provider
      value={{
        settings,
        updateSettings,
        surveyPointActions,
        loadSite,
        createSite,
        deleteSite,
        renameSite,
        addFloor,
        removeFloor,
        setActiveFloor,
        renameFloor,
        updateFloorImage,
        updateActiveFloor,
      }}
    >
      {children}
    </SettingsContext.Provider>
  );
}
