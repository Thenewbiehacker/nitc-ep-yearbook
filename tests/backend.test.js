import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { randomBytes } from "node:crypto";
import sharp from "sharp";
import { createApp } from "../backend/app.js";

test("submission privacy, moderation, authentication, photos, withdrawal and persistence", async (t) => {
  const dataDir = mkdtempSync(path.join(os.tmpdir(), "ep-backend-"));
  const password = randomBytes(24).toString("base64url");
  const origin = "http://yearbook.test";
  let service = createApp({ dataDir, adminPassword: password, origin });
  let server = service.app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  const base = () => `http://127.0.0.1:${server.address().port}`;
  let cookie;
  const request = (url, options = {}) =>
    fetch(base() + url, {
      ...options,
      headers: { Origin: origin, ...options.headers },
    });
  const json = (method, body) => ({
    method,
    headers: {
      "Content-Type": "application/json",
      ...(cookie ? { Cookie: cookie } : {}),
    },
    body: JSON.stringify(body),
  });
  const defaultPhoto = await sharp({ create: { width: 10, height: 10, channels: 3, background: "#aabbcc" } }).jpeg().toBuffer();
  const form = (changes = {}, photo = defaultPhoto) => {
    const data = new FormData();
    for (const [key, value] of Object.entries({
      name: "Test Student",
      initials: "Ts",
      quote: "<script>not executable</script>",
      property: "Always curious",
      birthday: "02-29",
      consent: "true",
      ...changes,
    }))
      data.append(key, value);
    if (photo)
      data.append(
        "photo",
        new Blob([photo], { type: "image/jpeg" }),
        "portrait.jpg",
      );
    return data;
  };
  let submission;
  try {
    await t.test(
      "source files and private APIs cannot be read anonymously",
      async () => {
        assert.equal((await request("/api/admin/submissions")).status, 401);
        for (const url of [
          "/server.js",
          "/.env",
          "/data/yearbook.sqlite",
          "/backend/app.js",
          "/package.json",
        ])
          assert.equal((await request(url)).status, 404);
        assert.deepEqual(
          (await (await request("/api/profiles")).json()).profiles,
          [],
        );
      },
    );
    await t.test(
      "cross-origin writes, missing consent, and invalid image bytes are rejected",
      async () => {
        assert.equal(
          (
            await request("/api/submissions", {
              method: "POST",
              headers: { Origin: "https://evil.test" },
              body: form(),
            })
          ).status,
          403,
        );
        assert.equal(
          (
            await request("/api/submissions", {
              method: "POST",
              body: form({ consent: "false" }),
            })
          ).status,
          400,
        );
        assert.equal(
          (
            await request("/api/submissions", {
              method: "POST",
              body: form({}, Buffer.from("not a photo")),
            })
          ).status,
          400,
        );
      },
    );
    await t.test("photo is required", async () => {
      for (const photo of [null, Buffer.alloc(0)]) {
        const response = await request("/api/submissions", { method: "POST", body: form({}, photo) });
        assert.equal(response.status, 400);
        assert.match((await response.json()).error, /photo/i);
      }
    });
    await t.test("birthday is required and must be a real month and day", async () => {
      for (const birthday of [undefined, "", " ", "02-30", "04-31"]) {
        const body = form();
        if (birthday === undefined) body.delete("birthday");
        else body.set("birthday", birthday);
        const response = await request("/api/submissions", { method: "POST", body });
        assert.equal(response.status, 400);
        assert.match((await response.json()).error, /birthday/i);
      }
    });
    await t.test(
      "valid submission remains private and photo is transformed",
      async () => {
        const input = await sharp({
          create: { width: 30, height: 40, channels: 3, background: "#aabbcc" },
        })
          .jpeg()
          .toBuffer();
        const response = await request("/api/submissions", {
          method: "POST",
          body: form({}, input),
        });
        assert.equal(response.status, 201);
        submission = await response.json();
        assert.equal(submission.status, "pending");
        assert.equal(submission.withdrawalToken.length, 43);
        assert.deepEqual(
          (await (await request("/api/profiles")).json()).profiles,
          [],
        );
        assert.equal(
          (await request(`/api/photos/${submission.id}`)).status,
          404,
        );
        assert.equal(
          (await request(`/api/admin/photos/${submission.id}`)).status,
          401,
        );
        assert.equal(
          (await request(`/api/submissions/${submission.id}/status`)).status,
          404,
        );
        assert.equal(
          (
            await (
              await request(`/api/submissions/${submission.id}/status`, {
                headers: { "x-withdrawal-token": submission.withdrawalToken },
              })
            ).json()
          ).status,
          "pending",
        );
      },
    );
    await t.test(
      "admin approves, then unpublishes; private fields never enter public responses",
      async () => {
        assert.equal(
          (
            await request(
              "/api/admin/login",
              json("POST", { password: "wrong" }),
            )
          ).status,
          401,
        );
        const login = await request(
          "/api/admin/login",
          json("POST", { password }),
        );
        assert.equal(login.status, 200);
        const setCookie = login.headers.get("set-cookie");
        assert.match(setCookie, /HttpOnly/);
        assert.match(setCookie, /SameSite=Strict/);
        cookie = setCookie.split(";")[0];
        const rows = (
          await (
            await request("/api/admin/submissions", {
              headers: { Cookie: cookie },
            })
          ).json()
        ).submissions;
        assert.equal(rows.length, 1);
        assert.ok(rows[0].consent_at);
        assert.equal(rows[0].withdrawal_hash, undefined);
        const photoResponse = await request(
          `/api/admin/photos/${submission.id}`,
          { headers: { Cookie: cookie } },
        );
        const metadata = await sharp(
          Buffer.from(await photoResponse.arrayBuffer()),
        ).metadata();
        assert.equal(metadata.format, "webp");
        assert.equal(metadata.exif, undefined);
        assert.equal(
          (
            await request(
              `/api/admin/submissions/${submission.id}`,
              json("PATCH", { status: "approved" }),
            )
          ).status,
          200,
        );
        const profiles = (await (await request("/api/profiles")).json())
          .profiles;
        assert.equal(profiles.length, 1);
        assert.equal(profiles[0].quote, "<script>not executable</script>");
        assert.equal(profiles[0].withdrawal_hash, undefined);
        assert.equal(profiles[0].consent_at, undefined);
        assert.equal(
          (await request(`/api/photos/${submission.id}`)).status,
          200,
        );
        await request(
          `/api/admin/submissions/${submission.id}`,
          json("PATCH", { status: "rejected" }),
        );
        assert.equal(
          (await request(`/api/photos/${submission.id}`)).status,
          404,
        );
        assert.equal(
          (await (await request("/api/profiles")).json()).profiles.length,
          0,
        );
        await request(
          `/api/admin/submissions/${submission.id}`,
          json("PATCH", { status: "approved" }),
        );
      },
    );
    await t.test("approved profiles survive a restart", async () => {
      await new Promise((resolve) => server.close(resolve));
      service.close();
      service = createApp({ dataDir, adminPassword: password, origin });
      server = service.app.listen(0, "127.0.0.1");
      await new Promise((resolve) => server.once("listening", resolve));
      assert.equal(
        (await (await request("/api/profiles")).json()).profiles.length,
        1,
      );
    });
    await t.test(
      "only the private token can withdraw; withdrawal removes the photo and profile",
      async () => {
        assert.equal(
          (
            await request(`/api/submissions/${submission.id}`, {
              method: "DELETE",
              headers: { "x-withdrawal-token": "wrong" },
            })
          ).status,
          404,
        );
        assert.equal(
          (
            await request(`/api/submissions/${submission.id}`, {
              method: "DELETE",
              headers: { "x-withdrawal-token": submission.withdrawalToken },
            })
          ).status,
          200,
        );
        assert.equal(
          (await request(`/api/photos/${submission.id}`)).status,
          404,
        );
        assert.equal(
          (await (await request("/api/profiles")).json()).profiles.length,
          0,
        );
        assert.equal(
          (
            await request(`/api/submissions/${submission.id}/status`, {
              headers: { "x-withdrawal-token": submission.withdrawalToken },
            })
          ).status,
          404,
        );
      },
    );
    await t.test(
      "admin deletion, logout, and submission rate limits work",
      async () => {
        const submitted = await (
          await request("/api/submissions", { method: "POST", body: form() })
        ).json();
        assert.equal(
          (
            await request(`/api/admin/submissions/${submitted.id}`, {
              method: "DELETE",
              headers: { Cookie: cookie },
            })
          ).status,
          200,
        );
        assert.equal(
          (
            await request("/api/admin/logout", {
              method: "POST",
              headers: { Cookie: cookie },
            })
          ).status,
          200,
        );
        assert.equal(
          (await request("/api/admin/session", { headers: { Cookie: cookie } }))
            .status,
          401,
        );
        for (let i = 0; i < 119; i++)
          assert.equal(
            (
              await request("/api/submissions", {
                method: "POST",
                body: form({ consent: "false" }),
              })
            ).status,
            400,
          );
        assert.equal(
          (await request("/api/submissions", { method: "POST", body: form() }))
            .status,
          429,
        );
      },
    );
  } finally {
    await new Promise((resolve) => server.close(resolve));
    service.close();
    rmSync(dataDir, { recursive: true, force: true });
  }
});

test("production configuration refuses missing credentials and insecure origins", () => {
  assert.throws(
    () =>
      createApp({
        production: true,
        adminPassword: "",
        origin: "https://yearbook.test",
      }),
    /Production requires/,
  );
  assert.throws(
    () =>
      createApp({
        production: true,
        adminPassword: "long-enough-password-for-test",
        origin: "http://yearbook.test",
      }),
    /Production requires/,
  );
  assert.throws(() => createApp({ adminPassword: "short" }), /at least 16/);
});
