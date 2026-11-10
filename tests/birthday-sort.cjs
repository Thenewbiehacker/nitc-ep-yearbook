const { chromium } = require("playwright");
const assert = require("node:assert/strict");
const { pathToFileURL } = require("node:url");
const path = require("node:path");

(async () => {
  const browser = await chromium.launch({
    headless: true, executablePath: process.env.CHROMIUM_PATH || undefined,
  });
  try {
    const page = await browser.newPage();
    const errors = [];
    page.on("pageerror", error => errors.push(error.message));
    await page.clock.setFixedTime(new Date("2026-12-31T06:00:00Z"));
    await page.goto(pathToFileURL(path.resolve(__dirname, "../index.html")).href);
    const fixtures = [
      { name: "Jan First", birthday: "01-01-2006" },
      { name: "Yesterday", birthday: "30-12-2005" },
      { name: "Today", birthday: "31-12-2004" },
      { name: "Missing", birthday: null },
      { name: "Leap", birthday: "29-02-2004" },
      { name: "Legacy", birthday: "01-02" },
      { name: "Also Tomorrow", birthday: "01-01-2007" },
      { name: "Invalid", birthday: "31-04-2004" },
    ];
    await page.evaluate(profiles => {
      students.splice(0, students.length, ...profiles.map(person => ({
        ...person, initials: "TS", quote: "A test quote", property: "Test profile",
      })));
      render();
    }, fixtures);
    const names = () => page.locator(".tile strong").allTextContents();
    await page.getByLabel("Sort by").selectOption("birthday");
    assert.deepEqual(await names(), ["Today", "Jan First", "Also Tomorrow", "Legacy", "Leap", "Yesterday", "Missing", "Invalid"]);
    assert.match(await page.locator("#birthdaySummary").textContent(), /Next up: Today.*Today!/);
    assert.match(await page.locator(".tile").first().textContent(), /31-12 · Today!/);
    assert.match(await page.locator(".tile").nth(1).textContent(), /01-01 · Tomorrow/);
    assert.match(await page.locator(".tile").nth(3).textContent(), /02-01 · In 2 days/);
    assert.match(await page.locator(".tile").nth(6).textContent(), /Birthday not provided/);
    assert.deepEqual(await page.evaluate(() => students.map(person => person.name)), fixtures.map(person => person.name));

    await page.locator(".tile").nth(1).click();
    assert.equal(await page.locator("#profileName").textContent(), "Jan First");
    assert.equal(await page.locator("#profilePosition").textContent(), "2 / 8");
    assert.equal(await page.locator(".section-kicker").textContent(), "Story 01");
    await page.getByRole("button", { name: "Next →" }).click();
    assert.equal(await page.locator("#profileName").textContent(), "Also Tomorrow");
    await page.keyboard.press("ArrowLeft");
    await page.keyboard.press("ArrowLeft");
    assert.equal(await page.locator("#profileName").textContent(), "Today");
    await page.keyboard.press("ArrowLeft");
    assert.equal(await page.locator("#profileName").textContent(), "Invalid");
    await page.keyboard.press("Escape");
    await page.locator('.quote-card[data-slot="0"]').click();
    assert.equal(await page.locator("#profileName").textContent(), "Jan First");
    await page.keyboard.press("Escape");

    for (const width of [1440, 768, 390, 320]) {
      await page.setViewportSize({ width, height: 950 });
      for (const view of ["recordBtn", "tableBtn"]) {
        await page.locator("#" + view).click();
        assert.deepEqual(await names(), ["Today", "Jan First", "Also Tomorrow", "Legacy", "Leap", "Yesterday", "Missing", "Invalid"]);
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, `${view} overflow at ${width}`);
      }
      if (width === 1440 || width === 390) {
        await page.locator("#people").scrollIntoViewIfNeeded();
        await page.screenshot({ path: `/tmp/ep-birthdays-${width}.png` });
      }
    }
    await page.getByLabel("Sort by").selectOption("archive");
    assert.deepEqual(await names(), fixtures.map(person => person.name));
    assert.equal(await page.locator("#birthdaySummary").isVisible(), false);
    assert.equal(await page.locator(".birthday-preview").count(), 0);
    await page.getByLabel("Sort by").selectOption("birthday");

    // The next day begins in India while it is still December 31 in UTC.
    await page.clock.setFixedTime(new Date("2026-12-31T20:00:00Z"));
    await page.evaluate(() => refreshBirthdayOrder());
    assert.deepEqual((await names()).slice(0, 3), ["Jan First", "Also Tomorrow", "Legacy"]);
    assert.match(await page.locator("#birthdaySummary").textContent(), /Jan First, Also Tomorrow.*Today!/);
    const calendar = await page.evaluate(() => ({
      beforeMidnight: birthdayToday(new Date("2026-12-31T18:29:59Z")),
      atMidnight: birthdayToday(new Date("2026-12-31T18:30:00Z")),
      nonLeapEve: nextBirthday("29-02-2004", Date.UTC(2027, 1, 28)).days,
      nonLeapDay: nextBirthday("02-29", Date.UTC(2027, 2, 1)).days,
      leapEve: nextBirthday("29-02-2004", Date.UTC(2028, 1, 28)).days,
      leapDay: nextBirthday("29-02-2004", Date.UTC(2028, 1, 29)).days,
      invalid: [null, "", "not-a-date", "29-02-2007", "29-02", "00-12-2004"].map(value => nextBirthday(value)),
    }));
    assert.deepEqual(calendar, {
      beforeMidnight: Date.UTC(2026, 11, 31), atMidnight: Date.UTC(2027, 0, 1),
      nonLeapEve: 1, nonLeapDay: 0, leapEve: 1, leapDay: 0,
      invalid: [null, null, null, null, null, null],
    });
    await page.evaluate(() => {
      students.splice(0, students.length, { name: "No date", quote: "Test", property: "Test" });
      render();
    });
    assert.equal(await page.locator("#birthdaySummary").textContent(), "No birthdays have been added yet.");
    await page.evaluate(() => { students.splice(0); render(); });
    assert.equal(await page.locator(".tile").count(), 0);
    assert.equal(await page.locator("#grid .empty-state").count(), 1);
    assert.deepEqual(errors, []);
    console.log("PASS: upcoming birthday ordering, India midnight/year rollover, ties, leap days, legacy/missing dates, profile navigation, original story numbers, both views, and responsive layouts.");
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exit(1); });
