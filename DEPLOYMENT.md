# Deployment and long-term upkeep

Live: https://nitc-ep-yearbook.devangagarwal2007.workers.dev

Worker: `nitc-ep-yearbook` · D1: `nitc-ep-yearbook` (APAC)

The non-secret account/database IDs are recorded in `wrangler.jsonc`. The source
repository is https://github.com/Thenewbiehacker/nitc-ep-yearbook, default branch
`design/quote-yearbook`. The public website does not require GitHub access.

## Deploy an update

On a trusted machine with Node 24+:

```sh
npm ci
npx wrangler login
npm test
npm run build:cloudflare
npx wrangler d1 migrations apply nitc-ep-yearbook --remote
npm run deploy:cloudflare
```

Wrangler login must use the Cloudflare account owning this Worker. For headless
work, use a scoped `CLOUDFLARE_API_TOKEN` environment variable with Workers Scripts
Edit, D1 Edit, and Account Settings Read permissions for that account. Never place
the token in source, command history, issue text, or browser JavaScript.

Only the explicit allowlist of frontend files is copied to `dist/public`. The Worker
checks routes before serving them. `.env`, `.dev.vars`, source files, test files, local
databases, and backups aren't deployed as assets.

Migrations are append-only SQL under `migrations/`. Do not edit an already-applied
migration. Back up before schema/data changes. `wrangler deploy` preserves D1 data
and configured secrets; creating a new Worker or database does not move old data.

## Admin access

Open `/admin` and enter the password supplied privately during deployment. Students
cannot access the review API without a session, and pending images are private.

To replace the password, run:

```sh
npx wrangler secret put ADMIN_PASSWORD
```

Enter a unique 16–256 character password at the hidden prompt. Existing sessions
stop being accepted after rotation. Keep recovery access to the Cloudflare account;
the website itself has no email password-reset system. No deployment API token is
stored in the application.

The Worker checks mutation origins against its own HTTPS origin. If `PUBLIC_ORIGIN`
is explicitly configured later, it must exactly match the site's scheme/host and
must be updated for a custom domain. Do not set it to a trailing-slash URL.

## Backups and restoration

Cloudflare D1 includes automatic Time Travel recovery: seven days on Workers Free.
For independent, longer-term backups, run after content collection and before changes:

```sh
npm run backup:cloudflare
```

This writes a timestamped SQL export to the Git-ignored `backups/` directory. Keep
copies privately outside the hosting account (for example in encrypted personal
storage). A backup contains private submissions and images, so don't publish it or
add it to Git. Set a retention period. Withdrawals remove live records, but old backups
retain them until those backups are deleted or expire.

Use `npx wrangler d1 time-travel info nitc-ep-yearbook` to inspect recovery bookmarks.
Before any restore, export the current database and assess which later changes would
be reverted. Restore to a separate test database first for a SQL export, or use the
Cloudflare dashboard's D1 Time Travel flow for a point-in-time rollback. Do not blindly
import an export into the existing database; its CREATE statements/data may conflict.

## What it needs to stay available

- Keep the Cloudflare account active, with recovery codes and a second trusted maintainer.
- Keep the admin password and GitHub access recoverable.
- Review pending submissions; clear old spam/rejections before the 200-entry safety cap.
- Check usage occasionally and apply dependency/security updates.
- Keep independent backups. D1's seven-day recovery is not a years-long archive.
- If buying a custom domain, keep its annual renewal active. The current workers.dev
  address doesn't require buying a domain.

No laptop or home server needs to remain on. The free tier is quota-limited and is
not a promise of uninterrupted service or unchanged pricing forever. The expected
37-person batch workload is small, but the account's other Workers share quotas.

## Free-plan limits checked on 2026-11-08

Workers Free includes 100,000 requests/day and a 10 ms CPU-time limit per invocation.
The deployed bundle started in 1 ms during the initial deployment. Heavy photo decoding
is done in the student's browser; the Worker performs bounded structural validation.
All requests currently go through the Worker, including static assets.

D1 Free includes 5 million rows read/day, 100,000 rows written/day, and 5 GB total
account storage, with 500 MB per database. This app caps submissions at 200 and each
portrait at 1 MB, so its profile storage stays comfortably below that per-database
limit. The rate-limit/session tables also use storage. Free quotas can stop requests
if exceeded; don't treat them as unlimited.

Official sources:

- https://developers.cloudflare.com/workers/platform/pricing/
- https://developers.cloudflare.com/workers/platform/limits/
- https://developers.cloudflare.com/d1/platform/pricing/
- https://developers.cloudflare.com/d1/platform/limits/
- https://developers.cloudflare.com/d1/reference/time-travel/

The current deployment uses the free Workers/D1 services. No paid plan, custom domain,
R2 bucket, or paid image service was enabled.
