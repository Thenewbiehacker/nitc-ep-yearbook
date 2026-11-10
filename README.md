# EP / 37 — The batch yearbook

**Live site:** https://nitc-ep-yearbook.devangagarwal2007.workers.dev

**Submit a story:** https://nitc-ep-yearbook.devangagarwal2007.workers.dev/submit

**Admin review:** https://nitc-ep-yearbook.devangagarwal2007.workers.dev/admin

Built by **Devang Agarwal, CR of the first sem**. A student-made, unofficial NIT
Calicut Engineering Physics archive with a quote deck, poster gallery, name index,
and moderated submissions. Design references are in `DESIGN.md`.

## Student → archive

1. Anyone with the link can submit their name, quote, description, birthday (month and day only), photo,
   and consent. Students do not need accounts or an invitation code.
2. Submissions remain private until an admin checks and approves them.
3. Approved profiles appear publicly on the next page load. Rejecting an approved
   profile removes it from public view immediately.
4. Students receive a private management link to check status or permanently withdraw
   their submission. Save it: no email address is collected and no receipt is emailed.
5. Admins can approve, reject, return to review, or delete. Student edits currently
   mean withdrawing and submitting a revised profile.

Until the first real profile is approved, the homepage shows three clearly labeled
fictional examples so visitors can see the design. These are never seeded into the
student database. Real approved profiles replace all examples automatically.

## Production hosting

Production runs on **Cloudflare Workers + D1** under the owner's Cloudflare account.
D1 stores both profile records and portrait bytes persistently across deployments.
There is no Node server to keep awake, local disk to lose on a restart, paid image
service, or external database. The public `workers.dev` domain includes HTTPS.

See **[DEPLOYMENT.md](DEPLOYMENT.md)** for deployment, credential rotation, backup,
limits, and long-term upkeep. Source is stored in the private GitHub repository
https://github.com/Thenewbiehacker/nitc-ep-yearbook on `design/quote-yearbook`.
Git pushes do not automatically deploy; use the documented deploy commands.

The admin password is a Cloudflare runtime secret. No real password, API token,
student database, or private backup belongs in Git or the downloadable ZIP.

## Photo processing and privacy

The form accepts JPEG, PNG, or WebP up to 8 MB and 25 megapixels. The browser resizes
it to at most 1000 × 1200 and encodes a JPEG under 1 MB. The Worker independently
bounds request size, validates JPEG structure/dimensions, and strips metadata before
storing it. It does not fully decode compressed pixels; the browser handles decoding
and admins inspect the photo before publication. The optional Node backend below
also fully decodes and re-encodes the image using sharp.

Consent version/timestamp and private withdrawal-token hashes are stored privately.
Only approved profile fields are public. Token links put the secret in the URL
fragment, not the server-visible path. Anyone with a student's private link can
withdraw that student's story. The form is not an identity check: admins must confirm
that submissions belong to classmates before publishing.

Production rate limits are stored in D1: 120 submissions/IP/hour (campus Wi-Fi friendly),
5 login attempts/IP/15 minutes, and 30 withdrawal attempts/IP/15 minutes. Admin cookies
are HttpOnly, Secure, SameSite=Strict, and expire after eight hours. Password rotation
invalidates prior sessions. Writes check their request origin. A 200-submission storage
cap includes pending, approved, and rejected entries; delete old spam/rejections when
needed. This keeps storage bounded for a 37-person batch.

## Work locally

Install Node.js **24 or later**, then `npm ci`.

### Design preview

Open `index.html` directly: fictional samples, no server needed. Submission and admin
pages explain that they need a running backend.

### Cloudflare-equivalent development

```sh
npm run build:cloudflare
npx wrangler d1 migrations apply nitc-ep-yearbook --local
```

Copy `.dev.vars.example` to `.dev.vars`, set your own development admin password
(16–256 characters), and run `npm run dev:cloudflare`. Open the URL Wrangler prints.
Local D1 data is separate from production. Never use `--remote` for a local test.

### Optional Node + SQLite backend

The original standalone server remains available:

```sh
cp .env.example .env
npm start
```

On Windows, use `copy .env.example .env`. Set `ADMIN_PASSWORD` in `.env` before signing
in at http://localhost:3000/admin. Data is stored in `data/yearbook.sqlite`; the Node
server needs a persistent disk if hosted elsewhere. The Node server and Cloudflare
backend use separate databases. No data synchronization between them is automatic.

## Checks

```sh
npm test
npx playwright install chromium
npm run test:ui
npm run test:cloudflare
```

These check API privacy, consent, upload processing, approval, rejection, withdrawal,
authentication, rate limits, and source-file isolation. Browser tests exercise the
student → admin → published profile → withdrawal flow against both Node and the actual
Cloudflare workerd/D1 emulator, including PNG-to-JPEG preparation and mobile layouts.
Tests use temporary storage and generated test passwords. `CHROMIUM_PATH` can point
to an already installed compatible browser. Node UI tests reserve port 43187.

`tests/live-smoke.mjs` is an **explicit production test**, not part of the automatic
suite. It creates, briefly publishes, and removes one labeled test profile, and reads
a password only from the file designated by `ADMIN_PASSWORD_FILE`.

## Git history

- `main` / tag `original-concept`: untouched original.
- `design/editorial-archive`: blue fieldbook.
- `design/dark-archive`: first charcoal revision.
- `design/quote-yearbook`: current design, Node backend, and Cloudflare deployment.

Commit local changes before switching branches. Earlier branches are static sites.
