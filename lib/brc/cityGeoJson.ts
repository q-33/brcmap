import type { Feature, FeatureCollection } from 'geojson'
import type { BrcAddress } from './geocode'
import { CITY_TIME_MAX, CITY_TIME_MIN, MAN, STREET_RADII, addressToLatLng, circleRing, radialPoint, streetName } from './geocode'
import { GATE_INK } from './gateLines'
import { CENTER_CAMP_INK } from './planCenterCamp'
import { GIS_BLOCKS, GIS_FENCE, GIS_PLAZAS, GIS_STREETS } from './planCity'
import { STREET_LINE_OFFSETS } from './streetLines'

// The exact 2026 street network traced from the official plan PDF, re-centred
// onto the golden spike (offsets track the Man). The authoritative line basemap.
export function streetLinesGeoJson(): FeatureCollection {
  return {
    type: 'FeatureCollection',
    features: STREET_LINE_OFFSETS.map(line => ({
      type: 'Feature',
      properties: { kind: 'street' },
      geometry: { type: 'LineString', coordinates: line.map(p => [MAN.lng + p[0]!, MAN.lat + p[1]!]) },
    })),
  }
}

// Render Black Rock City to match the official BRC 2026 plan: individual blue
// camp blocks separated by white street channels, on a near-white ground.
// Everything is generated from the parametric geocoder (real metres / coords).

const STREETS = Object.keys(STREET_RADII)
const OUTER = STREETS[STREETS.length - 1]! // Kundalini (K)

const toLngLat = (p: { lat: number, lng: number }): [number, number] => [p.lng, p.lat]

// Local flat projection (must mirror geocode.ts): metre offsets east/north of
// the Man ↔ lng/lat. Computed per call so runtime golden-spike calibration of
// MAN keeps working.
const M_PER_DEG_LAT = 111320
function enToLngLat(e: number, n: number): [number, number] {
  const mPerDegLng = M_PER_DEG_LAT * Math.cos((MAN.lat * Math.PI) / 180)
  return [MAN.lng + e / mPerDegLng, MAN.lat + n / M_PER_DEG_LAT]
}
function lngLatToEN(p: [number, number]): [number, number] {
  const mPerDegLng = M_PER_DEG_LAT * Math.cos((MAN.lat * Math.PI) / 180)
  return [(p[0] - MAN.lng) * mPerDegLng, (p[1] - MAN.lat) * M_PER_DEG_LAT]
}
// Plan-oriented offsets (12:00 straight up, as measured off the official PDF)
// → real-world lng/lat: rotate by the city's 45° bearing first.
const SQRT2_2 = Math.SQRT2 / 2
function planToLngLat(px: number, py: number): [number, number] {
  return enToLngLat((px + py) * SQRT2_2, (py - px) * SQRT2_2)
}

// Cut a polyline where it enters circles (plazas, the Man circle, Center Camp)
// so streets STOP at the drawn circle edge like the official plan — the circle
// interiors stay clean wash-blue with no channel crossing them. Works by dense
// resampling (~2 m) in metre space; boundary error is invisible at map scale.
function cutCircles(coords: [number, number][], circles: { center: { lat: number, lng: number }, radiusM: number }[]): [number, number][][] {
  const cs = circles.map(c => ({ en: lngLatToEN([c.center.lng, c.center.lat]), r: c.radiusM }))
  const pts = coords.map(lngLatToEN)
  const inside = (p: [number, number]) => cs.some(c => Math.hypot(p[0] - c.en[0], p[1] - c.en[1]) < c.r)
  // resample densely
  const dense: [number, number][] = []
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i]!
    const b = pts[i + 1]!
    const L = Math.hypot(b[0] - a[0], b[1] - a[1])
    const n = Math.max(1, Math.ceil(L / 2))
    for (let s = 0; s < n; s++)
      dense.push([a[0] + ((b[0] - a[0]) * s) / n, a[1] + ((b[1] - a[1]) * s) / n])
  }
  dense.push(pts[pts.length - 1]!)
  // prune near-collinear resample points so runs stay compact
  const prune = (run: [number, number][]): [number, number][] => {
    if (run.length <= 2)
      return run
    const kept: [number, number][] = [run[0]!]
    for (let i = 1; i < run.length - 1; i++) {
      const a = kept[kept.length - 1]!
      const b = run[i]!
      const c = run[i + 1]!
      const cross = Math.abs((b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]))
      const len = Math.hypot(c[0] - a[0], c[1] - a[1])
      if ((len ? cross / len : 0) > 0.05 || Math.hypot(b[0] - a[0], b[1] - a[1]) > 60)
        kept.push(b)
    }
    kept.push(run[run.length - 1]!)
    return kept
  }
  const out: [number, number][][] = []
  let cur: [number, number][] = []
  const flush = () => {
    if (cur.length > 1)
      out.push(prune(cur).map(q => enToLngLat(q[0], q[1])))
    cur = []
  }
  for (const p of dense) {
    if (inside(p))
      flush()
    else
      cur.push(p)
  }
  flush()
  return out
}

