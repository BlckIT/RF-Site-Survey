import { NextResponse } from "next/server";
import { execAsync } from "@/lib/server-utils";
import os from "os";

export async function GET() {
  try {
    if (os.platform() !== "linux") {
      return NextResponse.json({ interfaces: [] });
    }
    const { stdout } = await execAsync(
      "iw dev | awk '$1==\"Interface\"{print $2}'",
    );
    const interfaces = stdout
      .trim()
      .split("\n")
      .filter((line: string) => line.length > 0);
    return NextResponse.json({ interfaces });
  } catch {
    return NextResponse.json({ interfaces: [] });
  }
}
