import type { Feature, FeatureCollection } from 'geojson'
import type { BrcAddress } from './geocode'
import { CITY_TIME_MAX, CITY_TIME_MIN, MAN, STREET_RADII, addressToLatLng, circleRing, radialPoint, streetName } from './geocode'
import { GATE_INK } from './gateLines'
import { CENTER_CAMP_INK } from './planCenterCamp'
import { GIS_BLOCKS, GIS_DMZ, GIS_FENCE, GIS_GATE_ROAD, GIS_PLAZAS, GIS_STREETS, GIS_TOILETS } from './planCity'
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

  // 5c. Gate Road BEYOND the fence: the ~6 km drive in from the highway to the
  // 6:00 gate, surveyed. Two edge lines make it read as a road rather than a
  // route; the centreline carries the label and nothing else, so the corridor
  // stays open. It meets the in-city stub above at the fence (both ~2,045 m out).
  for (const g of GIS_GATE_ROAD) {
    const coords = g.p.map(q => planToLngLat(q[0]!, q[1]!))
    push(g.c ? 'gate-road-centre' : 'gate-road-outer', { type: 'LineString', coordinates: coords }, { name: 'Gate Road' })
  }

  // 5d. The Deep-Playa Music Zone — where the loud sound camps are placed, out
  // past the 10:00 end of the city. Drawn as an outlined area, not a building:
  // it is a placement boundary, and pretending it has walls would be a lie.
  if (GIS_DMZ.length > 3) {
    const ring = GIS_DMZ.map(q => planToLngLat(q[0]!, q[1]!))
    push('dmz', { type: 'Polygon', coordinates: [ring] }, { name: 'Deep-Playa Music Zone' })
    let cx = 0
    let cy = 0
    for (const q of GIS_DMZ.slice(0, -1)) { cx += q[0]!; cy += q[1]! }
    const n = GIS_DMZ.length - 1
    push('dmz-label', { type: 'Point', coordinates: planToLngLat(cx / n, cy / n) }, { name: 'Deep-Playa Music Zone' })
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
/**
 * `kind` splits the medical category by what the place actually is. Rampart is
 * the field hospital; the ESD stations are emergency services (medical, fire and
 * rescue). They share the Medical layer because you want them together when you
 * need one, but they draw differently because they are not the same thing.
 */
export interface CivicLandmark { name: string, category: CivicCategory, at: CivicAt, note?: string, kind?: 'hospital' | 'ranger' }

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
  { name: 'Rampart Hospital', category: 'medical', kind: 'hospital', at: { lat: 40.7763497, lng: -119.2116420 }, note: 'Main field hospital · 5:15 & A · surveyed' },
  // The emergency-services station beside Rampart, 53 m north of the hospital
  // itself. Official name kept — calling it "First Aid · 5:15" would imply a
  // second walk-in post rather than the ESD building next door.
  { name: 'ESD Station 6', category: 'medical', at: { lat: 40.7767935, lng: -119.2114002 }, note: 'Emergency Services · medical + fire · beside Rampart · surveyed' },
  // The 3:00 and 9:00 stations are on C, NOT at the B plazas — reported by Amanda
  // and confirmed against Burning Man's own 2026 GIS (cpns.geojson), which puts
  // all four at 1084–1094 m from the Man: 19–29 m past C and 105–115 m past B.
  // Exact surveyed coordinates rather than a clock+street approximation, because
  // someone reads these while looking for help. Medical and the Ranger outpost
  // are co-located but separate facilities, so each shows in its own layer.
  { name: 'First Aid · 3:00', category: 'medical', at: { lat: 40.7761978, lng: -119.1989813 }, note: 'ESD Station 3 · medical + fire · 3:00 & C' },
  { name: 'First Aid · 9:00', category: 'medical', at: { lat: 40.7902956, lng: -119.2167879 }, note: 'ESD Station 9 · medical + fire · 9:00 & C' },
  // Safety (blue)
  { name: 'Ranger · Berlin', category: 'safety', kind: 'ranger', at: { lat: 40.7764827, lng: -119.1986123 }, note: 'Black Rock Ranger outpost · 3:00 & C' },
  { name: 'Ranger · Tokyo', category: 'safety', kind: 'ranger', at: { lat: 40.7900620, lng: -119.2172228 }, note: 'Black Rock Ranger outpost · 9:00 & C' },
  { name: 'Ranger HQ', category: 'safety', kind: 'ranger', at: { lat: 40.7799249, lng: -119.2163799 }, note: 'Black Rock Rangers headquarters · 6:30 & Esplanade' },
  { name: 'Law Enforcement', category: 'safety', at: { lat: 40.7766646, lng: -119.2109608 }, note: 'BLM law-enforcement substation · 5:15 & Esplanade' },
  { name: 'GPE', category: 'safety', at: { time: 5.75, street: 'E' }, note: 'Gate, Perimeter & Exodus (The Black Hole) · also runs Gate Road outposts (approx.)' },
  // Services (teal)
  { name: 'Ice · main', category: 'services', at: { lat: 40.7782779, lng: -119.2167630 }, note: 'Arctica ice (main) · 6:15 & A' },
  { name: 'Playa Info', category: 'services', at: { lat: 40.7778641, lng: -119.2130452 }, note: 'Info · Lost & Found · VRT volunteer resources · 5:45 & Esplanade' },
  { name: 'ARTery', category: 'services', at: { lat: 40.7793809, lng: -119.2148607 }, note: 'Art HQ · registration, lighting & fire-safety sign-off · 6:15 & Esplanade' },
  { name: 'Media Mecca', category: 'services', at: { lat: 40.7793039, lng: -119.2163165 }, note: 'Press & media HQ · 6:30 & A' },
  { name: 'Recycle Camp', category: 'services', at: { lat: 40.7769507, lng: -119.2130300 }, note: 'Aluminum-can recycling & education · 5:30 & Esplanade' },
  { name: 'Burn Gardens', category: 'services', at: { time: 5.5, street: 'Esplanade' }, note: 'Scrap-wood donation' },
  { name: 'Ice · 3:00', category: 'services', at: { lat: 40.7737637, lng: -119.1949101 }, note: 'Arctica ice sales · 3:00 & H' },
  { name: 'Ice · 9:00', category: 'services', at: { lat: 40.7927170, lng: -119.2208314 }, note: 'Arctica ice sales · 9:00 & H' },
  { name: 'Ice · bulk', category: 'services', at: { lat: 40.7736956, lng: -119.2239782 }, note: 'Arctica large-order / bulk ice outpost · 6:15 & J' },
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
  { name: 'DMV FAST', category: 'services', at: { lat: 40.7789614, lng: -119.2124627 }, note: 'Dept. of Mutant Vehicles · licensing · 5:45, inside the Esplanade' },
  { name: 'Temple Guardians', category: 'services', at: { time: 5.7, street: 'A' }, note: 'Temple Guardians HQ (Center Camp ring, approx.)' },
  { name: 'MOOP Map HQ', category: 'services', at: { time: 5.45, street: 'A' }, note: 'MOOP Map HQ · Matter Out Of Place data (approx.)' },
  { name: 'Water Works', category: 'services', at: { time: 5.55, street: 'Esplanade' }, note: 'Water Works office (Center Camp ring, ~5:33, approx.)' },
  { name: 'Yellow Bike Project', category: 'services', at: { lat: 40.7739274, lng: -119.2145451 }, note: 'Community bikes · repair & return · 5:30 & D' },
  { name: 'Deep-Playa Music Zone', category: 'services', at: { lat: 40.7992038, lng: -119.2037669 }, note: 'DMZ · where the loud sound camps live · 10:45, past the outer street' },
  { name: 'Deep-Playa Music Zone 2', category: 'services', at: { lat: 40.7784502, lng: -119.1843398 }, note: 'DMZ2 · second deep-playa sound zone · 2:00, past the outer street' },
  { name: 'DPW HEaT', category: 'services', at: { lat: 40.7765732, lng: -119.2122856 }, note: 'DPW Heavy Equipment & Transport · 5:30 & A' },
  // Transport / entry (amber)
  { name: 'Airport (88NV)', category: 'transport', at: { lat: 40.7605453, lng: -119.2101021 }, note: 'BRC Municipal Airport · 4:45, outside the fence' },
  { name: 'Greeters', category: 'transport', at: { lat: 40.7699130, lng: -119.2254033 }, note: 'Welcome station + printed city map · 6:00, past the outer street' },
  { name: 'Fallopian Tubes', category: 'transport', at: { time: 6, radiusM: 1980 }, note: 'Entry chicane / queue tubes at the 6:00 gate, just inside Greeters (approx.)' },
  { name: 'Burner Express', category: 'transport', at: { lat: 40.7733549, lng: -119.2227195 }, note: 'Burner Express bus depot · 6:00 & I' },
  { name: 'Fuel · Hell Station', category: 'transport', at: { lat: 40.7981065, lng: -119.2192173 }, note: 'Participant vehicle fueling · 9:30, past the outer street' },
  // The gate complex, all out past the outer street on the 6:15 line — official
  // 2026 GIS. Useful before you arrive and again at Exodus.
  { name: 'Gate Actual', category: 'transport', at: { lat: 40.7687253, lng: -119.2340881 }, note: 'Gate operations · 6:15, ~1.0 km past the outer street' },
  { name: 'Box Office', category: 'transport', at: { lat: 40.7682269, lng: -119.2356701 }, note: 'Ticket sales & problem resolution · 6:15, ~1.1 km out' },
  { name: 'Will Call Lot', category: 'transport', at: { lat: 40.7684061, lng: -119.2370464 }, note: 'Will Call ticket pickup · 6:15, ~1.2 km out' },
  { name: 'D Lot', category: 'transport', at: { lat: 40.7681783, lng: -119.2338248 }, note: 'Holding / staging lot at the gate · 6:15, ~1.0 km out' },
  { name: 'Census Checkpoint', category: 'transport', at: { lat: 40.7675669, lng: -119.2279380 }, note: 'Where arrivals are surveyed on Gate Road · 6:00, ~0.7 km out' },
  { name: 'Walk-In Camp', category: 'transport', at: { lat: 40.7660514, lng: -119.2016597 }, note: 'Walk-in camping entry · 4:00, just past the outer street' },
  // Sacred (purple). 2026 Temple geometry publishes early July; this is the
  // 12:00 deep-playa axis at an approximate distance until then.
  { name: 'The Temple', category: 'sacred', at: { lat: 40.7880994, lng: -119.2014996 }, note: 'Deep playa on the 12:00 axis' },
]

