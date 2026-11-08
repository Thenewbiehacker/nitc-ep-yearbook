---
type: project
tags:
  - project/class-website
  - nitc/ep
status: planning
---

# NITC EP Batch Website — Project Plan

A four-year keepsake for a batch of **37**: every name, every face, one line each. Built so it still opens in 2036.

## The honest framing

The code is a weekend. The project lives or dies on **content collection** — 37 people, 37 photos, 37 quotes, none of them chasing you. Design the pipeline first, the site second.

Two rules that decide the rest:

1. **One source of truth: a folder of files.** `people/*.md` in a repo. The site is generated from it. Anyone can add themselves without touching code.
2. **Nothing that can be scraped.** Name, photo, line, opt-in links. No phone, no roll number, no DOB, no college email (it dies the week you graduate — collect personal contacts instead).

## Why 37 is a gift

Small enough to do things that don't scale, and you should:

- **You can personally ask all 37.** Not a group broadcast — 37 individual messages. A batch this size has a 90%+ response rate if the ask is personal. Broadcast groups get 40%.
- **One photo day actually finishes.** 4 minutes each = 2.5 hours with breaks, one afternoon, entire batch covered.
- **Everyone is recognisable.** No search, no filters, no pagination needed. One page, 37 tiles, scroll top to bottom.
- **A physical yearbook is affordable.** 37 copies at ~₹600–900 each is a real, achievable thing — and it's the part people keep.
- **Consent is conversational.** You can literally ask each person face to face instead of hiding behind a checkbox.

The risk at this size isn't scale, it's **follow-through**. Nobody is anonymous here, which means a half-finished site is visible to everyone you'll sit next to for four years.

## Decide before building

| Decision | Options | Recommendation |
| --- | --- | --- |
| Audience | Public / unlisted URL / passphrase | Public is fine for name+photo+line if all 37 opt in individually; passphrase if you include hostel, city or inside jokes |
| Photos | One photo day vs. collect individually | **One photo day. Non-negotiable** — one wall, one light, whole batch in an afternoon |
| Quote | Self-written vs. written by a classmate | **Both.** Own line + one line *about* them. The second is what people reread |
| Longevity | Live site vs. archived copy | Both: domain renewed 5 years, static export + print PDF in the repo |

## Three directions — pick one

**A. The Periodic Table of the Batch** *(recommended)* — 37 people, 37 elements: atomic numbers 1 through 37, ending at rubidium. Each tile is a person: symbol from initials, name, one-word "property" (`Volatile`, `Inert until 2 a.m.`, `Sublimes under deadline`), photo on expand, and a real element whose traits get joked about in the card.

Physics-native, reads as a whole-batch portrait at a glance, needs no navigation at this size, and every tile is a ready-made share image. Faculty are the noble gases; "Things We Survived" is the table of disasters.

*Risk:* clip-art atoms and gimmick fatigue. Keep tiles typographic and restrained; the joke should live in the copy, not in the graphics.

**B. The Lab Record** — the site is a bound lab notebook: ruled paper, taped photos, graph margins. Each person is `Experiment No. N` — Aim / Apparatus / Observation / Conclusion. Deeply EP, and the jokes write themselves ("Conclusion: the error was human").

**C. Editorial yearbook** — dark paper, duotone portraits, one person per screen, scrolls like a magazine. Safest, ages best, least distinctive.

Whatever you pick, **photography is the design.** A plain site with 37 consistent portraits beats a beautiful site with 37 phone selfies.

## Data model

One Markdown file per person. Frontmatter only, so a contributor edits their own file.

```yaml
name: Devang Agarwal
file: devang.webp
quote: "Came for the physics, stayed for the 2 a.m. doubts."
about: "The only one who actually read the lab manual before the viva."   # from a classmate
property: Volatile            # the one-word "element" descriptor
superlative: Most likely to fix the oscilloscope with a pencil
hostel: <optional, only if the site isn't fully public>
then: devang-year1.webp       # year-1 photo — start collecting NOW
voice: devang.m4a             # 12 seconds, optional
links:                        # optional, opt-in
  github: https://github.com/...
  linkedin: https://linkedin.com/in/...
consent: true
```

Stats, map, timeline, share cards: all derived. Never hand-maintained.

## Collection pipeline