function arcAt(radiusM: number, tMin: number, tMax: number): [number, number][] {
  const pts: [number, number][] = []
  for (let t = tMin; t <= tMax + 1e-9; t += 0.1)
    pts.push(toLngLat(radialPoint(t, radiusM)))
  return pts
}

// Center Camp keyhole, measured from the official 2026 plan PDF
// (BRC_City_Plan_2026_update.pdf): vector geometry calibrated against the ring
// radii (which match STREET_RADII to <0.05%). The café sits 915 m out on the
// 6:00 axis; Rod's Ring Road channel spans ~75–84 m; the four bordering plots
// are carved back to ~96 m. The camp edge bows toward the Man into the keyhole
// dome (apex 672 m, half-width 0.424 h), whose sides flare to ±0.49 h at A. A
// "V" walkway runs from the dome apex down to the ring road, and two radial
// channels at ±0.307 h split the A–B flank plots.
const CANOPY_M = 915

// A getter (not a module-load const) so it re-derives after the golden spike is
// calibrated at runtime.
export function getCenterCampPoint(): [number, number] {
  return toLngLat(radialPoint(6, CANOPY_M))
}
export function cityGridGeoJson(): FeatureCollection {
  const features: Feature[] = []
  const push = (kind: string, geometry: any, props: Record<string, any> = {}) =>
    features.push({ type: 'Feature', properties: { kind, ...props }, geometry })

  const espRadius = STREET_RADII.Esplanade!
  const kRadius = STREET_RADII[OUTER]!

  // 1. City BLOCKS and PLAZAS — Burning Man's OWN SURVEYED GIS, baked into
  // lib/brc/planCity.ts by scripts/import-gis.py. This is the city as actually
  // staked: the rings are not perfect circles and the radials are not exactly 30°
  // apart. It replaces a parametric annular-sector grid that approximated them
  // (and had to guess the horseshoe taper and the Center Camp cut-outs).
  // geocode.ts still owns addresses, so no camp pin moves — see planCity.ts.
  for (const ring of GIS_BLOCKS)
    push('block', { type: 'Polygon', coordinates: [ring.map(q => planToLngLat(q[0]!, q[1]!))] }, { camp: 1 })

  // Plazas as surveyed: 30.5 m at the B and G ring nodes, 79.3 m at Center Camp,
  // plus the 2:00 and 10:00 & B plazas the parametric city never drew at all.
  // Only the circular ones may cut streets; those two are rectangular keyholes.
  const plazaDefs = GIS_PLAZAS.map((p) => {
    const [lng, lat] = planToLngLat(p.c[0]!, p.c[1]!)
    return {
      label: p.n.includes('& B') ? p.n.replace(' Plaza', '') : '',
      center: { lng, lat },
      radiusM: p.r,
      round: p.round,
      ring: p.p.map(q => planToLngLat(q[0]!, q[1]!)),
    }
  })


  // 2. Trash fence (red dashed pentagon) — the surveyed perimeter
  push('fence', { type: 'LineString', coordinates: GIS_FENCE.map(q => planToLngLat(q[0]!, q[1]!)) })

  // 3. Named-street labels (upper-left, as on the plan — overview only). Anchored
  // just PAST the 10:00 city edge so the names sit in the open playa wedge rather
  // than overlapping the camp blocks (which now fill out to 10:00).
  for (const street of STREETS) {
    const label = addressToLatLng({ time: 10.1, street })
    if (label)
      push('street-label', { type: 'Point', coordinates: [label.lng, label.lat] }, { name: streetName(street) })
  }

  // 3b. Road-label guide lines (invisible) — labels run ALONG the roads at high
  // zoom. Ring lines carry the lettered-street name; radial lines carry the clock
  // time of each numbered avenue.
  for (const street of STREETS)
    push('ring-line', { type: 'LineString', coordinates: arcAt(STREET_RADII[street]!, CITY_TIME_MIN, CITY_TIME_MAX) }, { name: streetName(street) })

  const fmtTime = (t: number) => `${Math.floor(t)}:${String(Math.round((t % 1) * 60)).padStart(2, '0')}`
  for (let t = CITY_TIME_MIN; t <= CITY_TIME_MAX + 1e-9; t += 0.5) {
    const name = fmtTime(t)
    // Two segments per radial — an inner (Esplanade → H) and an outer (H → K) —
    // so the clock-time label appears mid-city AND repeats further out near K.
    push('radial-line', { type: 'LineString', coordinates: [radialPoint(t, STREET_RADII.Esplanade!), radialPoint(t, STREET_RADII.H!)].map(toLngLat) }, { name })
    push('radial-line', { type: 'LineString', coordinates: [radialPoint(t, STREET_RADII.H!), radialPoint(t, STREET_RADII[OUTER]!)].map(toLngLat) }, { name })
  }



  // 4. Circles drawn as single bold outlines like the official plan: the Man
  // circle (r ≈ 122 m — avenues stop at its edge) and the 12:00 circle (r ≈
  // 46 m) centred ON the Esplanade. Both are `portal` lines.
  const MAN_R = 122 // the Man circle radius (m), per the official plan
  const radial = (t: number, a: number, b: number) => [radialPoint(t, a), radialPoint(t, b)].map(toLngLat)
  push('portal', { type: 'LineString', coordinates: circleRing(MAN, MAN_R) }, { name: '' })
  push('portal', { type: 'LineString', coordinates: circleRing(radialPoint(12, espRadius), 46) }, { name: '' })

  // 5. Gate Road status overlay: an invisible-until-coloured line along the
  // 6:00 entrance (K → through the box office) that carries the live gate
  // colour + the "Gate Road" label; the road's double-line look itself comes
  // from its street-channel below.
  push('gate-road', { type: 'LineString', coordinates: radial(6, kRadius, 2050) }, { name: 'Gate Rd' })

  // 5b. The 6:00 GATE COMPLEX + 5:30/6:30/9:30 spur roads — the official plan's
  // ink itself: every drawn stroke's closed outline, extracted verbatim from the
  // PDF vectors, rendered as filled shapes so the roads connect EXACTLY as
  // printed (Y-junctions, box-office funnel, perimeter roads, roundabouts).
  for (const ring of GATE_INK) {
    const coords = ring.map(p => planToLngLat(p[0]!, p[1]!))
    push('gate-ink', { type: 'Polygon', coordinates: [coords] })
  }

  // Airport Road — branches off the 5:00 radial at the outer street (K) and runs
  // out to fence corner P5 (the south gate), matching the official plan. (P5 is
  // the fence vertex by the airport; the airport marker itself sits just beyond.)
  // Pick the surveyed fence corner nearest the 5:00 radial rather than a fixed
  // index, so re-importing the GIS can't silently aim Airport Rd at another corner.
  const p5Aim = lngLatToEN(toLngLat(radialPoint(5, kRadius + 600)))
  let fenceP5: [number, number] = planToLngLat(GIS_FENCE[0]![0]!, GIS_FENCE[0]![1]!)
  let fenceP5D = Number.POSITIVE_INFINITY
  for (const q of GIS_FENCE) {
    const ll = planToLngLat(q[0]!, q[1]!)
    const en = lngLatToEN(ll)
    const d = Math.hypot(en[0] - p5Aim[0], en[1] - p5Aim[1])
    if (d < fenceP5D) {
      fenceP5D = d
      fenceP5 = ll
    }
  }
  push('airport-road', { type: 'LineString', coordinates: [toLngLat(radialPoint(5, kRadius)), fenceP5] }, { name: 'Airport Rd' })

  // 6. Center Camp's blocks now come from the surveyed GIS along with the rest of
  // the city, so the parametric keyhole plots are gone: the dome cap fitted from
  // DOME_HALF/KEYHOLE_SIDE, the four A–B flank wedges, and their plaza carves.
  // Only Center Camp's LINEWORK stays hand-sourced, and that is the plan's own
  // ink rather than a fit — see below.
  // 6d. Center Camp's own linework is the plan's INK ITSELF, traced verbatim from
  // the PDF vectors by scripts/trace-plan.py: the dome arc with its
  // 6:00 opening, the V walkway, the plaza edge with its real breaks, and the café
  // canopy. These used to be parametric approximations — a dome fitted from
  // DOME_HALF/KEYHOLE_SIDE, two straight V spokes, a two-arc plaza — and the
  // keyhole was the one part of the city that visibly missed the plan.
  // The tracer filters out ring and radial strokes, so nothing here duplicates
  // the streets drawn from STREET_RADII above.
  for (const ring of CENTER_CAMP_INK) {
    const coords = ring.map(p => planToLngLat(p[0]!, p[1]!))
    push('cc-ink', { type: 'Polygon', coordinates: [coords] })
  }

  // 6e. Clock plazas — circle outlines only (r = 30.5 m); the interiors stay
  // wash-blue exactly as printed, and the street channels are cut at the circle
  // edges below. B ring labelled; G ring unlabelled.
  for (const p of plazaDefs) {
    push('portal', { type: 'LineString', coordinates: p.ring }, { name: p.label })
    if (p.label)
      push('portal-label', { type: 'Point', coordinates: [p.center.lng, p.center.lat] }, { name: p.label })
  }

  // 7. Walk-in camping boundary (orange, traced from the plan): a SOLID radial
  // at 2:00 from the city edge out to the fence, then a dashed arc hugging the
  // city edge (K + 17.5 m) from 2:00 to 5:00 and a dashed straight run to the
  // bottom-right fence corner. Two labels sit in the enclosed area.
  const walkR = kRadius + 17.5
  push('walkin-boundary', { type: 'LineString', coordinates: radial(2, walkR, 2242) }, { solid: 1 })
  push('walkin-boundary', { type: 'LineString', coordinates: arcAt(walkR, 2.0, 5.0) })
  push('walkin-boundary', { type: 'LineString', coordinates: [toLngLat(radialPoint(5, walkR)), planToLngLat(1458, -1993)] })
  for (const t of [2.3, 4.7])
    push('walkin-label', { type: 'Point', coordinates: toLngLat(radialPoint(t, 2050)) }, { name: 'Walk-in Camping' })

  // 8. Street channels — every road drawn the official way: a ground-coloured
  // core over the wash, with black edge lines (the renderer's casing layer), CUT
  // at every plaza/circle so circle interiors stay clean printed blue. Rings run
  // 2:00–10:00 (the Esplanade is interrupted at the dome shoulders); half-hour
  // radials run Esplanade→K, quarter-hour radials F→K, per the density rule;
  // plus the playa promenades (3:00/9:00/12:00/6:00 to the dome apex).
  const cutDefs = [
    // only genuinely circular plazas cut the streets; the 2:00 and 10:00 & B
    // plazas are rectangular keyholes and a circle there would gouge the roads
    ...plazaDefs.filter(p => p.round).map(p => ({ center: p.center, radiusM: p.radiusM })),
    { center: radialPoint(12, espRadius), radiusM: 46 },
    { center: MAN, radiusM: MAN_R },
  ]
  // Surveyed centrelines. The GIS already splits each road at its intersections,
  // so the only cutting left is at the drawn circles, whose interiors the plan
  // keeps clean. `widthFt` is the real 20/30/40/50 ft roadway carried through for
  // later use — the renderer still draws the plan's printed stroke convention,
  // not the physical width, so this change is geometry only.
  for (const s of GIS_STREETS) {
    const coords = s.p.map(q => planToLngLat(q[0]!, q[1]!))
    for (const piece of cutCircles(coords, cutDefs))
      push('street-channel', { type: 'LineString', coordinates: piece }, { name: s.n, widthFt: s.w })
  }

  // 9. Clock-time labels around the outer edge, every quarter hour (the official
  // plan labels the city edge 2:00…10:00).
  for (let t = CITY_TIME_MIN; t <= CITY_TIME_MAX + 1e-9; t += 0.25)
    push('time-label', { type: 'Point', coordinates: toLngLat(radialPoint(t, kRadius + 65)) }, { name: fmtTime(t) })

  return { type: 'FeatureCollection', features }
}

