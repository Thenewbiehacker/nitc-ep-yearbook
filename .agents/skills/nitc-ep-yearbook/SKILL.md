---
name: nitc-ep-yearbook
description: Maintain, troubleshoot, or deploy Devang Agarwal's NIT Calicut Engineering Physics batch yearbook, including its Cloudflare Worker and D1 backend.
---

# Maintain the EP yearbook

Find the checkout for the private repository
`https://github.com/Thenewbiehacker/nitc-ep-yearbook` on branch
`design/quote-yearbook`. If it is unavailable locally, use the user's authenticated
GitHub access to clone it; do not request or expose a token in chat. Read the
repository's `AGENTS.md` and `README.md`, and read `DEPLOYMENT.md` for hosting,
backups, migrations, or release work.

Carry out the user's requested change, preserve the site's established design and
private submission/approval/withdrawal workflow, and verify the relevant behavior.
For an authorized deployment, push the intended branch and deploy the matching
source to the existing Cloudflare Worker; GitHub pushes do not deploy automatically.
Preserve the existing D1 database and runtime secrets. Do not create paid resources
or change billing without explicit authorization. Report the result and live URL.
