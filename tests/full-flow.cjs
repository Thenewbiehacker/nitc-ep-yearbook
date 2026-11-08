const { chromium } = require("playwright");
const assert = require("node:assert/strict");
const { mkdtempSync, rmSync } = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { randomBytes } = require("node:crypto");
(async () => {
  const { createApp } = await import("../backend/app.js");
  const dataDir = mkdtempSync(path.join(os.tmpdir(), "ep-browser-"));
  const password = randomBytes(24).toString("base64url");
  const origin = "http://127.0.0.1:43187";
  const service = createApp({ dataDir, adminPassword: password, origin });
  const server = service.app.listen(43187, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
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
    await page.locator("#grid .empty-state").waitFor();
    assert.equal(await page.locator(".tile").count(), 0);
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
    await page.locator("[name=consent]").check();
    await page.getByRole("button", { name: "Send for review" }).click();
    await page.locator("#submissionSuccess").waitFor({ state: "visible" });
    const privateLink = await page.locator("#privateLink").inputValue();
    assert.match(privateLink, /#id=\d+&token=/);
    await page.goto(origin);
    await page.locator("#grid .empty-state").waitFor();
    assert.equal(await page.locator(".tile").count(), 0);
    await page.goto(origin + "/admin");
    await page.getByLabel("Admin password").fill(password);
    await page.getByRole("button", { name: "Sign in" }).click();
    await page.getByRole("button", { name: "Approve & publish" }).waitFor();
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
    await page.locator("#grid .empty-state").waitFor();
    assert.equal(await page.locator(".tile").count(), 0);
    assert.deepEqual(errors, []);
    console.log(
      "PASS: browser submission → private receipt → admin approval → live profile → withdrawal; responsive form/admin pages; no runtime errors.",
    );
  } finally {
    await browser.close();
    await new Promise((resolve) => server.close(resolve));
    service.close();
    rmSync(dataDir, { recursive: true, force: true });
  }
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
