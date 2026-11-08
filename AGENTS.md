# NITC EP yearbook: project context for maintainers

This repository is the source of the NIT Calicut Engineering Physics batch
archive. The site is a student-made keepsake, credited to Devang Agarwal, CR of
the first sem. Preserve the approved dark quote-card design and existing copy
unless the user asks for a change. The three fictional examples are shown only
when there are no approved profiles; do not mistake them for real students.

## Find the source and production

- Private GitHub repository: https://github.com/Thenewbiehacker/nitc-ep-yearbook
- Default and production source branch: `design/quote-yearbook`.
- Production: https://nitc-ep-yearbook.devangagarwal2007.workers.dev
- Student submission: `/submit`; admin review: `/admin`.
- Read [README.md](README.md) for product behavior and local setup; read
  [DEPLOYMENT.md](DEPLOYMENT.md) before a production change or database operation.
- This is a Cloudflare Worker with a persistent D1 database. `wrangler.jsonc`
  contains the existing, non-secret account and database identifiers. Reuse them;
  don't create a replacement Worker or database for ordinary updates.

## Typical maintenance request

1. Inspect the current branch, Git status, remote, and recent changes. Preserve
   the user's uncommitted work and fetch current remote state before editing.
2. Implement the requested change. Frontend files are at the repository root;
   `worker/index.js` implements production APIs; `migrations/` owns the D1
   schema; `backend/app.js` is the separate optional local Node implementation.
   `scripts/build-cloudflare.mjs` explicitly lists files shipped to the Worker.
3. Use Node 24+. Run `npm ci` if dependencies are missing, then `npm test`.
   For frontend or production API changes also run `npm run test:cloudflare`
   after installing Playwright Chromium; `npm run test:ui` covers the Node path.
4. If asked to publish, commit and push the intended branch, then deploy the
   matching source with `npm run deploy:cloudflare`. GitHub pushes alone do not
   deploy. Confirm the public page and affected behavior after deployment, and
   report the live URL and verification. Do not publish for a review-only request.

## Production data and access

- Pending submissions and photos must stay private. Publishing requires admin
  approval. Keep consent and private withdrawal functionality intact.
- D1 holds production records and image bytes. Local Node SQLite and Wrangler's
  local D1 are separate databases; neither automatically syncs with production.
- Preserve existing D1 bindings and data. For schema changes, append a migration,
  take a private backup, test locally, and apply the new migration remotely before
  deploying. Never edit an applied migration or reset production as a shortcut.
- Read-only checks should not alter real records. Production smoke tests that create
  entries must use clearly labeled temporary data and guarantee cleanup; the
  existing `tests/live-smoke.mjs` briefly publishes a test profile, so use it only
  when that side effect is appropriate and authorized.
- Never commit, print, or ask for credentials in chat. Use existing authenticated
  tooling or the environment's private secret mechanism. `ADMIN_PASSWORD` is a
  Cloudflare runtime secret; do not replace or rotate it unless requested. Keep
  `.env`, `.dev.vars`, database exports, photos, and backups out of Git.
- The site is expected to fit the free tier, but limits/prices can change. Don't
  enable a paid plan, purchase a domain, change ownership, delete resources, or
  alter billing without explicit authorization.
