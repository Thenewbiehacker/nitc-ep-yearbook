import { spawn } from "node:child_process";
const child = spawn(process.execPath, ["tests/full-flow.cjs"], {
  stdio: "inherit",
  env: { ...process.env, TEST_CLOUDFLARE: "1" },
});
child.on("exit", (code) => process.exit(code ?? 1));