export function getManPoint(): [number, number] {
  return [MAN.lng, MAN.lat]
}

// Corner coordinates for /brc-wash.png — the official plan's blue camping wash
// baked as a pixel-exact georeferenced RGBA raster (alpha = printed blueness,
// streets healed so our vector channels redraw them). The PNG is in PLAN
// orientation (12:00 up) covering plan-metre rect E [-1910, 1920] × N
// [-2100, 960]; corners rotate through the city's 45° bearing and track the
// golden spike. Order: top-left, top-right, bottom-right, bottom-left.
export function washCorners(): [number, number][] {
  return [
    planToLngLat(-1910, 960),
    planToLngLat(1920, 960),
    planToLngLat(1920, -2100),
    planToLngLat(-1910, -2100),
  ]
}

// --- Civic landmarks ---------------------------------------------------------
// Official infrastructure shown on the map. Each is located by a BRC address
// (clock + street, geocoded), a clock + distance from the Man (off-grid items
// like the airport/temple), or a fixed lat/lng. Category drives the marker
// colour + legend grouping. Placements move slightly year to year — sourced
// from the official BRC Map & Guide / city plan.
export type CivicCategory = 'medical' | 'safety' | 'transport' | 'services' | 'sacred'

type CivicAt = BrcAddress | { time: number, radiusM: number } | { lng: number, lat: number }
export interface CivicLandmark { name: string, category: CivicCategory, at: CivicAt, note?: string }

