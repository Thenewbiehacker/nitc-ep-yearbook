// Explicit live smoke test: creates one labeled temporary profile and always removes it.
// ADMIN_PASSWORD_FILE points to a private file; the secret is never logged.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import sharp from "sharp";
import { randomBytes } from "node:crypto";
const origin = process.argv[2];
if (!origin?.startsWith("https://") || !process.env.ADMIN_PASSWORD_FILE)
  throw Error("Provide an HTTPS origin and ADMIN_PASSWORD_FILE.");
const password = readFileSync(process.env.ADMIN_PASSWORD_FILE, "utf8").trim();
let receipt, cookie;
const call = async (route, options = {}) =>
  fetch(origin + route, {
    ...options,
    headers: { Origin: origin, ...options.headers },
  });
try {
  const home = await call("/");
  assert.equal(home.status, 200);
  const html = await home.text();
  assert.match(html, /Devang Agarwal/);
  assert.doesNotMatch(html, /The idea/);
  assert.equal((await call("/api/admin/submissions")).status, 401);
  assert.equal((await call("/.env")).status, 404);
  const login = await call("/api/admin/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ password }),
  });
  assert.equal(login.status, 200, "Admin login failed");
  cookie = login.headers.get("set-cookie").split(";")[0];
  const photo = await sharp(randomBytes(1000 * 1200 * 3), {
    raw: { width: 1000, height: 1200, channels: 3 },
  })
    .jpeg({ quality: 80 })
    .toBuffer();
  const form = new FormData();
  for (const [key, value] of Object.entries({
    name: "Temporary deployment check",
    initials: "QA",
    quote: "Temporary verification profile. Removed automatically.",
    property: "Deployment verification",
    birthday: "29-02-2004",
    consent: "true",
  }))
    form.append(key, value);
  form.append("photo", new Blob([photo], { type: "image/jpeg" }), "test.jpg");
  const submission = await call("/api/submissions", {
    method: "POST",
    body: form,
  });
  assert.equal(submission.status, 201);
  receipt = await submission.json();
  const before = await (await call("/api/profiles")).json();
  assert.ok(!before.profiles.some((p) => p.id === receipt.id));
  assert.equal((await call(`/api/photos/${receipt.id}`)).status, 404);
  const adminRows = await (
    await call("/api/admin/submissions", { headers: { Cookie: cookie } })
  ).json();
  assert.ok(adminRows.submissions.some((p) => p.id === receipt.id));
  const approval = await call(`/api/admin/submissions/${receipt.id}`, {
    method: "PATCH",
    headers: { Cookie: cookie, "Content-Type": "application/json" },
    body: JSON.stringify({ status: "approved" }),
  });
  assert.equal(approval.status, 200);
  const after = await (await call("/api/profiles")).json();
  assert.ok(after.profiles.some((p) => p.id === receipt.id));
  const portrait = await call(`/api/photos/${receipt.id}`);
  assert.equal(portrait.status, 200);
  assert.equal(portrait.headers.get("content-type"), "image/jpeg");
  assert.equal(
    (await sharp(Buffer.from(await portrait.arrayBuffer())).metadata()).width,
    1000,
  );
  console.log(
    "PASS: live HTML, private admin, submission + portrait, approval, public API and image.",
  );
} finally {
  if (receipt) {
    const removed = await call(`/api/submissions/${receipt.id}`, {
      method: "DELETE",
      headers: { "x-withdrawal-token": receipt.withdrawalToken },
    });
    assert.equal(removed.status, 200, "Temporary test profile cleanup failed");
    console.log("Temporary test profile withdrawn successfully.");
  }
  if (cookie)
    await call("/api/admin/logout", {
      method: "POST",
      headers: { Cookie: cookie },
    });
}
