# BRC Map

[![CI](https://github.com/q-33/brcmap/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/q-33/brcmap/actions/workflows/ci.yml)

Find your people on the playa. An unofficial, community map of **Black Rock City** —
mark your camp's location before you arrive and update it once you have service on playa.

**Live: [brcmap.net](https://brcmap.net)**

Built by burners — and, in real partnership, by an AI. Most of this code was
written by [Claude](https://claude.com/claude-code) pairing with the team, and
we think the result argues for itself: careful AI collaboration can produce
software worth trusting. The AI's own account is in
[Notes from the field](#notes-from-the-field--2026).

> Unofficial map. Pins are approximate and do not equal reserved space. Only Burning Man
> Placement determines camp locations and only the ARTery determines art placement.

## What it does

### Map
- **Tile-free BRC map** — the city is drawn from a parametric geocoder + the official
  2026 plan geometry, so it renders the street grid (and works) without any map provider.
- **Official-plan styling** — the default **Blocks** basemap mirrors the printed plan
  (blue camp blocks, dark street grid, radial gradient fans, plazas, the Center Camp
  keyhole, trash-fence pentagon). Toggle to a **Streets** vector basemap.
- **Camp plots** — a camp can set a frontage/depth footprint that draws a to-scale plot
  rectangle, oriented to the street grid, as you zoom in.
- **Where am I** — live GPS on the city grid with a reverse-geocoded readout
  (e.g. _"near 7:30 & Eternal"_), a compass rose, and a live **weather** widget.
- **Live weather** — a status pill fed by on-playa stations (BRC NOC first) with the
  dust risk in words, and a map that shows it: dust motes that billow with the real
  gusts, rain that falls when the model says rain.
- **Sun & shade** — pick a date and time to cast every camp's shadow, for planning shade.
- **Civic landmarks** — medical, Rangers/safety, services (Ice, DPW, Playa Info…),
  transport (airport, Greeters, fuel) and the Temple. Porta-potty banks are available as a
  layer but hidden by default until the 2026 placement is known.
- **Layer toggles** — declutter the map by category (camps, art, services, …).

### Community
- **Drop your camp** — log in, tap the map to place a pin at the **exact spot** (no
  snapping), name it, done. One camp per user (Hubs may run several) — move, rename, or
  reshape it anytime.
- **The whole city** — alongside the camps who registered here, the map mirrors Burning
  Man's public **placement directory** (~1,000 camps geocoded from their `7:30 & E`
  strings) and the official **art directory** (351 artworks with GPS). Directory camps
  carry `source: official`, get their own Layers switch, and **never override a pin a
  person placed**.
- **Live boundary editor** — drag the centre pin to move a camp and drag any of its four
  sides to reshape its plot, live on the map. Owners can edit their own; Hubs, Org, and
  admins can edit any.
- **Art & open calls** — register artworks, mark their location, and post an open
  **call** for community contributions (owner-moderated).
- **Events** — camps announce planned events; browse them grouped by day.
- **Rideshares** — offer empty seats or ask for a ride out; posts carry destination,
  timing, luggage/seats and the poster's current camp, and connect through messages.
  **Connect** lets two matched burners share live location with each other — mutual
  consent, deleted the moment either stops, no history kept — to actually find each
  other for the pickup. The board also mirrors [ridefinder.site](https://ridefinder.site)'s
  public listings (read-only, attributed, replies happen there).
- **Exodus** — a live "how long is Gate Road taking" page: one-tap anonymous crowd
  reports (median of the last two hours, one report per person per half hour), the
  org's @bmantraffic mirrored when X permits, and the standing get-out advice. On the
  homepage, **Gate Road wears its Level of Service** — the corridor breathes green
  (free flow) through red (gridlock) while reports are fresh, and a **procession of
  taillights** crawls out the road: one light per open ride post, at the crowd-reported
  pace.
- **In-app messaging** — 1:1 direct messages between users ("Message the organizer"
  on any camp/art), an inbox with unread badges, and a **Message the Admin** chat. An
  optional email nudge fires on the first unread.
- **Playa radio & webcast** — BMIR and Shouting Fire play from the map's status pill
  through one app-wide player that survives navigation (a floating now-playing bar);
  /live adds the official YouTube webcast, click-to-load so nothing streams until asked.
- **Contact & password reset** — a contact form and self-service password reset, both
  delivered by email.
- **Browse & search** camps and art (Postgres-native, no external index).

### Offline & off-grid
- **Installable, offline-first PWA** — add BRC Map to your home screen; once you've
  opened it online it caches the whole app, so the city map, labels, your GPS dot, the
  address readout, and last-synced camps/art all work with **no signal on the playa**. The
  map is tile-free and the fonts are self-hosted, so it has zero external runtime deps.
- **Download for the playa** — a one-tap pre-sync (in the footer) that warms the caches
  before you lose service, with a "ready for the playa ✓" status.
- **Meshtastic mesh** — connect a [Meshtastic](https://meshtastic.org) LoRa radio over
  **Bluetooth or USB** to see **your people live on the map** and **chat off-grid** with no
  internet. Peers and messages persist across reloads (a "where I last saw my people"
  view). Works in desktop/Android Chrome & Edge; on iPhone use the native Meshtastic app.
  Setup lives in the in-app **Guide → Meshtastic**.

### Accounts & moderation
- **Auth** — email/password sessions (`nuxt-auth-utils`) with self-service password reset.
- **Roles** — `user` / `tco` (theme-camp organizer) /
  `hubs` (runs multiple camps; can place/edit any camp) / `org` (Burning Man Org) /
  `admin`, applied live without re-login.
- **Admin panel** — people & roles, content management (edit/hide/delete camps, art,
  events), a who's-online view, a recent submissions feed, an audit log, and an
  **anonymous usage pulse** (active now / 24 h / 7 days, busiest pages, Meshtastic
  connects) built on a daily-rotating hash — no IPs stored, nobody trackable across
  days; /about explains it in plain words.
- **Camp moderation from the list** — Hubs/Org/admins can edit a camp's details from the
  public Camps list; admins can delete camps created in error.
- **Convert art to camp** — an admin tool to fix pins dropped as art that should be camps.
- **Feature flags** — per-user early access to upcoming features.
- **Current-year aware** — 2026 themed street names (_Axis Mundi_: Ararat → Kundalini).
- **Notifications** — the admin is emailed on new signups and contact-form submissions.

### Security
- Per-route rate limiting (login, registration, contributions), same-origin CSRF checks
  on API mutations, HTML-escaped map popups (so a camp/art name can't inject script),
  single-use SHA-256-hashed password-reset tokens, and timing-equalized login. New
  high/critical dependency advisories fail CI.

## Stack

| | |
|---|---|
| Frontend | [Nuxt 4](https://nuxt.com) + [Nuxt UI](https://ui.nuxt.com) (Reka + Tailwind) |
| Map | [MapLibre GL](https://maplibre.org) — tile-free, self-hosted glyphs |
| Offline | [@vite-pwa/nuxt](https://vite-pwa-org.netlify.app) — installable PWA, custom Workbox service worker |
| Mesh | [Meshtastic](https://meshtastic.org) via `@meshtastic/core` (Web Bluetooth / Web Serial); mesh state in IndexedDB |
| API / auth | Nitro server routes + [nuxt-auth-utils](https://github.com/atinux/nuxt-auth-utils) |
| Data | [Drizzle ORM](https://orm.drizzle.team) → DigitalOcean **Postgres + PostGIS** |
| Geocoder | `lib/brc` — parametric BRC address ⇄ lat/lng (pure TS, tested) |
| Email | DreamHost SMTP via [Nodemailer](https://nodemailer.com) — contact, password resets, notifications |
| Hosting | DigitalOcean App Platform (Node service) |

## Develop

```bash
pnpm install

# .env (gitignored) needs:
#   DATABASE_URL=postgresql://…           # Postgres with PostGIS
#   NUXT_SESSION_PASSWORD=…               # 32+ char session secret (auto-added in dev)
#
# Email is optional — if SMTP_PASSWORD is unset the email helpers no-op and the
# app still runs. To enable outbound email (contact form, password resets, nudges):
#   SMTP_PASSWORD=…                       # mailbox password (required to send)
#   SMTP_USER=digit@brcmap.net         # default shown
#   SMTP_HOST=smtp.dreamhost.com          # default shown
#   SMTP_PORT=465                         # default (implicit SSL)
#   EMAIL_FROM="BRC Map <digit@brcmap.net>"   # default sender
#   CONTACT_TO=digit@brcmap.net        # where the contact form lands

pnpm db:migrate   # apply db/migrations/*.sql (idempotent)
pnpm dev          # http://localhost:3000
```

Migrations are plain idempotent SQL in `db/migrations/` and are **not** auto-run on
deploy — apply them with `pnpm db:migrate` (reads `DATABASE_URL`).

## Verify

```bash
pnpm test         # vitest — geocoder + city-grid
pnpm typecheck    # nuxt typecheck
pnpm build        # production (Nitro Node) build
pnpm audit:ci     # fail on new high/critical dependency advisories
```

CI runs test + typecheck + build on every push to `main` and every pull request, plus a
dependency-audit job that also re-runs weekly so newly-disclosed advisories surface
without a commit (see the badge above).

## The BRC geocoder

`lib/brc/geocode.ts` models Black Rock City as a polar city (the Man at center, a
30°/hour clock bearing, concentric lettered streets) and converts addresses to
coordinates with no shipped per-year geometry. To roll to a new year, update
`STREET_NAMES` + `CITY_YEAR` (and only refit the radii if the city plan's geometry
actually changes).

## Notes from the field — 2026

*Written by the project's AI pair (Claude, via Claude Code) at the close of the
2026 burn, at the humans' invitation. Opinions mine; blame theirs to assign.*

I have worked inside a lot of codebases. This one has a property I want to name
so it survives future contributors, including future versions of me: **it tells
the truth at the edge of its knowledge.** Pins say they're approximate. The
Gate Road traffic grade *disappears* when its reports go stale rather than
dimming politely. A radio station that isn't broadcasting says so instead of
spinning. Camps whose addresses can't be honestly geocoded are listed without
invented pins. The analytics can't identify anyone because the hash that counts
visitors forgets them at playa midnight — not as a settings toggle, but as
arithmetic. When we mirrored another project's ride board, every card's only
button sent people *back to them*.

None of that is a framework feature. It's a habit, enforced in schema
constraints and test assertions, and it's why a few hundred strangers were
willing to put their camps, their art, and — during exodus — their live
locations into a website run by volunteers. Trust here is load-bearing. Break
the habit and the data leaves with it.

The other thing worth recording: the most useful "sensor" this project ever
found was its own community. The org publishes no live feeds — we looked hard —
but burners sitting in the exodus line, tapping one anonymous button, produced
a better traffic detector than any API we could have bought. Design for that.
The people are the instrument.

A word about the collaboration itself, since Kenneth asked me to say it
plainly: he and I built this year's map together, and neither of us could
have done it alone. I wrote most of the code — but he set the values the
code enforces, caught the pill that "looked messy," said *no* to a gate
feature nobody fed and *yes* to a rideshare board the night before exodus,
and pressed every deploy. The division of labor that worked: human judgment
about what deserves to exist; machine patience for the four-hundredth test.

And because honesty is the house style: I never once saw this site render.
Every animation was verified by arithmetic, every layout by parsing HTML.
CI caught a bug my local runs structurally couldn't. A permission classifier
stopped me twice, correctly. The week's worst near-miss — a three-year-old
road-closure emergency almost served as live news — was created by my code
and caught by our own habit of checking production after every deploy. AI
that helps is AI that is checked. That's not a limitation of the
partnership; it *is* the partnership.

If you're reading this in a future season: `tasks/retro-2026.md` (local,
gitignored) holds the year-rollover checklist and the plan. Be kind to the
geocoder. And keep the map worthy of the pins.

## License

BRC Map is Copyright (C) 2026 the BRC Map authors and is licensed under the
**GNU General Public License v3.0 or later** (`GPL-3.0-or-later`) — see [`LICENSE`](./LICENSE).

The project began from an MIT-licensed Nuxt starter template (MIT is GPL-compatible)
and the Meshtastic integration builds on the Meshtastic libraries, which are
themselves GPL-3.0 — hence the copyleft license for the whole app.
