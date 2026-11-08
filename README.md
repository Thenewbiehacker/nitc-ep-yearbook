# EP / 37 — The batch yearbook

A dark, typography-led yearbook with a shuffleable stack of quotations, a poster
gallery, a name index, and a working student-submission backend. The original
quotations are unchanged. Three fictional profiles are included for design previews.

## Two ways to open it

**Design preview:** open `index.html` directly in a browser. It shows the fictional
profiles from `students.js`. Submission and admin actions require the server below.

**Working website:** install Node.js **24 or later**, then run these commands from
the extracted project folder:

```sh
npm ci
cp .env.example .env
```

On Windows, use `copy .env.example .env` instead. Open `.env` in a text editor and
set `ADMIN_PASSWORD` to your own unique password of at least 16 characters. Then:

```sh
npm start
```

Open:

- **Archive:** http://localhost:3000
- **Student submission:** http://localhost:3000/submit
- **Admin review:** http://localhost:3000/admin

The running website starts empty. It shows only approved database profiles; it
never publishes the fictional preview profiles automatically. No default admin
password is supplied. In development, leaving the password blank disables admin
login; production startup requires it.

## How student data reaches the site

1. A student visits **Add your story**. Anyone with the link can submit; there is
   no invitation code and no student account.
2. They enter their name, quote (240 characters maximum), description (60 maximum),
   optional initials, and optional JPEG/PNG/WebP photo (up to 8 MB and 25 megapixels).
3. They explicitly consent to public publication after review. The server records
   the consent version and timestamp alongside the submission.
4. The backend validates the form, converts photos to WebP, removes photo metadata,
   and stores the submission and image together in SQLite as **pending**.
5. The student receives a **private management link**, with copy and download
   controls. This is the only way to check status or withdraw without an admin.
   No email address is collected, so there is no email receipt or recovery email.
6. An admin signs in, checks the name/photo/quote and confirms that it belongs to
   a classmate. **Approve & publish** makes it public. Rejecting an approved entry
   immediately unpublishes it. Rejected entries remain visible to the admin until
   deleted; students can withdraw them too.
7. `/api/profiles` exposes only approved profiles. The gallery, index, and quote
   stack read that API. Refresh the archive after a moderation change.
8. The private link can permanently delete a submission, its quote, and photo.
   The token is stored as a hash, and appears in the link's URL fragment rather
   than its server-visible path. Anyone possessing that link can withdraw it.

Admin approval is the identity check: the site does not independently verify that
someone is a classmate. Existing profiles aren't editable through the student
form; a student can withdraw and resubmit. Admins can approve, reject, return to
review, or permanently delete, but do not rewrite students' words.

## Backend and storage

- Node.js + Express, with Node's built-in SQLite driver.
- One database at `data/yearbook.sqlite`, including uploaded image bytes.
- SQLite WAL files may sit beside it while the server is running.
- No paid APIs, external database, cloud upload bucket, or email service.
- Admin sessions expire after eight hours. Cookies are HttpOnly and SameSite=Strict;
  production cookies require HTTPS. Changing the admin password invalidates previous
  sessions after restart.
- Mutations check the request origin. `PUBLIC_ORIGIN` must exactly match the URL
  visitors use, including scheme and port. No trailing slash.
- Submission attempts are limited to 120 per IP per hour to accommodate campus Wi-Fi. Login attempts are
  limited to five per IP per 15 minutes. These in-memory limits reset on restart;
  this is a single-server application, not a multi-instance deployment.
- Server source, environment files, database, receipt tokens, and pending photos
  are not publicly served. Public and private APIs use `Cache-Control: no-store`.
- `.env`, `data/`, and `node_modules/` are ignored by Git and omitted from the ZIP.

## Hosting this for the batch

This version needs a **Node server with persistent disk**. Static hosting such as
GitHub Pages alone cannot run its backend. For a single instance:

1. Install Node 24+ on the host, copy the project, and run `npm ci --omit=dev`.
2. Give the app a persistent writable directory; set `DATA_DIR` to that directory.
3. Configure `ADMIN_PASSWORD`, `NODE_ENV=production`, and
   `PUBLIC_ORIGIN=https://your-domain.example` through your host's environment settings.
4. Start it with `npm start` behind an HTTPS reverse proxy.
5. Set `TRUST_PROXY=1` only if exactly one trusted proxy stands between the app and
   visitors. Restrict direct access to the Node port when using that setting.
6. Keep one app instance. Back up the database and test restoring it before inviting
   the batch. Keep dependencies patched.

It has not been deployed or connected to a domain. No real student data or production
credentials are in this package.

## Backups

For a simple consistent backup, stop the server, copy the entire `DATA_DIR` to a
private location, then restart. Restore with the server stopped as well. Do not copy
only the main SQLite file from a running server: uncheckpointed changes may be in
its WAL file. Store backups privately and set a retention period. Withdrawal removes
live data; old backups and copies downloaded by visitors do not disappear automatically.

## Design and Git history

The design research and references are in `DESIGN.md`. Branches are preserved:

- `main` / tag `original-concept`: the untouched original.
- `design/editorial-archive`: the blue fieldbook.
- `design/dark-archive`: the first charcoal revision.
- `design/quote-yearbook`: the new yearbook and backend.

Commit your changes before switching branches. Older branches are static sites,
so opening their `index.html` is the way to preview them.

## Checks

```sh
npm test
npx playwright install chromium
npm run test:ui
```

API tests cover private submissions, consent, origin checks, image validation and
conversion, login, approval/unpublishing, persistence across restart, withdrawal,
admin deletion, logout, source-file isolation, and rate limits. Browser tests cover
the full student → admin → public archive → withdrawal flow, desktop/mobile layouts,
keyboard navigation, quote shuffling, escaping, and empty states. Tests use temporary
storage and generated test passwords, then remove their data. Browser tests reserve
local port 43187. Set `CHROMIUM_PATH` to use an existing compatible Chromium binary.