/** An admin correction to a landmark's position, keyed by name. */
export interface LandmarkOverride { name: string, lat: number, lng: number, note?: string | null }

/**
 * Civic landmarks, with admin corrections applied.
 *
 * The constants above are the default and stay the source of truth in git.
 * Overrides come from the landmark_overrides table and win when present, so
 * removing a row reverts to the shipped position. `moved` marks a corrected pin
 * so the map can tell an admin which ones have been touched.
 */
export function civicLandmarksGeoJson(overrides: LandmarkOverride[] = []): FeatureCollection {
  const byName = new Map(overrides.map(o => [o.name, o]))
  const features: Feature[] = []
  for (const l of CIVIC_LANDMARKS) {
    const o = byName.get(l.name)
    const coord = o ? [o.lng, o.lat] as [number, number] : civicCoord(l.at)
    if (coord) {
      features.push({
        type: 'Feature',
        properties: {
          kind: 'civic',
          name: l.name,
          category: l.category,
          subtype: l.kind ?? '',
          note: (o?.note ?? l.note) ?? '',
          moved: o ? 1 : 0,
        },
        geometry: { type: 'Point', coordinates: coord },
      })
    }
  }
  return { type: 'FeatureCollection', features }
}

// --- Porta-potties -----------------------------------------------------------
// Burning Man's OFFICIAL 2026 toilet placements, from the same surveyed GIS as
// the streets and blocks (github.com/burningmantech/innovate-GIS-data, refreshed
// 6 Aug 2026). Each bank is surveyed as the fenced enclosure; we draw its
// centroid, because what you want on a map is the one spot to walk to.
//
// Like the rest of the GIS these are plan-oriented metre offsets, so they move
// with the city if the golden spike is ever recalibrated instead of drifting
// away from the streets they sit between.
export function toiletsGeoJson(): FeatureCollection {
  return {
    type: 'FeatureCollection',
    features: GIS_TOILETS.map(t => ({
      type: 'Feature',
      properties: { kind: 'toilet', label: t.l },
      geometry: { type: 'Point', coordinates: planToLngLat(t.c[0]!, t.c[1]!) },
    })),
  }
}
