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

    // Hjälpfunktion: kör shell-kommando med korrekt PATH (nvm-kompatibelt)
    const shell = (
      cmd: string,
      timeout = 120000,
      env?: Record<string, string>,
    ) => {
      const mergedEnv: Record<string, string | undefined> = {
        ...process.env,
        ...env,
      };
      // Rensa NODE_ENV om det inte explicit sätts — Next.js build kräver production
      if (!env?.NODE_ENV) mergedEnv.NODE_ENV = undefined;
      return execFileAsync("/bin/bash", ["-lc", cmd], {
        cwd: PROJECT_ROOT,
        timeout,
        env: mergedEnv as NodeJS.ProcessEnv,
      });
    };

    // 1. git pull
    const pull = await git(["pull", remote, branch], 30000);

    // 2. npm install (behöver devDependencies)
    const install = await shell("npm install", 120000, {
      NODE_ENV: "development",
    });

    // 3. npm run build (NODE_ENV=production implicit via next build)
    // next build skriver ESLint-varningar till stderr — fånga utan att kasta
    let build: { stdout: string; stderr: string };
    try {
      build = await shell("npm run build", 180000);
    } catch (buildErr: unknown) {
      // Om exit code 0 men stderr har varningar → execFileAsync kastar ändå ibland
      // Kolla om det faktiskt är ett build-fel eller bara varningar
      const errObj = buildErr as {
        stdout?: string;
        stderr?: string;
        code?: number;
      };
      if (
        errObj.stdout &&
        errObj.stdout.includes("Finalizing page optimization")
      ) {
        // Build lyckades trots stderr-varningar
        build = {
          stdout: errObj.stdout || "",
          stderr: errObj.stderr || "",
        };
      } else {
        throw buildErr;
      }
    }

    // 4. Hämta ny commit-hash
    const { stdout: newCommitRaw } = await git([
      "rev-parse",
      "--short",
      "HEAD",
    ]);
    const newCommit = newCommitRaw.trim();

    // 5. pm2 restart — kör i bakgrunden, klienten tappar anslutning
    execFile(
      "/bin/bash",
      ["-lc", "npx pm2 restart ecosystem.config.cjs"],
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
