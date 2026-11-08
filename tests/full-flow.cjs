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
            modules: true,
            scriptPath: path.resolve("worker/index.js"),
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
    await page
      .locator("#photoInput")
      .setInputFiles({
        name: "test-portrait.png",
        mimeType: "image/png",
        buffer: portrait,
      });
    await page.locator("[name=consent]").check();
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
    await page.getByRole("button", { name: "Approve & publish" }).click();
    await page.getByText("No submissions in this view.").waitFor();
    await page.goto(origin);
    await page.locator(".tile").waitFor();
    assert.equal(await page.locator(".tile").count(), 1);
    assert.match(
      await page.locator(".tile").textContent(),
      /Browser Test Student/,
    );
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
    assert.deepEqual(errors, []);
    console.log(
      "PASS: browser submission → private receipt → admin approval → live profile → withdrawal; responsive form/admin pages; no runtime errors.",
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
