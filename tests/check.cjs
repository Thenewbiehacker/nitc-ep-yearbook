// Run with: NODE_PATH=/path/to/node_modules node tests/check.cjs
const { chromium } = require("playwright");
const assert = require("node:assert/strict");
const { pathToFileURL } = require("node:url");
const path = require("node:path");
(async () => {
  const browser = await chromium.launch({
    headless: true,
    executablePath: process.env.CHROMIUM_PATH || undefined,
  });
  const page = await browser.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(pathToFileURL(path.resolve(__dirname, "../index.html")).href);
  await page.locator(".tile").first().waitFor();
  assert.equal(await page.locator(".tile").count(), 3);
  assert.equal(await page.locator(".placeholder").count(), 34);
  await page.locator(".tile").first().click();
  assert.equal(await page.locator("#profileName").textContent(), "Student One");
  await page.locator("#nextPerson").click();
  assert.equal(await page.locator("#profileName").textContent(), "Student Two");
  await page.keyboard.press("ArrowLeft");
  assert.equal(await page.locator("#profileName").textContent(), "Student One");
  await page.keyboard.press("Escape");
  assert.equal(await page.locator("#profile").evaluate((el) => el.open), false);
  assert.equal(
    await page
      .locator(".tile")
      .first()
      .evaluate((el) => el === document.activeElement),
    true,
  );
  await page.locator("#recordBtn").click();
  assert.equal(
    await page.locator("#recordBtn").getAttribute("aria-pressed"),
    "true",
  );
  assert.match(
    await page.locator(".tile").first().textContent(),
    /Observation/,
  );
  await page.locator("#randomBtn").click();
  assert.equal(await page.locator("#profile").evaluate((el) => el.open), true);
  await page.keyboard.press("Escape");
  await page.locator("#tableBtn").click();
  for (const width of [1440, 768, 390, 320]) {
    await page.setViewportSize({ width, height: 950 });
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
      true,
      `overflow at ${width}`,
    );
    if (width === 1440 || width === 390)
      await page.screenshot({
        path: `/tmp/ep-archive-${width}.png`,
        fullPage: true,
      });
    await page.locator(".tile").first().click();
    assert.equal(
      await page
        .locator("#profile")
        .evaluate((el) => el.scrollWidth <= el.clientWidth),
      true,
    );
    await page.keyboard.press("Escape");
    await page.locator("#recordBtn").click();
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
      true,
      `record overflow at ${width}`,
    );
    await page.locator("#tableBtn").click();
  }
  await page.evaluate(() => {
    students[0].name = "<img src=x onerror=alert(1)>";
    render();
  });
  assert.equal(await page.locator(".tile img").count(), 0);
  await page.evaluate(() => {
    students.splice(0);
    render();
  });
  assert.equal(await page.locator("#randomBtn").isDisabled(), true);
  assert.equal(await page.locator(".empty-state").count(), 1);
  assert.deepEqual(errors, []);
  await browser.close();
  console.log(
    "PASS: profiles, next/previous, keyboard, focus return, modes, random, responsive layouts, escaping, empty state; no runtime errors.",
  );
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
