const { chromium } = require("playwright");
const assert = require("node:assert/strict");
const { mkdtempSync, rmSync } = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { randomBytes } = require("node:crypto");
(async () => {
  const dataDir = mkdtempSync(path.join(os.tmpdir(), "ep-browser-"));
  const password = randomBytes(24).toString("base64url");
  let origin, service, server, mf;
  if (process.env.TEST_CLOUDFLARE === "1") {
    const { Miniflare, convertV4MiniflareOptions } = require("miniflare");
    const { readFileSync } = require("node:fs");
    mf = new Miniflare(
      convertV4MiniflareOptions({
        workers: [
          {
            name: "yearbook",
            modules: [
              { type: "ESModule", path: path.resolve("worker/index.js") },
              { type: "ESModule", path: path.resolve("backend/profile-details.js") },
            ],
            compatibilityDate: "2026-11-08",
            d1Databases: ["DB"],
            bindings: { ADMIN_PASSWORD: password },
            assets: {
              directory: path.resolve("dist/public"),
              binding: "ASSETS",
              run_worker_first: true,
              routerConfig: { has_user_worker: true },
              assetConfig: { html_handling: "none" },
            },
          },
        ],
      }),
    );
    origin = (await mf.ready).origin;
    const db = await mf.getD1Database("DB");
    const sql = readFileSync(
      path.resolve("migrations/0001_initial.sql"),
      "utf8",
    );
    for (const statement of sql.split(";").filter((x) => x.trim()))
      await db.prepare(statement).run();
    await db
      .prepare(
        readFileSync(path.resolve("migrations/0002_birthday.sql"), "utf8"),
      )
      .run();
  } else {
    const { createApp } = await import("../backend/app.js");
    origin = "http://127.0.0.1:43187";
    service = createApp({ dataDir, adminPassword: password, origin });
    server = service.app.listen(43187, "127.0.0.1");
    await new Promise((resolve) => server.once("listening", resolve));
  }
  const browser = await chromium.launch({
    headless: true,
    executablePath: process.env.CHROMIUM_PATH || undefined,
  });
  try {
    const context = await browser.newContext({
      viewport: { width: 1440, height: 1000 },
    });
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto(origin);
    await page
      .locator("#sampleNote")
      .filter({ hasText: "fictional" })
      .waitFor();
    assert.equal(await page.locator(".tile").count(), 3);
    await page.goto(origin + "/submit");
    await page
      .getByLabel("Your name", { exact: true })
      .fill("Browser Test Student");
    await page
      .getByRole("textbox", { name: "Initials (optional)", exact: true })
      .fill("Bt");
    await page
      .getByLabel("Your line")
      .fill("A little curiosity goes a long way.");
    await page.getByLabel("You, in a few words").fill("Always curious");
    const sharp = require("sharp");
    const portrait = await sharp({
      create: { width: 1800, height: 2400, channels: 3, background: "#c3bbd3" },
    })
      .png()
      .toBuffer();
    assert.equal(await page.locator("#photoInput").evaluate((input) => input.required && input.validity.valueMissing), true);
    await page.locator("#photoInput").setInputFiles({
      name: "test-portrait.png",
      mimeType: "image/png",
      buffer: portrait,
    });
    const birthdayInput = page.locator("[name=birthday]");
    assert.equal(await birthdayInput.evaluate((input) => input.required), true);
    assert.equal(await birthdayInput.evaluate((input) => input.validity.valueMissing), true);
    assert.match(await birthdayInput.getAttribute("placeholder"), /DD-MM-YYYY/);
    await birthdayInput.fill("02-29");
    assert.equal(await birthdayInput.evaluate((input) => input.validity.patternMismatch), true);
    await birthdayInput.fill("29-02-2007");
    await page.locator("[name=consent]").check();
    await page.getByRole("button", { name: "Send for review" }).click();
    await page.locator("#formStatus").filter({ hasText: "DD-MM-YYYY" }).waitFor();
    assert.equal(await page.locator("#submissionSuccess").isVisible(), false);
    await birthdayInput.fill("29-02-2004");
    await page.getByRole("button", { name: "Send for review" }).click();
    await page.locator("#submissionSuccess").waitFor({ state: "visible" });
    const privateLink = await page.locator("#privateLink").inputValue();
    assert.match(privateLink, /#id=\d+&token=/);
    await page.goto(origin);
    await page
      .locator("#sampleNote")
      .filter({ hasText: "fictional" })
      .waitFor();
    assert.equal(await page.locator(".tile").count(), 3);
    await page.goto(origin + "/admin");
    await page.getByLabel("Admin password").fill(password);
    await page.getByRole("button", { name: "Sign in" }).click();
    await page.getByRole("button", { name: "Approve & publish" }).waitFor();
    const uploaded = await page.request.get(
      origin + (await page.locator(".review-photo").getAttribute("src")),
    );
    assert.equal(uploaded.status(), 200);
    const metadata = await sharp(await uploaded.body()).metadata();
    assert.ok(metadata.width <= 1000 && metadata.height <= 1200);
    assert.equal(metadata.exif, undefined);
    assert.match(await page.locator("#reviewList").textContent(), /29-02-2004/);
    await page.getByRole("button", { name: "Approve & publish" }).click();
    await page.getByText("No submissions in this view.").waitFor();
    await page.goto(origin);
    await page.locator(".tile").waitFor();
    assert.equal(await page.locator(".tile").count(), 1);
    await page.locator(".tile").click();
    assert.match(
      await page.locator("#profileContent").textContent(),
      /29-02-2004/,
    );
    await page.keyboard.press("Escape");
    assert.match(
      await page.locator(".tile").textContent(),
      /Browser Test Student/,
    );
    // An already approved profile can be edited without uploading a photo.
    const profileId = Number(new URLSearchParams(new URL(privateLink).hash.slice(1)).get("id"));
    await page.goto(origin + "/admin");
    await page.locator("#statusFilter").selectOption("approved");
    await page.getByRole("button", { name: "Edit details" }).click();
    const editor = page.locator("#editForm");
    assert.equal(await editor.locator('input[type="file"]').count(), 0);
    await editor.getByLabel("Name", { exact: true }).fill("Cancelled edit");
    await page.getByRole("button", { name: "Cancel", exact: true }).click();
    assert.equal(await page.locator(".review-card h2").textContent(), "Browser Test Student");
    await page.getByRole("button", { name: "Edit details" }).click();
    for (const width of [1440, 390, 320]) {
      await page.setViewportSize({ width, height: 900 });
      assert.equal(await page.locator("#editDialog").evaluate(el => el.scrollWidth <= el.clientWidth), true);
    }
    await editor.getByLabel("Name", { exact: true }).fill("Edited Browser Student");
    await editor.getByLabel("Initials", { exact: false }).fill("EB");
    await editor.getByLabel("Quote", { exact: true }).fill("Corrected <quote> for the archive.");
    await editor.getByLabel("Description", { exact: true }).fill("Updated description");
    await editor.getByLabel("Birthday", { exact: false }).fill("29-02-2007");
    await page.getByRole("button", { name: "Save changes" }).click();
    await page.locator("#editStatus").filter({ hasText: "DD-MM-YYYY" }).waitFor();
    await editor.getByLabel("Birthday", { exact: false }).fill("31-12-2005");
    await page.getByRole("button", { name: "Save changes" }).click();
    await page.locator("#editDialog").waitFor({ state: "hidden" });
    await page.getByText("Profile details saved.", { exact: true }).waitFor();
    const photoAfterEdit = await page.request.get(origin + `/api/admin/photos/${profileId}`);
    assert.deepEqual(await photoAfterEdit.body(), await uploaded.body());
    await page.goto(origin);
    await page.locator(".tile").click();
    assert.match(await page.locator("#profileContent").textContent(), /Edited Browser Student/);
    assert.match(await page.locator("#profileContent").textContent(), /31-12-2005/);
    assert.equal(await page.locator("#profileContent quote").count(), 0);
    assert.match(await page.locator("#profileContent blockquote").textContent(), /Corrected <quote>/);
    await page.keyboard.press("Escape");

    // Older records can have their text corrected without inventing a birth year.
    if (mf) {
      const db = await mf.getD1Database("DB");
      await db.prepare("UPDATE submissions SET birthday=? WHERE id=?").bind("02-29", profileId).run();
    } else {
      service.db.prepare("UPDATE submissions SET birthday=? WHERE id=?").run("02-29", profileId);
    }
    await page.goto(origin + "/admin");
    await page.locator("#statusFilter").selectOption("approved");
    await page.getByRole("button", { name: "Edit details" }).click();
    assert.equal(await editor.locator("[name=birthday]").inputValue(), "");
    assert.match(await page.locator("#editBirthdayNote").textContent(), /29-02.*year not provided/);
    await editor.getByLabel("Description", { exact: true }).fill("Corrected older entry");
    await page.getByRole("button", { name: "Save changes" }).click();
    await page.getByText("Profile details saved.", { exact: true }).waitFor();
    const legacy = (await (await page.request.get(origin + "/api/profiles")).json()).profiles;
    assert.equal(legacy[0].birthday, "02-29");
    for (const route of ["/submit", "/admin", "/withdraw"]) {
      await page.goto(origin + route);
      for (const width of [1440, 390, 320]) {
        await page.setViewportSize({ width, height: 900 });
        assert.equal(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          ),
          true,
          route + " overflow " + width,
        );
      }
    }
    await page.goto(privateLink);
    await page
      .getByText("Your story has been approved and is public in the archive.")
      .waitFor();
    await page.getByRole("button", { name: "Withdraw my submission" }).click();
    await page.getByRole("button", { name: "Yes, remove my story" }).click();
    await page
      .getByText(
        "Your story has been removed from the database and the live archive.",
      )
      .waitFor();
    await page.goto(origin);
    await page
      .locator("#sampleNote")
      .filter({ hasText: "fictional" })
      .waitFor();
    assert.equal(await page.locator(".tile").count(), 3);
    // Delete an already published entry through the Published admin view.
    const jpeg = await sharp(portrait).resize({ width: 1000, height: 1200, fit: "inside" }).jpeg().toBuffer();
    const deletionReceipt = await (await page.request.post(origin + "/api/submissions", {
      headers: { Origin: origin },
      multipart: { name: "Published deletion test", quote: "Temporary test entry",
        property: "Testing deletion", birthday: "01-01-2005", consent: "true",
        photo: { name: "portrait.jpg", mimeType: "image/jpeg", buffer: jpeg } },
    })).json();
    assert.ok(deletionReceipt.id);
    assert.equal((await page.request.patch(origin + `/api/admin/submissions/${deletionReceipt.id}`, {
      headers: { Origin: origin }, data: { status: "approved" },
    })).status(), 200);
    await page.goto(origin + "/admin");
    await page.locator("#statusFilter").selectOption("approved");
    await page.getByRole("button", { name: "Delete permanently" }).waitFor();
    page.once("dialog", dialog => dialog.dismiss());
    await page.getByRole("button", { name: "Delete permanently" }).click();
    assert.equal(await page.locator(".review-card h2").textContent(), "Published deletion test");
    page.once("dialog", dialog => dialog.accept());
    await page.getByRole("button", { name: "Delete permanently" }).click();
    await page.getByText("Entry deleted.", { exact: true }).waitFor();
    assert.equal(await page.locator(".review-card").count(), 0);
    assert.equal((await page.request.get(origin + `/api/photos/${deletionReceipt.id}`)).status(), 404);
    assert.equal((await page.request.get(origin + `/api/admin/photos/${deletionReceipt.id}`)).status(), 404);
    assert.deepEqual((await (await page.request.get(origin + "/api/profiles")).json()).profiles, []);
    assert.deepEqual(errors, []);
    console.log(
      "PASS: submission, approval, published-profile editing with unchanged photos, legacy birthdays, withdrawal, and confirmed deletion of published entries; responsive pages; no runtime errors.",
    );
  } finally {
    await browser.close();
    if (server) await new Promise((resolve) => server.close(resolve));
    if (service) service.close();
    if (mf) await mf.dispose();
    rmSync(dataDir, { recursive: true, force: true });
  }
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
