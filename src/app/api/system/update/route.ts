/**
 * /api/system/update — Kolla och kör uppdateringar via git
 *
 * GET  — Returnerar om det finns nya commits på remote dev-branchen
 * POST — Kör git pull, npm install, npm run build, pm2 restart
 */
import { NextResponse } from "next/server";
import { execFile } from "child_process";
import { promisify } from "util";

const execFileAsync = promisify(execFile);

const PROJECT_ROOT = process.cwd();

/**
 * Detektera rätt remote-namn — föredra "blckit", annars "origin"
 */
async function detectRemote(): Promise<string> {
  try {
    const { stdout } = await execFileAsync("git", ["remote"], {
      cwd: PROJECT_ROOT,
      timeout: 5000,
    });
    const remotes = stdout.trim().split("\n");
    return remotes.includes("blckit") ? "blckit" : "origin";
  } catch {
    return "origin";
  }
}

/**
 * Kör ett git-kommando i projektroten
 */
async function git(
  args: string[],
  timeout = 15000,
): Promise<{ stdout: string; stderr: string }> {
  return execFileAsync("git", args, { cwd: PROJECT_ROOT, timeout });
}

/**
 * GET — Kolla om uppdatering finns
 */
export async function GET() {
  try {
    const remote = await detectRemote();
    const branch = "dev";
    const ref = `${remote}/${branch}`;

    // Hämta senaste från remote
    try {
      await git(["fetch", remote, branch], 15000);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      return NextResponse.json(
        { error: "Git fetch failed", details: msg },
        { status: 500 },
      );
    }

    // Antal commits vi ligger efter
    const { stdout: countStr } = await git([
      "rev-list",
      `HEAD..${ref}`,
      "--count",
    ]);
    const behindCount = parseInt(countStr.trim(), 10) || 0;

    // Commit-lista (max 20)
    let commits: string[] = [];
    if (behindCount > 0) {
      const { stdout: logStr } = await git([
        "log",
        `HEAD..${ref}`,
        "--oneline",
        "--max-count=20",
      ]);
      commits = logStr
        .trim()
        .split("\n")
        .filter((l) => l.length > 0);
    }

    // Nuvarande och senaste commit
    const { stdout: currentRaw } = await git(["rev-parse", "--short", "HEAD"]);
    const { stdout: latestRaw } = await git(["rev-parse", "--short", ref]);

    return NextResponse.json({
      updateAvailable: behindCount > 0,
      currentCommit: currentRaw.trim(),
      latestCommit: latestRaw.trim(),
      behindCount,
      commits,
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json(
      { error: "Update check failed", details: msg },
      { status: 500 },
    );
  }
}

/**
 * POST — Kör uppdatering: pull → install → build → pm2 restart
 */
export async function POST() {
  try {
    const remote = await detectRemote();
    const branch = "dev";
    const nodeBin = process.execPath;
    const npmPath = require.resolve("npm/bin/npm-cli.js");

    // 1. git pull
    const pull = await git(["pull", remote, branch], 30000);

    // 2. npm install (via samma node-binär som kör appen)
    const install = await execFileAsync(nodeBin, [npmPath, "install"], {
      cwd: PROJECT_ROOT,
      timeout: 120000,
      env: { ...process.env, NODE_ENV: "development" },
    });

    // 3. npm run build
    const build = await execFileAsync(nodeBin, [npmPath, "run", "build"], {
      cwd: PROJECT_ROOT,
      timeout: 120000,
    });

    // 4. Hämta ny commit-hash
    const { stdout: newCommitRaw } = await git([
      "rev-parse",
      "--short",
      "HEAD",
    ]);
    const newCommit = newCommitRaw.trim();

    // 5. pm2 restart — kör i bakgrunden, klienten tappar anslutning
    const npxPath = require.resolve("npm/bin/npx-cli.js");
    execFile(
      nodeBin,
      [npxPath, "pm2", "restart", "ecosystem.config.cjs"],
      { cwd: PROJECT_ROOT, timeout: 30000 },
      () => {
        /* Avsiktligt tomt — appen startar om */
      },
    );

    return NextResponse.json({
      success: true,
      message: "Update complete. Restarting...",
      newCommit,
      details: {
        pull: pull.stdout + pull.stderr,
        install: install.stdout.slice(-500),
        build: build.stdout.slice(-500),
      },
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json(
      { success: false, message: "Update failed", error: msg },
      { status: 500 },
    );
  }
}