function civicCoord(at: CivicAt): [number, number] | null {
  if ('street' in at) {
    const p = addressToLatLng(at)
    return p ? [p.lng, p.lat] : null
  }
  if ('radiusM' in at)
    return toLngLat(radialPoint(at.time, at.radiusM))
  return [at.lng, at.lat]
}

// Sourced from the official 2026 Survival Guide → On-Playa Resources and the BRC
// city plan. On-grid items use their clock+street address (stable year to year);
// off-grid items (airport, DPW, Greeters, fuel) use a clock bearing + approximate
// distance from the Man. The outer street K sits ~1779 m out, for reference.
const K_M = STREET_RADII[OUTER]!
// The DPW work zone sits on the 5:30 side, ~F–G. These staff areas are NOT on
// the public BRC map and shift yearly, so they're placed by their documented
// zone and flagged approximate.
const DPW_ZONE_M = (STREET_RADII.F! + STREET_RADII.G!) / 2
export const CIVIC_LANDMARKS: CivicLandmark[] = [
  // Medical / care (red)
  { name: 'Rampart Hospital', category: 'medical', at: { time: 5.25, street: 'Esplanade' }, note: 'Main field hospital · ESD station' },
  { name: 'First Aid · 3:00', category: 'medical', at: { time: 3, street: 'B' }, note: 'Medical + Ranger Outpost (Berlin) · 3:00 Plaza' },
  { name: 'First Aid · 9:00', category: 'medical', at: { time: 9, street: 'B' }, note: 'Medical + Ranger Outpost (Tokyo) · 9:00 Plaza' },
  // Safety (blue)
  { name: 'Ranger HQ', category: 'safety', at: { time: 6.5, street: 'Esplanade' }, note: 'Black Rock Rangers headquarters' },
  { name: 'Law Enforcement', category: 'safety', at: { time: 5.08, street: 'Esplanade' }, note: 'Law enforcement substation · by Rampart at 5:15 & Esplanade' },
  { name: 'GPE', category: 'safety', at: { time: 5.75, street: 'E' }, note: 'Gate, Perimeter & Exodus (The Black Hole) · also runs Gate Road outposts (approx.)' },
  // Services (teal)
  { name: 'Ice · main', category: 'services', at: { time: 6.25, street: 'B' }, note: 'Arctica ice (main) · Center Camp Plaza' },
  { name: 'Playa Info', category: 'services', at: { time: 5.9, street: 'Esplanade' }, note: 'Info · Lost & Found · VRT volunteer resources · Center Camp ~6:00 (2026)' },
  { name: 'ARTery', category: 'services', at: { time: 6.25, street: 'Esplanade' }, note: 'Art HQ · registration, lighting & fire-safety sign-off' },
  { name: 'Media Mecca', category: 'services', at: { time: 6.36, street: 'Esplanade' }, note: 'Press & media HQ · next to the ARTery' },
  { name: 'Recycle Camp', category: 'services', at: { time: 5.58, street: 'Esplanade' }, note: 'Aluminum-can recycling & education' },
  { name: 'Burn Gardens', category: 'services', at: { time: 5.5, street: 'Esplanade' }, note: 'Scrap-wood donation' },
  { name: 'Ice · 3:00', category: 'services', at: { time: 3, street: 'G' }, note: 'Arctica ice sales' },
  { name: 'Ice · 9:00', category: 'services', at: { time: 9, street: 'G' }, note: 'Arctica ice sales' },
  { name: 'Ice · bulk', category: 'services', at: { time: 6.25, street: 'K' }, note: 'Arctica large-order / bulk ice outpost' },
  { name: 'Lamplighters', category: 'services', at: { time: 6.8, radiusM: 1350 }, note: 'Lamplighter village · lights the promenades nightly · ~6:48 outer (2026 Placement, approx.)' },
  { name: 'Mobility Camp', category: 'services', at: { time: 6.7, street: 'A' }, note: 'Accessibility / ADA mobility services · ~6:45 & A (2026 Placement)' },
  { name: 'DPW Depot', category: 'services', at: { time: 5.5, radiusM: K_M + 205 }, note: 'Dept. of Public Works · just past Kilgore (K)' },
  { name: 'Commissary', category: 'services', at: { time: 5.35, radiusM: DPW_ZONE_M }, note: 'DPW staff dining · staff zone, ~5:30 & F–G (approx.)' },
  { name: 'DPW Ghetto', category: 'services', at: { time: 5.7, radiusM: DPW_ZONE_M }, note: 'DPW crew camp · staff zone, ~5:45 & F–G (approx.)' },
  // 2026 Placement update (Sean Curran / BMOrg Placement, screenshots). Positions
  // estimated from the official placement-map crops — approximate, refine if exact
  // addresses arrive. Census/Volunteer Village sit in the 6:30 wedge; the rest ring
  // the 6:00 Center Camp plaza along the 5:30–6:30 Esplanade/A arc.
  { name: 'Census', category: 'services', at: { time: 6.45, street: 'A' }, note: 'Participant census · 6:30 wedge (2026, approx.)' },
  { name: 'Volunteer Village', category: 'services', at: { time: 7.25, street: 'A' }, note: 'Volunteer HQ / village · ~7:15 & A (2026 Placement, approx.)' },
  { name: 'BMIR', category: 'services', at: { time: 5.85, street: 'Esplanade' }, note: 'BMIR 94.5 FM · Burning Man Information Radio (Center Camp ring, approx.)' },
  { name: 'Placement HQ', category: 'services', at: { time: 6.1, street: 'Esplanade' }, note: 'Theme-camp Placement HQ (Center Camp ring, approx.)' },
  { name: 'V-Spot', category: 'services', at: { time: 6.0, street: 'Esplanade' }, note: 'Volunteer sign-up (V-Spot) · Center Camp 6:00 promenade (approx.)' },
  { name: 'Fire Conclave', category: 'services', at: { time: 6.2, street: 'Esplanade' }, note: 'Great Circle fire-performance staging / Conclave Convergence (approx.)' },
  { name: 'DMV FAST', category: 'services', at: { time: 6.13, street: 'A' }, note: 'Dept. of Mutant Vehicles · FAST licensing · Center Camp 6:00 promenade (approx.)' },
  { name: 'Temple Guardians', category: 'services', at: { time: 5.7, street: 'A' }, note: 'Temple Guardians HQ (Center Camp ring, approx.)' },
  { name: 'MOOP Map HQ', category: 'services', at: { time: 5.45, street: 'A' }, note: 'MOOP Map HQ · Matter Out Of Place data (approx.)' },
  { name: 'Water Works', category: 'services', at: { time: 5.55, street: 'Esplanade' }, note: 'Water Works office (Center Camp ring, ~5:33, approx.)' },
  { name: 'DPW HEaT', category: 'services', at: { time: 5.3, street: 'A' }, note: 'DPW Heavy Equipment & Transport (HEaT) (approx.)' },
  // Transport / entry (amber)
  { name: 'Airport (88NV)', category: 'transport', at: { lng: -119.2107394, lat: 40.7618388 }, note: 'BRC Municipal Airport · off 5:00, outside the fence' },
  { name: 'Greeters', category: 'transport', at: { time: 6, radiusM: 2044 }, note: 'Welcome station + printed city map · 6,705 ft out on 6:00' },
  { name: 'Fallopian Tubes', category: 'transport', at: { time: 6, radiusM: 1980 }, note: 'Entry chicane / queue tubes at the 6:00 gate, just inside Greeters (approx.)' },
  { name: 'Burner Express', category: 'transport', at: { time: 6, street: 'J' }, note: 'Burner Express bus depot (approx., moves yearly)' },
  { name: 'Fuel · Hell Station', category: 'transport', at: { time: 9.5, radiusM: K_M + 110 }, note: 'Participant vehicle fueling · past the outer street' },
  // Sacred (purple). 2026 Temple geometry publishes early July; this is the
  // 12:00 deep-playa axis at an approximate distance until then.
  { name: 'Temple (approx.)', category: 'sacred', at: { time: 12, radiusM: 920 }, note: 'Deep playa, 12:00 axis · exact 2026 location pending official GIS' },
]

