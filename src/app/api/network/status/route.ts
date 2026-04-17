import { NextResponse } from "next/server";
import { execAsync } from "@/lib/server-utils";
import os from "os";

export async function GET() {
  try {
    if (os.platform() !== "linux") {
      return NextResponse.json({ devices: [] });
    }

    const { stdout } = await execAsync(
      "nmcli -t -f DEVICE,TYPE,STATE,CONNECTION device status",
    );

    const devices = stdout
      .split("\n")
      .filter((line: string) => line.trim().length > 0)
      .map((line: string) => {
        const parts = line.split(":");
        return {
          device: parts[0] || "",
          type: parts[1] || "",
          state: parts[2] || "",
          connection: parts[3] || "",
        };
      });

    return NextResponse.json({ devices });
  } catch {
    return NextResponse.json({ devices: [] });
  }
}
