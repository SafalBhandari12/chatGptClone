import { Sandbox } from "@vercel/sandbox";
import { INSTALLED_PACKAGES } from "../agent.js";

const sandbox = await Sandbox.create({
  runtime: "python3.13",
});

await sandbox.runCommand({
  cmd: "pip",
  args: ["install", ...INSTALLED_PACKAGES],
});

const snapshot = await sandbox.snapshot({ expiration: 0 });

console.log(snapshot.createdAt, snapshot.expiresAt, snapshot.snapshotId);
