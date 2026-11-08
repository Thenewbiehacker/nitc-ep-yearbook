# NITC EP batch archive

Open `index.html` in a browser. Use the switch at the top to explore the periodic table and lab record concepts. Both use the same data; the three entries are fictional examples, not real student information.

## Add the batch

1. Open `students.js` in a text editor. Replace the example entries with the 37 students, one object per person. Copy an existing line for each entry, keeping the commas and quotation marks.
2. Fill in `name`, `initials`, `quote`, and `property` (a short description). Use double quotes around each value; escape a double quote inside a value as `\"`.
3. Put photos in `photos/` and set, for example, `photo: "photos/asha.jpg"`. Leave it as `""` to show initials instead.
4. Save and refresh the browser. Order in the file determines the element/experiment number. There is no hard limit of 37.

Collect each person's agreement to publish their details and let them review their quote and photo. The site is currently static: updating `students.js` and photos updates both designs, but changes must be re-deployed if hosted. Publishing the files makes their contents public; an unlisted URL is not access control. No real student details are included yet.

## Plan

Start with 37 consenting student profiles, then choose a design with the batch. Photos can be collected individually or at a shared photo session. Consider a memories timeline, map, or print edition later. Faculty are not part of the current project; a future optional section could celebrate selected faculty with their consent. The original brainstorming plan is retained separately for reference; its faculty suggestions and speculative costs/response rates are not commitments.

## Design revision

The redesigned archive uses a blue fieldbook palette, a local SVG wave study,
a 37-place grid, and alternate lab records. Open a profile for previous/next
navigation (or use the left/right arrow keys); Escape closes it. The random
button opens one of the available profiles. Vacant places aren't clickable.

The three sample entries have `example: true`. Remove that flag (or set it to
`false`) when replacing each with an agreed real profile. Sample labels and
counts update from the data. Missing photos fall back to initials. Google Fonts
are optional; system fonts are used when offline. No build or server is needed.

### Compare or restore

The original is preserved on `main` and tagged `original-concept`. The new UI
is on `design/editorial-archive`.

```sh
git switch main                      # View the original
git switch design/editorial-archive  # Return to the redesign
```

Commit any future edits before switching branches. Nothing has been published.

### Checks

`node --check app.js` checks JavaScript syntax. `tests/check.cjs` is a Playwright
smoke test covering profiles, focus restoration, view switching, random selection,
mobile overflow, escaped content, and empty data. With Playwright installed, run
`node tests/check.cjs`; optionally set `CHROMIUM_PATH` to an existing Chromium
executable. Screenshot outputs go to `/tmp/ep-archive-1440.png` and
`/tmp/ep-archive-390.png`.

## Dark edition

The active design is on `design/dark-archive`: charcoal surfaces, Instrument
Serif headings, Manrope body text, silver wave artwork, and a compact profile
collection. Only a small preview of vacant places is shown; all actual profiles
remain visible. The earlier blue design remains on `design/editorial-archive`.
