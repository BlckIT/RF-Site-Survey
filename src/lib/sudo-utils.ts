import { execFile } from "child_process";

/**
 * Kör nmcli med sudo. Om password saknas körs sudo utan -S (förlitar sig på sudoers NOPASSWD).
 * Om password finns pipas det till stdin.
 */
export async function sudoNmcli(
  password: string | undefined,
  args: string[],
): Promise<string> {
  return new Promise((resolve, reject) => {
    const sudoArgs = password ? ["-S", "nmcli", ...args] : ["nmcli", ...args];
    const child = execFile(
      "sudo",
      sudoArgs,
      { timeout: 30000 },
      (error, stdout, stderr) => {
        if (error) {
          const msg = String(stderr)
            .split("\n")
            .filter((l) => !l.includes("[sudo]") && l.trim())
            .join(" ")
            .trim();
          reject(new Error(msg || error.message));
        } else {
          resolve(String(stdout).trimEnd());
        }
      },
    );
    if (password) {
      child.stdin?.write(password + "\n");
    }
    child.stdin?.end();
  });
}

/**
 * Kör iw med sudo. Samma logik som sudoNmcli.
 */
export async function sudoIw(
  password: string | undefined,
  args: string[],
): Promise<string> {
  return new Promise((resolve, reject) => {
    const sudoArgs = password ? ["-S", "iw", ...args] : ["iw", ...args];
    const child = execFile(
      "sudo",
      sudoArgs,
      { timeout: 30000 },
      (error, stdout, stderr) => {
        if (error) {
          const msg = String(stderr)
            .split("\n")
            .filter((l) => !l.includes("[sudo]") && l.trim())
            .join(" ")
            .trim();
          reject(new Error(msg || error.message));
        } else {
          resolve(String(stdout).trimEnd());
        }
      },
    );
    if (password) {
      child.stdin?.write(password + "\n");
    }
    child.stdin?.end();
  });
}
