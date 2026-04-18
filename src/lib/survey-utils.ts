/**
 * Delade survey-filverktyg för alla API-routes.
 * Separerad från server-utils.ts (som har "use server") för att
 * kunna exportera icke-async värden.
 */
import { readFile, readdir, stat } from "fs/promises";
import path from "path";
import { sanitizeFilename } from "./utils";

export const SURVEYS_DIR = path.join(process.cwd(), "data", "surveys");

/**
 * Hämta sökväg för en survey-fil baserat på namn.
 */
export function getSurveyPath(name: string): string {
  return path.join(SURVEYS_DIR, `${sanitizeFilename(name)}.json`);
}

/**
 * Hitta survey-fil via namn — matchar både filnamn och site.name i JSON-innehållet.
 * Delad utility som används av alla API-routes.
 */
export async function findSurveyFile(name: string): Promise<string | null> {
  // 1. Försök direkt filnamn
  const directPath = getSurveyPath(name);
  try {
    await stat(directPath);
    return directPath;
  } catch {
    // Inte hittad via direkt filnamn
  }

  // 2. Sök igenom alla filer och matcha site.name
  try {
    const files = await readdir(SURVEYS_DIR);
    for (const f of files.filter((f) => f.endsWith(".json"))) {
      const filePath = path.join(SURVEYS_DIR, f);
      try {
        const content = await readFile(filePath, "utf-8");
        const data = JSON.parse(content);
        if (data.site?.name === name) return filePath;
      } catch {
        continue;
      }
    }
  } catch {
    // Katalogen finns inte
  }
  return null;
}
