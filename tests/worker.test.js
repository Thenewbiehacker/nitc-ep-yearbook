import { test } from "node:test";
import { checkAdminEdits } from "./admin-edit-checks.js";
import assert from "node:assert/strict";
import sharp from "sharp";
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import worker, { sanitizeJpeg } from "../worker/index.js";
function database() {
  const db = new DatabaseSync(":memory:");
  db.exec(
    readFileSync(
      new URL("../migrations/0001_initial.sql", import.meta.url),
      "utf8",
    ),
  );
  db.exec(
    readFileSync(
      new URL("../migrations/0002_birthday.sql", import.meta.url),
      "utf8",
    ),
  );
  return {
    prepare(sql) {
      return {
        bind(...args) {
          const stmt = db.prepare(sql);
          const params = args.map((x) =>
            x instanceof Uint8Array || Array.isArray(x) ? Buffer.from(x) : x,
          );
          return {
            async first() {
              return stmt.get(...params) || null;
            },
            async all() {
              return { results: stmt.all(...params) };
            },
            async run() {
              const r = stmt.run(...params);
              return {
                meta: {
                  changes: Number(r.changes),
                  last_row_id: Number(r.lastInsertRowid),
                },
              };
            },
          };
        },
      };
    },
  };
}
const jpeg = Uint8Array.from([
  255, 216, 255, 225, 0, 4, 1, 2, 255, 192, 0, 11, 8, 0, 1, 0, 1, 1, 1, 17, 0,
  255, 218, 0, 8, 1, 1, 0, 0, 63, 0, 0, 255, 217,
]);
test("JPEG sanitizer strips metadata and rejects invalid structure", () => {
  assert.equal(sanitizeJpeg(jpeg).length, jpeg.length - 6);
  assert.throws(() => sanitizeJpeg(jpeg.slice(0, -2)));
  const big = jpeg.slice();
  big[15] = 5;
  assert.throws(() => sanitizeJpeg(big));
});
test("D1 API preserves privacy, moderation, sessions, withdrawal and limits", async () => {
  const env = {
    DB: database(),
    ADMIN_PASSWORD: "a secure password 123",
    ASSETS: { fetch: async () => new Response("asset") },
  };
  const origin = "https://example.test";
  const call = (path, options = {}) =>
    worker.fetch(
      new Request(origin + path, {
        ...options,
        headers: {
          ...(options.method && options.method !== "GET"
            ? { Origin: origin }
            : {}),
          ...options.headers,
        },
      }),
      env,
    );
  assert.equal((await call("/backend/app.js")).status, 404);
  assert.equal(
    (
      await call("/api/admin/login", {
        method: "POST",
        headers: { Origin: "https://evil.test" },
        body: "{}",
      })
    ).status,
    403,
  );
  const form = new FormData();
  for (const [k, v] of Object.entries({
    name: "Alice Example",
    quote: "Hello",
    property: "Kind",
    birthday: "29-02-2004",
    consent: "true",
  }))
    form.set(k, v);
  for (const photo of [null, new File([], "empty.jpg", { type: "image/jpeg" })]) {
    if (photo) form.set("photo", photo);
    else form.delete("photo");
    const response = await call("/api/submissions", { method: "POST", body: form });
    assert.equal(response.status, 400);
    assert.match((await response.json()).error, /photo/i);
  }
  form.set("photo", new File([jpeg], "x.jpg", { type: "image/jpeg" }));
  const submitted = await call("/api/submissions", {
    method: "POST",
    body: form,
  });
  assert.equal(submitted.status, 201);
  const { id, withdrawalToken } = await submitted.json();
  assert.deepEqual((await (await call("/api/profiles")).json()).profiles, []);
  assert.equal((await call(`/api/photos/${id}`)).status, 404);
  assert.equal((await call("/api/admin/submissions")).status, 401);
  const login = await call("/api/admin/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ password: env.ADMIN_PASSWORD }),
  });
  assert.equal(login.status, 200);
  const cookie = login.headers.get("set-cookie");
  assert.match(cookie, /HttpOnly; Secure; SameSite=Strict/);
  const auth = { Cookie: cookie.split(";")[0] };
  assert.equal(
    (await call(`/api/admin/photos/${id}`, { headers: auth })).status,
    200,
  );
  assert.equal(
    (
      await call(`/api/admin/submissions/${id}`, {
        method: "PATCH",
        headers: { ...auth, "Content-Type": "application/json" },
        body: '{"status":"approved"}',
      })
    ).status,
    200,
  );
  const approved = (await (await call("/api/profiles")).json()).profiles;
  assert.equal(approved.length, 1);
  assert.equal(approved[0].birthday, "29-02-2004");
  assert.equal(
    (await call(`/api/photos/${id}`)).headers.get("content-type"),
    "image/jpeg",
  );
  await checkAdminEdits(call, id, auth, birthday =>
    env.DB.prepare("UPDATE submissions SET birthday=? WHERE id=?").bind(birthday, id).run());
  const another = await (await call("/api/submissions", { method: "POST", body: form })).json();
  assert.equal((await call(`/api/admin/submissions/${another.id}`, {
    method: "PATCH", headers: { ...auth, "Content-Type": "application/json" },
    body: JSON.stringify({ status: "approved" }),
  })).status, 200);
  assert.equal((await call(`/api/admin/submissions/${another.id}`, {
    method: "DELETE", headers: auth,
  })).status, 200);
  assert.equal((await call(`/api/photos/${another.id}`)).status, 404);
  assert.equal((await call(`/api/admin/photos/${another.id}`, { headers: auth })).status, 404);
  assert.equal((await call(`/api/admin/submissions/${another.id}`, {
    method: "DELETE", headers: auth,
  })).status, 404);
  assert.equal(
    (
      await call(`/api/submissions/${id}/status`, {
        headers: { "x-withdrawal-token": withdrawalToken },
      })
    ).status,
    200,
  );
  assert.equal(
    (
      await call(`/api/submissions/${id}`, {
        method: "DELETE",
        headers: { "x-withdrawal-token": withdrawalToken },
      })
    ).status,
    200,
  );
  assert.equal((await call(`/api/photos/${id}`)).status, 404);
  env.ADMIN_PASSWORD = "a different password 456";
  assert.equal(
    (await call("/api/admin/session", { headers: auth })).status,
    401,
  );
  env.ADMIN_PASSWORD = "a secure password 123";
  assert.equal(
    (await call("/api/admin/session", { headers: auth })).status,
    200,
  );
  for (let i = 0; i < 4; i++)
    assert.equal(
      (
        await call("/api/admin/login", {
          method: "POST",
          body: '{"password":"wrong"}',
        })
      ).status,
      401,
    );
  assert.equal(
    (
      await call("/api/admin/login", {
        method: "POST",
        body: '{"password":"wrong"}',
      })
    ).status,
    429,
  );
  for (let i = 0; i < 29; i++)
    await call("/api/submissions/999", { method: "DELETE" });
  assert.equal(
    (await call("/api/submissions/999", { method: "DELETE" })).status,
    429,
  );
});

