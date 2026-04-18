/**
 * wifi-heatmapper file storage
 *
 * Survey data is stored as JSON files in data/surveys/
 * Each site has its own file: data/surveys/<siteName>.json
 *
 * - readSettingsFromFile(fileName) reads the settings for a site/floorplan
 *   - Returns null if the file doesn't exist (caller should provide defaults)
 *
 * - writeSettingsToFile(settings) saves settings to a file
 *   - The filename is derived from settings.site.name or settings.floorplanImageName
 *   - Sensitive data (sudoerPassword) is stripped before saving
 */

import { HeatmapSettings } from "./types";

export async function readSettingsFromFile(
  fileName: string,
): Promise<any | null> {
  try {
    if (!fileName) {
      return null;
    }

    const response = await fetch(
      `/api/settings?name=${encodeURIComponent(fileName)}`,
    );

    if (response.status === 404) {
      return null; // Survey doesn't exist yet
    }

    if (!response.ok) {
      console.error("Error reading settings:", await response.text());
      return null;
    }

    const parsedData = await response.json();

    // Migration: Earlier versions used iperfResults instead of iperfData
    // Check both top-level surveyPoints and per-floor surveyPoints
    const migrateIperfResults = (points: any[]) => {
      if (points?.[0]?.iperfResults !== undefined) {
        for (const point of points) {
          point.iperfData = point.iperfResults;
          delete point.iperfResults;
        }
      }
    };

    // Migrate top-level surveyPoints (old format)
    migrateIperfResults(parsedData.surveyPoints);

    // Migrate per-floor surveyPoints (new format)
    if (parsedData.site?.floors) {
      for (const floor of parsedData.site.floors) {
        migrateIperfResults(floor.surveyPoints);
      }
    }

    return parsedData;
  } catch (error) {
    console.error("Error reading settings:", error);
    return null;
  }
}

export async function writeSettingsToFile(
  settings: HeatmapSettings,
): Promise<void> {
  try {
    const response = await fetch("/api/settings", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(settings),
    });

    const fileName = settings.site?.name || settings.floorplanImageName;

    if (!response.ok) {
      console.error(
        `[wifi-heatmapper] Failed to save settings for "${fileName}":`,
        response.status,
        response.statusText,
        await response.text(),
      );
    }
  } catch (error) {
    const fileName = settings.site?.name || settings.floorplanImageName;
    console.error(
      `[wifi-heatmapper] Failed to save settings for "${fileName}":`,
      error,
    );
  }
}

/**
 * Läs globala settings från /api/global-settings.
 * Returnerar tomt objekt om filen inte finns.
 */
export async function readGlobalSettings(): Promise<Record<string, unknown>> {
  try {
    const response = await fetch("/api/global-settings");
    if (!response.ok) return {};
    return await response.json();
  } catch {
    return {};
  }
}

/**
 * Spara globala settings till /api/global-settings.
 */
export async function writeGlobalSettings(
  globals: Record<string, unknown>,
): Promise<void> {
  try {
    await fetch("/api/global-settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(globals),
    });
  } catch (error) {
    console.error("[wifi-heatmapper] Failed to save global settings:", error);
  }
}

/**
 * List all available survey/site files
 */
export async function listSurveys(): Promise<string[]> {
  try {
    const response = await fetch("/api/settings?list=true");
    if (!response.ok) return [];
    const data = await response.json();
    return data.surveys || [];
  } catch {
    return [];
  }
}