export function civicLandmarksGeoJson(): FeatureCollection {
  const features: Feature[] = []
  for (const l of CIVIC_LANDMARKS) {
    const coord = civicCoord(l.at)
    if (coord)
      features.push({ type: 'Feature', properties: { kind: 'civic', name: l.name, category: l.category, note: l.note ?? '' }, geometry: { type: 'Point', coordinates: coord } })
  }
  return { type: 'FeatureCollection', features }
}

// --- Porta-potties -----------------------------------------------------------
// Approximate locations. The 2026 toilet placements aren't published yet, so
// these are the 45 OFFICIAL 2025 toilet banks (bm-innovate GIS), held as offsets
// (Δlng, Δlat) from the golden spike and re-centred onto the current Man — a
// good approximation that snaps with the spike. Replace with 2026 GIS when out.
const TOILET_OFFSETS: [number, number][] = [
  [-0.008808, 0.011851], [-0.006415, 0.008708], [-0.009458, 0.007672], [-0.013249, 0.010267],
  [-0.01545, 0.0069], [-0.011288, 0.005107], [-0.012638, 0.002713], [-0.017256, 0.003645],
  [-0.013139, 0.000133], [-0.018917, 0.000133], [-0.017339, -0.003394], [-0.012734, -0.002458],
  [-0.011464, -0.004872], [-0.015594, -0.006682], [-0.013259, -0.010246], [-0.009397, -0.006559],
  [-0.008929, -0.005816], [-0.007829, -0.006683], [-0.006429, -0.008699], [-0.008809, -0.011838],
  [-0.004483, -0.013164], [-0.00324, -0.009673], [0.000156, -0.014363], [0.000156, -0.009971],
  [0.003541, -0.009599], [0.004777, -0.013099], [0.009076, -0.01171], [0.00669, -0.008573],
  [0.013472, -0.010065], [0.010092, -0.007109], [0.011438, -0.004872], [0.015567, -0.006682],
  [-0.003812, 0.012617], [-0.002228, 0.008258], [-0.00341, 0.002859], [0.001973, 0.000005],
  [0.003741, -0.002576], [0.01676, -0.002796], [0.010955, -0.001746], [0.008873, 0.004475],
  [0.006379, 0.014555], [0.004294, 0.016944], [0.001186, 0.015311], [0.01167, 0.014491],
  [0.019079, 0.008895],
]

export function toiletsGeoJson(): FeatureCollection {
  return {
    type: 'FeatureCollection',
    features: TOILET_OFFSETS.map(([dlng, dlat]) => ({
      type: 'Feature',
      properties: { kind: 'toilet' },
      geometry: { type: 'Point', coordinates: [MAN.lng + dlng, MAN.lat + dlat] },
    })),
  }
}