1. **Google Form**, 6 fields max: name, how to pronounce it, your line, your friend's line about you, photo upload, optional links. Consent sentence you'll actually rely on: *"I'm okay with this being public on `<domain>`, and I can ask for removal at any time."* Back it with a personal ask in person.
2. **Photo day.** Dept corridor or hostel common room, one plain wall, window light, 4:5 crop, shoulders up, two frames each, 4-minute timer per person. Same wall for all 37 or the grid dies.
3. **Progress page on the site:** `24 / 37 submitted`. At this size, a visible list of names still missing is the strongest possible pressure — and harmless, because it's all friends.
4. Two reminder waves, then a **hard cut-off**, then ship. Late joiners get an initials tile you can fill in later.
5. **Pair people up for quotes:** each person writes about one other, in a ring. Guarantees all 37 "about" lines exist and turns collection into 37 five-minute conversations instead of one big ask.

## Build phases (3 weeks, part-time)

**Week 0 — foundation.** Name + domain (~₹1,000/yr). Repo, empty deploy on Cloudflare Pages or Vercel. Consent sentence + takedown contact. Five fake profiles to lock the layout.

**Week 1 — pipeline.** Form live, photo day booked. Bulk importer: CSV → Markdown + image processing (face-centred crop → 800×1000 WebP → one shared grade so mismatched photos stop mismatching). Five real profiles up, link in the group.

**Week 2 — bulk.** Everything else in, chase the stragglers, add per-person share cards so a forward shows *that person's* face and line. At 37, skip search and filters — add "random classmate" and nothing else.

**Week 3 — ship.** Phone QA on 4G, keyboard/a11y pass, consent audit against form responses, soft launch to 5 people, then the group + a QR code. Take the group photo *before* launch — it's the homepage hero.

**After launch.** Superlatives vote (one week), the "survived" timeline, and the time capsule.

## Additions that make it a keepsake, not a contact list

- **A line from a friend, not just a self-quote.** Self-descriptions are aspirational; a friend's sentence is the memory.
- **12-second voice note.** Years later the voice outvalues the photo. Cheapest emotional payload in the project.
- **Then/now slider.** Needs year-1 photos — ask *this week*, while you're still in year one.
- **"Things We Survived" timeline.** Endsems, lab vivas, the thermal course, fest week, the batch trip, the night before submission. This is the page people talk about.
- **Campus memory map.** Click a place — OAT, main building, library, canteen, the hostel corridor — see whose memory is pinned there.
- **Superlatives, EP-flavoured.** Most likely to do a PhD, most likely to break the apparatus, actually understood tensors first, has never entered the library. With 37 people the vote takes one poll and everyone knows everyone.
- **Time capsule page** that refuses to render until convocation. Guarantees a visit *after* everyone scatters — exactly when the site earns its keep.
- **"Where are we now"** with a yearly one-line update form. This is what keeps it alive in year 8.
- **Physical yearbook at 37 copies.** Print export → PDF → local printer, plus one copy for the department. Site is for the group chat; the book is for their parents.
- **Department folklore glossary**, and a faculty page (with consent) as instrument manuals — high-risk, get permission first.

**Skip:** DMs, comments, accounts, leaderboards. Each turns a keepsake into a moderation job.

## Stack and cost

- **Astro** + content collections + `sharp`. Static, no database, no auth, builds in seconds, runs on any host forever. 37 profiles is a folder, not a schema.
- Cloudflare Pages or Vercel free tier. Pre-optimised WebP in the repo is enough.
- **Site: under ₹1,500 total** (almost all domain, renew 5 years day one). **Print: ~₹25–35k** if you gift 37 copies — decide early whether that's batch-funded (₹700 each) or optional at cost.

## Failure modes, named

- **The domain lapse.** The #1 way these die in year two. Multi-year renewal, calendar reminder, owner written down.
- **One tired owner.** Two: one content, one code. Both with repo and domain access.
- **A takedown request.** It will happen once. Remove within 48 hours, no debate. The consent checkbox is cover; fast removal is the reputation.
- **Design over content.** If you're choosing fonts while the form has 8 responses, you've lost the month.
- **Scope creep into a social network.** If a feature needs moderation, it doesn't ship in v1.
- **Unofficial-site blur.** No NITC or department logo; footer says "made by students of the 20XX EP batch".

## First three actions

1. Send 37 individual messages with the form — the quote wording matters more than anything on this page.
2. Book the photo day with 4-minute slots and pick the wall.
3. Deploy one page with 5 real profiles and post it. Momentum comes from seeing yourself online, not from a plan.

## Open questions

- Is 37 the whole batch including lateral entries, and does everyone already know each other?
- Fully public, or passphrase?
- Who holds the camera, and who is the second owner?
