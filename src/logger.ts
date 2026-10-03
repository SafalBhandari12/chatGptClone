import fs from "fs/promises";
import path from "path";
import crypto from "crypto";

export async function saveLog(data: Record<string, unknown>): Promise<void> {
  try {
    await fs.mkdir("./logs", { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const file = path.join("./logs", `${stamp}-${crypto.randomUUID().slice(0, 8)}.json`);
    await fs.writeFile(file, JSON.stringify(data, null, 2));
    console.log("Log saved:", file);
  } catch (error) {
    console.error("Failed to save log:", error);
  }
}
