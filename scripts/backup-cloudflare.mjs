import { mkdir } from "node:fs/promises";
import { spawn } from "node:child_process";
import path from "node:path";
await mkdir("backups", { recursive: true, mode: 0o700 });
const file = path.join(
  "backups",
  `yearbook-${new Date().toISOString().replaceAll(":", "-").replaceAll(".", "-")}.sql`,
);
const cli = path.resolve("node_modules/wrangler/bin/wrangler.js");
const child = spawn(
  process.execPath,
  [cli, "d1", "export", "nitc-ep-yearbook", "--remote", "--output", file],
  { stdio: ["inherit", "pipe", "pipe"] },
);
for (const stream of [child.stdout, child.stderr]) {
  let pending = "";
  const emit = (line) =>
    console.log(
      line.includes("X-Amz-")
        ? "Private download link omitted; the SQL export is saved locally."
        : line,
    );
  stream.on("data", (chunk) => {
    pending += chunk.toString();
    const lines = pending.split("\n");
    pending = lines.pop();
    lines.forEach(emit);
  });
  stream.on("end", () => {
    if (pending) emit(pending);
  });
}
child.on("exit", (code) => process.exit(code ?? 1));
