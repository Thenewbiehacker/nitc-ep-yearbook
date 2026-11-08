import { cp, mkdir, rm } from "node:fs/promises";
import path from "node:path";
const target = path.resolve("dist/public");
await rm(target, { recursive: true, force: true });
await mkdir(target, { recursive: true });
for (const file of [
  "index.html",
  "style.css",
  "app.js",
  "students.js",
  "submit.html",
  "admin.html",
  "withdraw.html",
  "forms.css",
  "forms.js",
  "admin.js",
])
  await cp(file, path.join(target, file));
console.log(
  "Built public assets in dist/public (no source, credentials, or database files).",
);