test("birthdays require a valid past date in DD-MM-YYYY format", async () => {
  const env = {
    DB: database(),
    ADMIN_PASSWORD: "a secure password 123",
    ASSETS: { fetch: async () => new Response("asset") },
  };
  for (const [birthday, expected] of [
    ["02-29", 400],
    ["29-02", 400],
    ["02-29-2004", 400],
    ["2004-02-29", 400],
    ["30-02-2004", 400],
    ["31-04-2004", 400],
    ["29-02-2007", 400],
    ["29-02-1900", 400],
    ["01-01-0000", 400],
    [`01-01-${new Date().getUTCFullYear() + 1}`, 400],
    ["29-02-2000", 201],
    ["31-12-2007", 201],
    ["29-02-2004", 201],
    ["", 400],
    [" ", 400],
    [undefined, 400],
  ]) {
    const form = new FormData();
    for (const [key, value] of Object.entries({
      name: "Test Student",
      quote: "Hi",
      property: "Kind",
      consent: "true",
      birthday,
    }))
      form.set(key, value);
    if (birthday === undefined) form.delete("birthday");
    const jpeg = await sharp({ create: { width: 10, height: 10, channels: 3, background: "#aabbcc" } }).jpeg().toBuffer();
    form.set("photo", new File([jpeg], "test.jpg", { type: "image/jpeg" }));
    const response = await worker.fetch(
      new Request("https://example.test/api/submissions", {
        method: "POST",
        headers: { Origin: "https://example.test" },
        body: form,
      }),
      env,
    );
    assert.equal(response.status, expected, birthday);
  }
});
