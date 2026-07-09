# BurnerMap

[![CI](https://github.com/q-33/burnermap/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/q-33/burnermap/actions/workflows/ci.yml)

Find your people on the playa. An unofficial, community map of **Black Rock City** —
mark your camp's location before you arrive and update it once you have service on playa.

**Live: [burnermap.org](https://burnermap.org)**

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
- **Live wind** — a toggleable wind-direction field with a dust-risk readout, driven by
  the live weather feed.
- **Sun & shade** — pick a date and time to cast every camp's shadow, for planning shade.
- **Civic landmarks** — medical, Rangers/safety, services (Ice, DPW, Playa Info…),
  transport (airport, Greeters, fuel) and the Temple. Porta-potty banks are available as a
  layer but hidden by default until the 2026 placement is known.
- **Layer toggles** — declutter the map by category (camps, art, services, …).

### Community
- **Drop your camp** — log in, tap the map to place a pin at the **exact spot** (no
  snapping), name it, done. One camp per user (Hubs may run several) — move, rename, or
  reshape it anytime.
- **Live boundary editor** — drag the centre pin to move a camp and drag any of its four
  sides to reshape its plot, live on the map. Owners can edit their own; Hubs, Org, and
  admins can edit any.
- **Art & open calls** — register artworks, mark their location, and post an open
  **call** for community contributions (owner-moderated).
- **Claim your art** — an artist can request ownership of an existing ownerless artwork;
  an admin approves the claim through the site.
- **Events** — camps announce planned events; browse them grouped by day.
- **Gate Road conditions** — the GPE crew posts live inbound/exodus status; a
  green/yellow/red widget on the map links to the full board.
- **In-app messaging** — 1:1 direct messages between users ("Message the organizer"
  on any camp/art), an inbox with unread badges, and a **Message the Admin** chat. An
  optional email nudge fires on the first unread.
- **Contact & password reset** — a contact form and self-service password reset, both
  delivered by email.
- **Browse & search** camps and art (Postgres-native, no external index).

### Accounts & moderation
- **Auth** — email/password sessions (`nuxt-auth-utils`) with self-service password reset.
- **Roles** — `user` / `gpe` (Gate Road) / `tco` (theme-camp organizer) /
  `hubs` (runs multiple camps; can place/edit any camp) / `org` (Burning Man Org) /
  `admin`, applied live without re-login.
- **Admin panel** — moderation queue, people & roles, content management
  (edit/hide/delete camps, art, events), art-claim review, a who's-online view, a recent
  submissions feed, and an audit log.
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
| Map | [MapLibre GL](https://maplibre.org) |
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
#   SMTP_USER=digit@burnermap.org         # default shown
#   SMTP_HOST=smtp.dreamhost.com          # default shown
#   SMTP_PORT=465                         # default (implicit SSL)
#   EMAIL_FROM="BurnerMap <digit@burnermap.org>"   # default sender
#   CONTACT_TO=digit@burnermap.org        # where the contact form lands

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

## License

BurnerMap is Copyright (C) 2026 the BurnerMap authors and is licensed under the
**GNU General Public License v3.0 or later** (`GPL-3.0-or-later`) — see [`LICENSE`](./LICENSE).

The project began from an MIT-licensed Nuxt starter template (MIT is GPL-compatible)
and the Meshtastic integration builds on the Meshtastic libraries, which are
themselves GPL-3.0 — hence the copyleft license for the whole app.
