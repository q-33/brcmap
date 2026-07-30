import type { Feature, FeatureCollection } from 'geojson'
import type { BrcAddress } from './geocode'
import { CITY_TIME_MAX, CITY_TIME_MIN, MAN, STREET_RADII, addressToLatLng, circleRing, radialPoint, streetName } from './geocode'
import { GATE_INK } from './gateLines'
import { CENTER_CAMP_INK } from './planCenterCamp'
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
const HALF_STREET_M = 6 // half the street width → the gap between blocks

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

// Subtract a circle from a polygon ring: points inside the circle are replaced
// by the circle's arc between the boundary crossings, so blocks visually "hug"
// the plazas the way the official plan draws them. Handles corner bites (the
// only case our geometry produces); rings fully outside are returned untouched.
function carveCircle(ring: [number, number][], center: { lat: number, lng: number }, radiusM: number): [number, number][] {
  const c = lngLatToEN([center.lng, center.lat])
  const pts = ring.map(lngLatToEN)
  const inside = pts.map(p => Math.hypot(p[0] - c[0], p[1] - c[1]) < radiusM)
  if (!inside.some(Boolean))
    return ring
  const n = pts.length - 1 // ring is closed; ignore duplicate last point
  // segment ↔ circle intersection (returns the parameter s in [0,1])
  const hit = (a: [number, number], b: [number, number]): [number, number] => {
    const dx = b[0] - a[0]; const dy = b[1] - a[1]
    const fx = a[0] - c[0]; const fy = a[1] - c[1]
    const A = dx * dx + dy * dy
    const B = 2 * (fx * dx + fy * dy)
    const C = fx * fx + fy * fy - radiusM * radiusM
    const disc = Math.max(0, B * B - 4 * A * C)
    const s1 = (-B - Math.sqrt(disc)) / (2 * A)
    const s2 = (-B + Math.sqrt(disc)) / (2 * A)
    const s = s1 >= -1e-9 && s1 <= 1 + 1e-9 ? s1 : s2
    return [a[0] + dx * s, a[1] + dy * s]
  }
  const out: [number, number][] = []
  for (let i = 0; i < n; i++) {
    const p = pts[i]!
    const q = pts[(i + 1) % n]!
    if (!inside[i])
      out.push(p)
    if (inside[i] !== inside[(i + 1) % n]) {
      const x = inside[i] ? hit(q, p) : hit(p, q)
      // mark boundary crossings with their angle so arcs can be spliced below
      out.push(x)
    }
  }
  // splice arcs: consecutive crossing pairs (exit→re-entry of the OUTSIDE part)
  // are joined along the circle. Find pairs where the gap between out[] points
  // lies on the circle (both within ~1 m of the radius).
  const res: [number, number][] = []
  const onCircle = (p: [number, number]) => Math.abs(Math.hypot(p[0] - c[0], p[1] - c[1]) - radiusM) < 1
  for (let i = 0; i < out.length; i++) {
    const p = out[i]!
    res.push(p)
    const q = out[(i + 1) % out.length]!
    if (onCircle(p) && onCircle(q)) {
      // arc from p to q, bulging AWAY from the polygon interior (i.e. tracing
      // the removed corner): sweep the short way around the circle.
      let a0 = Math.atan2(p[1] - c[1], p[0] - c[0])
      let a1 = Math.atan2(q[1] - c[1], q[0] - c[0])
      if (a1 - a0 > Math.PI)
        a1 -= 2 * Math.PI
      if (a0 - a1 > Math.PI)
        a1 += 2 * Math.PI
      const steps = Math.max(2, Math.ceil(Math.abs(a1 - a0) / 0.12))
      for (let s = 1; s < steps; s++) {
        const a = a0 + ((a1 - a0) * s) / steps
        res.push([c[0] + radiusM * Math.cos(a), c[1] + radiusM * Math.sin(a)])
      }
    }
  }
  const ll = res.map(p => enToLngLat(p[0], p[1]))
  ll.push(ll[0]!)
  return ll
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

// One city block: an annular-sector cell between two streets and two radials,
// inset by half a street width on each side to leave the white street channels.
// `camp` = 1 for the placed-camp area, 0 for the outline-only walk-in fringe at
// the outer corners (matching the official plan's tapered horseshoe). Blocks
// near a plaza get the plaza circle carved out so they hug it (official style).
// Round a polygon's corners (official-plan style ~12 m fillets) with quadratic
// béziers in metre space. `cornerIdxs` are indices into the OPEN ring.
function roundCorners(ring: [number, number][], cornerIdxs: number[], radiusM: number): [number, number][] {
  const pts = ring.map(lngLatToEN)
  const n = pts.length
  const out: [number, number][] = []
  const cornerSet = new Set(cornerIdxs)
  for (let i = 0; i < n; i++) {
    const p = pts[i]!
    if (!cornerSet.has(i)) {
      out.push(p)
      continue
    }
    const a = pts[(i - 1 + n) % n]!
    const b = pts[(i + 1) % n]!
    const la = Math.hypot(a[0] - p[0], a[1] - p[1])
    const lb = Math.hypot(b[0] - p[0], b[1] - p[1])
    const r = Math.min(radiusM, la / 3, lb / 3)
    if (r < 2) {
      out.push(p)
      continue
    }
    const t1: [number, number] = [p[0] + ((a[0] - p[0]) * r) / la, p[1] + ((a[1] - p[1]) * r) / la]
    const t2: [number, number] = [p[0] + ((b[0] - p[0]) * r) / lb, p[1] + ((b[1] - p[1]) * r) / lb]
    for (const s of [0, 0.25, 0.5, 0.75, 1]) {
      const u = 1 - s
      out.push([u * u * t1[0] + 2 * s * u * p[0] + s * s * t2[0], u * u * t1[1] + 2 * s * u * p[1] + s * s * t2[1]])
    }
  }
  return out.map(q => enToLngLat(q[0], q[1]))
}

function block(rIn: number, rOut: number, t0: number, t1: number, camp: number, carves: { center: { lat: number, lng: number }, radiusM: number }[] = []): Feature {
  let ring: [number, number][] = []
  const steps = 4
  for (let s = 0; s <= steps; s++)
    ring.push(toLngLat(radialPoint(t0 + ((t1 - t0) * s) / steps, rIn)))
  for (let s = 0; s <= steps; s++)
    ring.push(toLngLat(radialPoint(t1 - ((t1 - t0) * s) / steps, rOut)))
  // round the four corners like the plan, then close + carve
  ring = roundCorners(ring, [0, steps, steps + 1, 2 * steps + 1], 12)
  ring.push(ring[0]!)
  for (const cv of carves)
    ring = carveCircle(ring, cv.center, cv.radiusM)
  return { type: 'Feature', properties: { kind: 'block', camp }, geometry: { type: 'Polygon', coordinates: [ring] } }
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
const CC_PLAZA_R = 79.5 // the plaza's single drawn edge circle (streets stop here)
const CC_CARVE_UPPER = 82 // the flank plots' edge sits under the circle stroke
const CC_CARVE_LOWER = 95 // the B–C plots' corners are carved further back
const DOME_APEX_M = 672 // dome apex (toward the Man)
const DOME_HALF = 0.424 // dome half-width in clock-hours at the Esplanade
const KEYHOLE_SIDE = 0.49 // dome sides flare to ±this by the A ring
const KEYHOLE_SPOKE = 0.307 // radial channels splitting the A–B flank plots

// A getter (not a module-load const) so it re-derives after the golden spike is
// calibrated at runtime.
export function getCenterCampPoint(): [number, number] {
  return toLngLat(radialPoint(6, CANOPY_M))
}
// Official 2026 trash-fence pentagon (the 9.23-mile perimeter), stored as
// offsets (Δlng, Δlat) from the golden spike so the fence tracks the city center
// like the streets do. Source: 2026 BRC Measurements (5 surveyed fence points).
const FENCE_OFFSETS: [number, number][] = [
  [-0.029550, -0.003532], // P1
  [-0.013538, 0.020281], // P2
  [0.021201, 0.016048], // P3
  [0.026634, -0.010359], // P4
  [-0.004711, -0.022456], // P5
]
function trashFence(): [number, number][] {
  const ring = FENCE_OFFSETS.map(([dlng, dlat]) => [MAN.lng + dlng, MAN.lat + dlat] as [number, number])
  ring.push(ring[0]!)
  return ring
}

export function cityGridGeoJson(): FeatureCollection {
  const features: Feature[] = []
  const push = (kind: string, geometry: any, props: Record<string, any> = {}) =>
    features.push({ type: 'Feature', properties: { kind, ...props }, geometry })

  const espRadius = STREET_RADII.Esplanade!
  const kRadius = STREET_RADII[OUTER]!

  // 1. City BLOCKS — the full grid Esplanade→K, 2:00–10:00, 15-min columns. The
  // blue camp FILL is the official 2026 horseshoe, measured from the plan PDF:
  // a deep, near-flat baseline (~Jiba) across the central arc that tapers
  // diagonally toward the shallow 2:00/10:00 ends. Beyond that depth the
  // outer-corner blocks are the walk-in fringe (outline only).
  const NBANDS = STREETS.length - 2 // outermost filled band index (J–K = 10)
  const campDepth = (t: number) => {
    const d = Math.abs(t - 6)
    // Full depth (→K) across the arc so every radial street runs the whole city;
    // past the tips a LINEAR 1-band-per-column diagonal taper keeps the horseshoe
    // shape. (A power curve here jumped two bands at once, leaving an unfilled
    // white notch — e.g. H→J skipping I — at the 2:00/10:00 ends.)
    const depth = Math.round(NBANDS - 4 * Math.max(0, d - 3.1))
    return Math.max(3, Math.min(NBANDS, depth))
  }
  const colMin = 2.0
  const colMax = 10.0
  // Plaza circles (r = 30.5 m on the official plan) carve bites out of adjacent
  // blocks; Center Camp's plots are carved back to the plaza. Carve radius adds
  // half a street so a channel rings each plaza.
  const bRingM = STREET_RADII.B!
  const gRingM = STREET_RADII.G!
  const PLAZA_R = 30.5
  const plazaDefs: { time: number, ringM: number, radiusM: number, label?: string }[] = [
    { time: 3, ringM: bRingM, radiusM: PLAZA_R, label: '3:00 Plaza' },
    { time: 9, ringM: bRingM, radiusM: PLAZA_R, label: '9:00 Plaza' },
    { time: 4.5, ringM: bRingM, radiusM: PLAZA_R, label: '4:30 Plaza' },
    { time: 7.5, ringM: bRingM, radiusM: PLAZA_R, label: '7:30 Plaza' },
    { time: 3, ringM: gRingM, radiusM: PLAZA_R },
    { time: 9, ringM: gRingM, radiusM: PLAZA_R },
    { time: 4.5, ringM: gRingM, radiusM: PLAZA_R },
    { time: 6, ringM: gRingM, radiusM: PLAZA_R },
    { time: 7.5, ringM: gRingM, radiusM: PLAZA_R },
  ]
  const ccCenter = radialPoint(6, CANOPY_M)
  const carveDefs = [
    ...plazaDefs.map(p => ({ center: radialPoint(p.time, p.ringM), radiusM: p.radiusM + 9.5 })),
    // in the standard loop only the B–C plots reach Center Camp (the A–B flanks
    // are custom keyhole wedges carved at CC_CARVE_UPPER below)
    { center: ccCenter, radiusM: CC_CARVE_LOWER },
  ]
  const carvesNear = (t0: number, t1: number, rIn: number, rOut: number) => {
    const mid = radialPoint((t0 + t1) / 2, (rIn + rOut) / 2)
    const midEN = lngLatToEN([mid.lng, mid.lat])
    return carveDefs.filter((cv) => {
      const cen = lngLatToEN([cv.center.lng, cv.center.lat])
      return Math.hypot(midEN[0] - cen[0], midEN[1] - cen[1]) < cv.radiusM + 260
    })
  }
  // The Center Camp keyhole replaces the standard blocks in the Esplanade–A and
  // A–B bands around 6:00 (custom wedges below hug the dome + plaza instead).
  const inKeyhole = (i: number, col: number) => i <= 1 && col > 5.5 && col < 6.5
  // Radial-street density per the official 2026 plan (confirmed against the plan
  // PDF's own vector geometry): the hour & half-hour avenues run full depth, but
  // the quarter-hour avenues (X:15, X:45) exist ONLY from Fulcrum (F) outward.
  // So bands inside F are split into 30-min columns; F and beyond into 15-min.
  const F_INDEX = STREETS.indexOf('F') // ring where the quarter-hour avenues begin
  for (let i = 0; i < STREETS.length - 1; i++) {
    const rIn = STREET_RADII[STREETS[i]!]! + HALF_STREET_M
    const rOut = STREET_RADII[STREETS[i + 1]!]! - HALF_STREET_M
    if (rOut <= rIn)
      continue
    const rMid = (rIn + rOut) / 2
    const tGap = (HALF_STREET_M / rMid) * (6 / Math.PI) // metres → clock-hours at rMid
    const step = i >= F_INDEX ? 0.25 : 0.5 // 15-min columns from F out; 30-min inside
    for (let j = colMin; j < colMax - 1e-9; j += step) {
      const col = j + step / 2
      if (inKeyhole(i, col))
        continue
      const t0 = j + tGap
      const t1 = j + step - tGap
      if (t1 > t0)
        features.push(block(rIn, rOut, t0, t1, i <= campDepth(col) ? 1 : 0, carvesNear(t0, t1, rIn, rOut)))
    }
  }

  // 2. Trash fence (red dashed pentagon)
  push('fence', { type: 'LineString', coordinates: trashFence() })

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
  const fenceP5: [number, number] = [MAN.lng + FENCE_OFFSETS[4]![0], MAN.lat + FENCE_OFFSETS[4]![1]]
  push('airport-road', { type: 'LineString', coordinates: [toLngLat(radialPoint(5, kRadius)), fenceP5] }, { name: 'Airport Rd' })

  // 6. Center Camp keyhole (all radii/angles measured from the official plan's
  // vectors — see the constants above).
  const ccc = ccCenter
  const espR = STREET_RADII.Esplanade!
  const aInner = STREET_RADII.A! - HALF_STREET_M
  // 6a. The dome CAP: arch (apex DOME_APEX_M at 6:00, shoulders at ±DOME_HALF on
  // the Esplanade), sides flaring to ±KEYHOLE_SIDE at the A ring, base along A —
  // carved by the plaza circle. There is NO Esplanade channel inside the dome
  // (the official plan interrupts the Esplanade at the dome shoulders).
  const domeSteps = 24
  let capRing: [number, number][] = []
  for (let s = 0; s <= domeSteps; s++) {
    const f = s / domeSteps
    const t = 6 - DOME_HALF + 2 * DOME_HALF * f
    capRing.push(toLngLat(radialPoint(t, espR - (espR - DOME_APEX_M) * Math.sin(Math.PI * f))))
  }
  // right side flare: shoulder (6+DOME_HALF, Esplanade) → (6+KEYHOLE_SIDE, A)
  for (let s = 1; s <= 6; s++) {
    const f = s / 6
    capRing.push(toLngLat(radialPoint(6 + DOME_HALF + (KEYHOLE_SIDE - DOME_HALF) * f, espR + (aInner - espR) * f)))
  }
  // base: back along the A ring to the left side
  for (let s = 1; s <= 16; s++)
    capRing.push(toLngLat(radialPoint(6 + KEYHOLE_SIDE - (2 * KEYHOLE_SIDE * s) / 16, aInner)))
  // left side flare back up to the left shoulder
  for (let s = 1; s < 6; s++) {
    const f = 1 - s / 6
    capRing.push(toLngLat(radialPoint(6 - DOME_HALF - (KEYHOLE_SIDE - DOME_HALF) * f, espR + (aInner - espR) * f)))
  }
  capRing.push(capRing[0]!)
  capRing = carveCircle(capRing, ccc, CC_CARVE_UPPER)
  features.push({ type: 'Feature', properties: { kind: 'block', camp: 1 }, geometry: { type: 'Polygon', coordinates: [capRing] } })

  // 6b. The four A–B flank plots (two per side, split by the ±KEYHOLE_SPOKE
  // channels), hugging the plaza carve.
  const abIn = STREET_RADII.A! + HALF_STREET_M
  const abOut = STREET_RADII.B! - HALF_STREET_M
  const abGap = (HALF_STREET_M / ((abIn + abOut) / 2)) * (6 / Math.PI)
  const ccCarve = [{ center: ccc, radiusM: CC_CARVE_UPPER }]
  features.push(block(abIn, abOut, 5.5 + abGap, 6 - KEYHOLE_SPOKE - abGap, 1, ccCarve))
  features.push(block(abIn, abOut, 6 - KEYHOLE_SPOKE + abGap, 6 - abGap, 1, ccCarve))
  features.push(block(abIn, abOut, 6 + abGap, 6 + KEYHOLE_SPOKE - abGap, 1, ccCarve))
  features.push(block(abIn, abOut, 6 + KEYHOLE_SPOKE + abGap, 6.5 - abGap, 1, ccCarve))

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
    const c = radialPoint(p.time, p.ringM)
    const ring = circleRing(c, p.radiusM)
    push('portal', { type: 'LineString', coordinates: ring }, { name: p.label ?? '' })
    if (p.label)
      push('portal-label', { type: 'Point', coordinates: [c.lng, c.lat] }, { name: p.label })
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
    ...plazaDefs.map(p => ({ center: radialPoint(p.time, p.ringM), radiusM: p.radiusM })),
    { center: ccc, radiusM: CC_PLAZA_R }, // Center Camp: streets stop at the plaza circle
    { center: radialPoint(12, espRadius), radiusM: 46 },
    { center: MAN, radiusM: MAN_R },
  ]
  const chan = (coords: [number, number][]) => {
    for (const piece of cutCircles(coords, cutDefs))
      push('street-channel', { type: 'LineString', coordinates: piece })
  }
  for (const street of STREETS) {
    const r = STREET_RADII[street]!
    if (street === 'Esplanade') {
      chan(arcAt(r, CITY_TIME_MIN, 6 - DOME_HALF))
      chan(arcAt(r, 6 + DOME_HALF, CITY_TIME_MAX))
    }
    else {
      chan(arcAt(r, CITY_TIME_MIN, CITY_TIME_MAX))
    }
  }
  for (let t = CITY_TIME_MIN; t <= CITY_TIME_MAX + 1e-9; t += 0.25) {
    const isQuarter = Math.abs(t * 2 - Math.round(t * 2)) > 1e-9
    if (Math.abs(t - 6) < 1e-9)
      chan(radial(6, CANOPY_M + CC_PLAZA_R, kRadius) as [number, number][])
    else
      chan(radial(t, isQuarter ? STREET_RADII.F! : espRadius, kRadius) as [number, number][])
  }
  // keyhole interior channels: the ±KEYHOLE_SPOKE splits (A→B)
  chan(radial(6 - KEYHOLE_SPOKE, STREET_RADII.A!, STREET_RADII.B!) as [number, number][])
  chan(radial(6 + KEYHOLE_SPOKE, STREET_RADII.A!, STREET_RADII.B!) as [number, number][])
  // playa promenades: 3:00 & 9:00 (Man circle ↔ Esplanade), the 12:00 promenade
  // (Man circle → the 12:00 circle), and 6:00 (Man circle → the dome apex)
  chan(radial(9, espRadius, MAN_R) as [number, number][])
  chan(radial(3, MAN_R, espRadius) as [number, number][])
  chan(radial(12, MAN_R, espRadius - 46) as [number, number][])
  chan(radial(6, MAN_R, DOME_APEX_M) as [number, number][])

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
