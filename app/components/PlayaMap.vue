<script setup lang="ts">
import 'maplibre-gl/dist/maplibre-gl.css'
import type { GeoJSONSource, Map as MlMap, Marker } from 'maplibre-gl'
import * as suncalcNs from 'suncalc'
import { cityGridGeoJson, civicLandmarksGeoJson, getCenterCampPoint, getManPoint, streetLinesGeoJson, toiletsGeoJson } from '~~/lib/brc/cityGeoJson'

// Regular component (NOT .client) rendered inside <ClientOnly> by the parent.
// MapLibre is dynamically imported in onMounted so it never loads during SSR.
// (.client components break template refs / onMounted DOM access in Nuxt.)

interface CampPin { name: string, lat: number, lng: number, address: string, frontageFt?: number | null, depthFt?: number | null }
// A camp whose boundary is being edited live on the map (admin/owner tool).
export interface EditCamp { id: string, name: string, lat: number, lng: number, frontageFt: number, depthFt: number }

const props = defineProps<{ camps: CampPin[], artPins?: CampPin[], focus?: { lat: number, lng: number } | null, gateColor?: string, layers?: Record<string, boolean>, basemap?: 'blocks' | 'lines', dropMode?: boolean, sunTime?: number | null, wind?: { dir: number, gusts: number, color: string } | null, editCamp?: EditCamp | null }>()

// Swap between the real street-line geometry (default) and the filled-block plan.
function applyBasemap() {
  if (!map)
    return
  const lines = props.basemap !== 'blocks'
  const set = (id: string, visible: boolean) => {
    if (map!.getLayer(id))
      map!.setLayoutProperty(id, 'visibility', visible ? 'visible' : 'none')
  }
  set('blocks', !lines)
  set('block-fans', !lines)
  set('blocks-outline', !lines)
  set('street-lines', lines)
}

// Simple on/off layer groups → their MapLibre layer ids.
const VISIBILITY_GROUPS: Record<string, string[]> = {
  camps: ['camps', 'camp-labels'],
  art: ['art', 'art-labels'],
  toilets: ['toilets'],
}
// Civic markers are one layer coloured by category; we toggle categories with a
// filter. The Temple (sacred) is a landmark and stays visible regardless.
const CIVIC_CATEGORIES = ['medical', 'safety', 'services', 'transport']
function applyLayerVisibility() {
  if (!map)
    return
  for (const [key, ids] of Object.entries(VISIBILITY_GROUPS)) {
    const visible = props.layers?.[key] !== false
    for (const id of ids) {
      if (map.getLayer(id))
        map.setLayoutProperty(id, 'visibility', visible ? 'visible' : 'none')
    }
  }
  const cats = CIVIC_CATEGORIES.filter(c => props.layers?.[c] !== false)
  const filter = ['any', ['==', ['get', 'category'], 'sacred'], ['in', ['get', 'category'], ['literal', cats]]] as any
  for (const id of ['civic-dots', 'civic-labels']) {
    if (map.getLayer(id))
      map.setFilter(id, filter)
  }
}
const emit = defineEmits<{
  position: [{ lat: number, lng: number, accuracy?: number }]
  pick: [{ lat: number, lng: number }]
  editChange: [{ lat: number, lng: number, frontageFt: number, depthFt: number }]
}>()

const el = useTemplateRef<HTMLDivElement>('mapEl')
let map: MlMap | undefined
let pickMarker: Marker | undefined
// MapLibre is dynamically imported in onMounted; stash it here so the boundary
// editor (whose handlers live at script scope) can build its markers too.
// (Typed loosely, like the local `maplibregl` const — the module's default
// export isn't surfaced as a named type.)
let mlgl: any

// Escape user-controlled text before it goes into a popup's innerHTML (setHTML).
// Camp/art names + addresses are user input, so without this a name like
// `<img src=x onerror=…>` would execute (stored XSS).
const HTML_ESC: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', '\'': '&#39;' }
function esc(v: unknown): string {
  return String(v ?? '').replace(/[&<>"']/g, c => HTML_ESC[c]!)
}

function pinsGeoJson(pins: CampPin[]): GeoJSON.FeatureCollection {
  return {
    type: 'FeatureCollection',
    features: pins.map(c => ({
      type: 'Feature',
      properties: { name: c.name, address: c.address },
      geometry: { type: 'Point', coordinates: [c.lng, c.lat] },
    })),
  }
}

// Live-wind layer: a uniform field of arrows across the playa, all pointing the
// way the wind is blowing (meteorological `dir` is where it blows FROM, so the
// arrows point dir+180). Drawn as little arrow polylines so they render without
// any sprite image. Empty when the wind layer is off / no reading.
function windFieldGeoJson(wind: { dir: number, gusts: number, color: string } | null | undefined): GeoJSON.FeatureCollection {
  if (!wind)
    return { type: 'FeatureCollection', features: [] }
  const [clng, clat] = getManPoint()
  const M_LAT = 111320
  const mLng = M_LAT * Math.cos((clat * Math.PI) / 180)
  const bearing = ((wind.dir + 180) % 360) * Math.PI / 180 // radians, blows-to
  const L = 230 // arrow length (m); barbs are a fraction of it
  const ux = Math.sin(bearing) // east unit
  const uy = Math.cos(bearing) // north unit
  const off = (x: number, y: number, dE: number, dN: number): [number, number] => [x + dE / mLng, y + dN / M_LAT]
  const features: GeoJSON.Feature[] = []
  const stepM = 360 // grid spacing (m)
  for (let dn = -1900; dn <= 1900; dn += stepM) {
    for (let de = -2100; de <= 2100; de += stepM) {
      const cx = clng + de / mLng
      const cy = clat + dn / M_LAT
      const tail = off(cx, cy, -ux * L / 2, -uy * L / 2)
      const tip = off(cx, cy, ux * L / 2, uy * L / 2)
      // two barbs, swept back ~140° from the shaft
      const bA = bearing + (140 * Math.PI / 180)
      const bB = bearing - (140 * Math.PI / 180)
      const barbLen = L * 0.4
      const barb1 = off(tip[0], tip[1], Math.sin(bA) * barbLen, Math.cos(bA) * barbLen)
      const barb2 = off(tip[0], tip[1], Math.sin(bB) * barbLen, Math.cos(bB) * barbLen)
      features.push({
        type: 'Feature',
        properties: {},
        geometry: { type: 'MultiLineString', coordinates: [[tail, tip], [barb1, tip, barb2]] },
      })
    }
  }
  return { type: 'FeatureCollection', features }
}

// Geometry of a camp plot at lat/lng with frontage/depth (feet): the box is
// centred on the pin, frontage running tangentially (along the street) and depth
// radially (toward/away from the Man). Returns the metres-per-degree, the local
// radial/tangential unit axes, the corner ring, and the two edge-midpoint
// "handle" points used by the live boundary editor. Orientation is derived from
// the pin's bearing off the Man, so there's no stored rotation to track.
function plotGeometry(lat: number, lng: number, frontageFt: number, depthFt: number) {
  const [manLng, manLat] = getManPoint()
  const MLAT = 111320
  const MLNG = MLAT * Math.cos((manLat * Math.PI) / 180)
  const E = (lng - manLng) * MLNG
  const N = (lat - manLat) * MLAT
  const r = Math.hypot(E, N) || 1
  const rad: [number, number] = [E / r, N / r] // outward → depth axis
  const tan: [number, number] = [-N / r, E / r] // along the street → frontage axis
  const hf = (frontageFt * 0.3048) / 2 // half-frontage, metres
  const hd = (depthFt * 0.3048) / 2 // half-depth, metres
  const pt = (de: number, dn: number): [number, number] => [manLng + (E + de) / MLNG, manLat + (N + dn) / MLAT]
  const corner = (sf: number, sd: number) => pt(sf * hf * tan[0] + sd * hd * rad[0], sf * hf * tan[1] + sd * hd * rad[1])
  return {
    MLNG, MLAT, E, N, manLng, manLat, rad, tan,
    ring: [corner(-1, -1), corner(1, -1), corner(1, 1), corner(-1, 1), corner(-1, -1)],
    // midpoint of each side, for the editor's draggable edge handles
    handles: {
      outer: pt(hd * rad[0], hd * rad[1]), // +radial (away from the Man) → depth
      inner: pt(-hd * rad[0], -hd * rad[1]), // −radial (toward the Man) → depth
      right: pt(hf * tan[0], hf * tan[1]), // +tangential → frontage
      left: pt(-hf * tan[0], -hf * tan[1]), // −tangential → frontage
    },
  }
}

// Rectangular plot footprints for camps that set frontage/depth (feet).
function campPlotsGeoJson(pins: CampPin[]): GeoJSON.FeatureCollection {
  const features: GeoJSON.Feature[] = []
  for (const c of pins) {
    const fF = c.frontageFt ?? 0
    const dF = c.depthFt ?? 0
    if (fF <= 0 || dF <= 0)
      continue
    features.push({
      type: 'Feature',
      properties: { name: c.name },
      geometry: { type: 'Polygon', coordinates: [plotGeometry(c.lat, c.lng, fF, dF).ring] },
    })
  }
  return { type: 'FeatureCollection', features }
}

// 2D convex hull (Andrew's monotone chain) over [x, y] points.
function convexHull(pts: [number, number][]): [number, number][] {
  const p = pts.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1])
  if (p.length < 3)
    return p
  const cross = (o: [number, number], a: [number, number], b: [number, number]) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0])
  const lower: [number, number][] = []
  for (const q of p) {
    while (lower.length >= 2 && cross(lower[lower.length - 2]!, lower[lower.length - 1]!, q) <= 0) lower.pop()
    lower.push(q)
  }
  const upper: [number, number][] = []
  for (let i = p.length - 1; i >= 0; i--) {
    const q = p[i]!
    while (upper.length >= 2 && cross(upper[upper.length - 2]!, upper[upper.length - 1]!, q) <= 0) upper.pop()
    upper.push(q)
  }
  lower.pop()
  upper.pop()
  return lower.concat(upper)
}

// Cast shadows for every camp at a given instant: each footprint (the plot, or a
// small default box) is swept in the anti-sun direction; length scales with sun
// altitude. `sunTime` is epoch ms; null/sun-down → no shadows.
const SHADOW_HEIGHT_M = 3.5 // reference structure height
const SHADOW_MAX_M = 90
// suncalc is CommonJS — normalize whether the bundler exposes a default or the
// namespace itself.
const SunCalc = ((suncalcNs as any).default ?? suncalcNs) as { getPosition: (date: Date, lat: number, lng: number) => { altitude: number, azimuth: number } }
function shadowsGeoJson(pins: CampPin[], sunTime: number | null | undefined): GeoJSON.FeatureCollection {
  if (sunTime == null)
    return { type: 'FeatureCollection', features: [] }
  const [manLng, manLat] = getManPoint()
  const sun = SunCalc.getPosition(new Date(sunTime), manLat, manLng) // degrees, az from N
  if (sun.altitude <= 1)
    return { type: 'FeatureCollection', features: [] } // sun down / too low
  const MLAT = 111320
  const MLNG = MLAT * Math.cos((manLat * Math.PI) / 180)
  const L = Math.min(SHADOW_MAX_M, SHADOW_HEIGHT_M / Math.tan((sun.altitude * Math.PI) / 180))
  const shAz = ((sun.azimuth + 180) * Math.PI) / 180 // shadow points away from the sun
  const sE = L * Math.sin(shAz)
  const sN = L * Math.cos(shAz)
  const features: GeoJSON.Feature[] = []
  for (const c of pins) {
    const E = (c.lng - manLng) * MLNG
    const N = (c.lat - manLat) * MLAT
    const r = Math.hypot(E, N) || 1
    const rad: [number, number] = [E / r, N / r]
    const tan: [number, number] = [-N / r, E / r]
    const hf = ((c.frontageFt ?? 0) > 0 ? (c.frontageFt! * 0.3048) : 6) / 2
    const hd = ((c.depthFt ?? 0) > 0 ? (c.depthFt! * 0.3048) : 6) / 2
    const base: [number, number][] = ([[-1, -1], [1, -1], [1, 1], [-1, 1]] as const).map(([sf, sd]) =>
      [E + sf * hf * tan[0] + sd * hd * rad[0], N + sf * hf * tan[1] + sd * hd * rad[1]] as [number, number])
    const hull = convexHull([...base, ...base.map(([e, n]) => [e + sE, n + sN] as [number, number])])
    const ring = hull.map(([e, n]) => [manLng + e / MLNG, manLat + n / MLAT] as [number, number])
    ring.push(ring[0]!)
    features.push({ type: 'Feature', properties: { name: c.name }, geometry: { type: 'Polygon', coordinates: [ring] } })
  }
  return { type: 'FeatureCollection', features }
}

// --- live boundary editor --------------------------------------------------
// A green plot overlay with five draggable markers: the centre pin (moves the
// whole plot) and one handle on each of the four sides. Dragging a side moves
// that boundary while the opposite side stays put — so you reshape the plot, not
// just recentre it. The model stays {centre pin + frontage + depth}: an edge
// drag updates the dimension AND shifts the pin so the far edge holds, which the
// stored geometry (which centres the box on the pin) reproduces exactly.
// `edit` is the single source of truth; the parent receives it via `editChange`.
type EdgeKey = 'outer' | 'inner' | 'left' | 'right'
const MIN_FT = 20
const MAX_FT = 3000
const MIN_M = MIN_FT * 0.3048
const MAX_M = MAX_FT * 0.3048
const edit = { id: '', lat: 0, lng: 0, frontageFt: 0, depthFt: 0 }
let editCenter: Marker | undefined
const editEdges: Partial<Record<EdgeKey, Marker>> = {}

const clampFt = (v: number): number => Math.max(MIN_FT, Math.min(MAX_FT, Math.round(v)))
const EMPTY_FC: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features: [] }
const EDGE_AXIS: Record<EdgeKey, 'frontage' | 'depth'> = { outer: 'depth', inner: 'depth', left: 'frontage', right: 'frontage' }

function handleEl(title: string): HTMLDivElement {
  const d = document.createElement('div')
  d.title = `Drag to set ${title}`
  d.style.cssText = 'width:15px;height:15px;border-radius:3px;background:#16a34a;border:2px solid #fff;box-shadow:0 1px 3px rgba(0,0,0,.4);cursor:grab'
  return d
}

function renderEdit(): void {
  if (!map)
    return
  const g = plotGeometry(edit.lat, edit.lng, edit.frontageFt, edit.depthFt)
  ;(map.getSource('edit-plot') as GeoJSONSource | undefined)?.setData({
    type: 'FeatureCollection',
    features: [{ type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [g.ring] } }],
  })
  editCenter?.setLngLat([edit.lng, edit.lat])
  for (const k of Object.keys(g.handles) as EdgeKey[])
    editEdges[k]?.setLngLat(g.handles[k])
  emit('editChange', { lat: edit.lat, lng: edit.lng, frontageFt: edit.frontageFt, depthFt: edit.depthFt })
}

// Drag a side: project its new position onto the outward axis to get the new
// half-extent on that side, hold the opposite side fixed, and translate the pin
// to the new midpoint. The perpendicular dimension is unchanged.
function onEdgeDrag(edge: EdgeKey): void {
  const m = editEdges[edge]
  if (!m)
    return
  const ll = m.getLngLat()
  const g = plotGeometry(edit.lat, edit.lng, edit.frontageFt, edit.depthFt)
  const axisIs = EDGE_AXIS[edge]
  const half = (axisIs === 'frontage' ? edit.frontageFt : edit.depthFt) * 0.3048 / 2 // current half-extent (m)
  // outward unit vector for this side (away from the pin)
  const sign = (edge === 'inner' || edge === 'left') ? -1 : 1
  const base = axisIs === 'frontage' ? g.tan : g.rad
  const u: [number, number] = [base[0] * sign, base[1] * sign]
  const dE = (ll.lng - g.manLng) * g.MLNG - g.E
  const dN = (ll.lat - g.manLat) * g.MLAT - g.N
  const d = dE * u[0] + dN * u[1] // signed distance pin→dragged edge along u
  const dimM = Math.max(MIN_M, Math.min(MAX_M, d + half)) // new full dimension, far edge fixed at -half
  const newHalf = dimM / 2
  // shift the pin so the opposite (-u) edge stays at its old position
  const shift = newHalf - half
  edit.lng += (shift * u[0]) / g.MLNG
  edit.lat += (shift * u[1]) / g.MLAT
  if (axisIs === 'frontage')
    edit.frontageFt = clampFt(dimM / 0.3048)
  else
    edit.depthFt = clampFt(dimM / 0.3048)
  renderEdit() // re-snaps every handle onto its side at the clamped size
}

function teardownEdit(): void {
  editCenter?.remove(); editCenter = undefined
  for (const k of Object.keys(editEdges) as EdgeKey[]) {
    editEdges[k]?.remove()
    delete editEdges[k]
  }
  if (map?.getLayer('edit-plot-fill'))
    map.removeLayer('edit-plot-fill')
  if (map?.getLayer('edit-plot-outline'))
    map.removeLayer('edit-plot-outline')
  if (map?.getSource('edit-plot'))
    map.removeSource('edit-plot')
}

function setupEdit(c: EditCamp): void {
  if (!map || !mlgl)
    return
  teardownEdit()
  Object.assign(edit, { id: c.id, lat: c.lat, lng: c.lng, frontageFt: clampFt(c.frontageFt), depthFt: clampFt(c.depthFt) })
  map.addSource('edit-plot', { type: 'geojson', data: EMPTY_FC })
  map.addLayer({ id: 'edit-plot-fill', type: 'fill', source: 'edit-plot', paint: { 'fill-color': '#16a34a', 'fill-opacity': 0.22 } })
  map.addLayer({ id: 'edit-plot-outline', type: 'line', source: 'edit-plot', paint: { 'line-color': '#16a34a', 'line-width': 2.5 } })

  const g = plotGeometry(edit.lat, edit.lng, edit.frontageFt, edit.depthFt)
  const center: Marker = new mlgl.Marker({ color: '#16a34a', draggable: true }).setLngLat([edit.lng, edit.lat]).addTo(map)
  center.on('drag', () => {
    const ll = center.getLngLat()
    edit.lat = ll.lat
    edit.lng = ll.lng
    renderEdit()
  })
  editCenter = center
  const LABEL: Record<EdgeKey, string> = { outer: 'depth (outer edge)', inner: 'depth (inner edge)', left: 'frontage (left edge)', right: 'frontage (right edge)' }
  for (const k of ['outer', 'inner', 'left', 'right'] as EdgeKey[]) {
    const h: Marker = new mlgl.Marker({ element: handleEl(LABEL[k]), draggable: true }).setLngLat(g.handles[k]).addTo(map)
    h.on('drag', () => onEdgeDrag(k))
    editEdges[k] = h
  }

  renderEdit()
  map.flyTo({ center: [edit.lng, edit.lat], zoom: 16.2, speed: 0.9 })
}

// Precise +/- nudges from the parent panel's steppers (symmetric about the pin).
function nudgeEdit(which: 'frontage' | 'depth', delta: number): void {
  if (!props.editCamp)
    return
  if (which === 'frontage')
    edit.frontageFt = clampFt(edit.frontageFt + delta)
  else
    edit.depthFt = clampFt(edit.depthFt + delta)
  renderEdit()
}
defineExpose({ nudgeEdit })

onMounted(async () => {
  await nextTick()
  if (!el.value)
    return
  const maplibregl = (await import('maplibre-gl')).default
  mlgl = maplibregl

  // resolve once, after the golden-spike plugin has calibrated the city center
  const man = getManPoint()
  const centerCamp = getCenterCampPoint()

  map = new maplibregl.Map({
    container: el.value,
    // tile-free style: the playa is featureless, so we draw only the city grid
    style: {
      version: 8,
      // Self-hosted glyph fonts (mirrored from MapLibre demotiles) so labels
      // render fully offline with no third-party dependency. The SW precaches
      // these PBFs; see public/fonts/. Latin ranges cover all playa labels.
      glyphs: '/fonts/{fontstack}/{range}.pbf',
      sources: {},
      layers: [{ id: 'bg', type: 'background', paint: { 'background-color': '#f8f5ef' } }],
    },
    // frame on a point between the Man and Center Camp so the city fills the view
    center: [(man[0] + centerCamp[0]) / 2, (man[1] + centerCamp[1]) / 2],
    zoom: 13.65,
    // Orient like the official BRC plan: 12:00 (the opening) up, 6:00 down.
    // The city's 12:00 axis sits at compass bearing 45° (4:30 axis = true N/S).
    bearing: 45,
    // Lock the orientation so pan/zoom can't rotate it off the plan layout.
    dragRotate: false,
    pitchWithRotate: false,
    attributionControl: false,
  })
  map.touchZoomRotate.disableRotation()

  map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right')
  const geolocate = new maplibregl.GeolocateControl({
    positionOptions: { enableHighAccuracy: true },
    trackUserLocation: true,
    showUserLocation: true,
  })
  map.addControl(geolocate, 'top-right')
  geolocate.on('geolocate', (e: any) => {
    emit('position', { lat: e.coords.latitude, lng: e.coords.longitude, accuracy: e.coords.accuracy })
  })

  map.on('load', () => {
    if (!map)
      return
    map.addSource('grid', { type: 'geojson', data: cityGridGeoJson() })
    // city blocks — vivid blue cells (white street channels are the gaps between)
    map.addLayer({
      id: 'blocks',
      type: 'fill',
      source: 'grid',
      // only the placed-camp blocks are filled blue; the walk-in fringe (camp=0)
      // is outline-only, giving the official tapered-horseshoe shape.
      filter: ['all', ['==', ['get', 'kind'], 'block'], ['==', ['get', 'camp'], 1]],
      // vivid azure (#2fa1fa) fading to white toward the outer rings + 2:00/10:00
      // tips, per the official plan (each block carries a 0→1 `shade`).
      paint: {
        'fill-color': ['interpolate', ['linear'], ['get', 'shade'], 0, '#2fa1fa', 1, '#ffffff'],
        'fill-opacity': 0.97,
      },
    })
    // radial gradient fans — pale wedges along each spoke (official-plan look)
    map.addLayer({
      id: 'block-fans',
      type: 'fill',
      source: 'grid',
      filter: ['==', ['get', 'kind'], 'fan'],
      paint: { 'fill-color': '#eaf6ff', 'fill-opacity': 0.4 },
    })
    map.addLayer({
      id: 'blocks-outline',
      type: 'line',
      source: 'grid',
      filter: ['==', ['get', 'kind'], 'block'],
      paint: { 'line-color': '#22455f', 'line-width': ['interpolate', ['linear'], ['zoom'], 12, 0.6, 15, 1.1] },
    })
    // "Streets" basemap — the EXACT 2026 street geometry traced from the official
    // plan PDF. The default view: accurate street vectors, no fills.
    map.addSource('streets', { type: 'geojson', data: streetLinesGeoJson() })
    map.addLayer({
      id: 'street-lines',
      type: 'line',
      source: 'streets',
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: { 'line-color': '#9c9588', 'line-width': ['interpolate', ['linear'], ['zoom'], 12, 0.5, 14, 1, 16, 1.8] },
    })
    // trash fence (red dashed pentagon)
    map.addLayer({
      id: 'fence',
      type: 'line',
      source: 'grid',
      filter: ['==', ['get', 'kind'], 'fence'],
      paint: { 'line-color': '#e1241a', 'line-width': 1.4, 'line-dasharray': [4, 3] },
    })
    // cardinal avenues + 12:00 promenade + the Man's circle (black)
    map.addLayer({
      id: 'avenues',
      type: 'line',
      source: 'grid',
      filter: ['==', ['get', 'kind'], 'avenue'],
      paint: { 'line-color': '#1c2733', 'line-width': 1.1 },
    })
    // 6:00 gate road
    map.addLayer({
      id: 'gate-road',
      type: 'line',
      source: 'grid',
      filter: ['==', ['get', 'kind'], 'gate-road'],
      paint: { 'line-color': props.gateColor ?? '#1c2733', 'line-width': props.gateColor ? 3 : 1.6 },
    })
    map.addLayer({
      id: 'gate-road-label',
      type: 'symbol',
      source: 'grid',
      filter: ['==', ['get', 'kind'], 'gate-road'],
      minzoom: 12.8,
      layout: {
        'text-field': 'Gate Road',
        'symbol-placement': 'line',
        'symbol-spacing': 220,
        'text-size': 10,
        'text-letter-spacing': 0.08,
      },
      paint: { 'text-color': '#1c2733', 'text-halo-color': '#f6f2ea', 'text-halo-width': 1.6 },
    })
    // Airport Road — 5:00 branch out to the airport
    map.addLayer({
      id: 'airport-road',
      type: 'line',
      source: 'grid',
      filter: ['==', ['get', 'kind'], 'airport-road'],
      layout: { 'line-cap': 'round' },
      paint: { 'line-color': '#1c2733', 'line-width': 1.4 },
    })
    map.addLayer({
      id: 'airport-road-label',
      type: 'symbol',
      source: 'grid',
      filter: ['==', ['get', 'kind'], 'airport-road'],
      minzoom: 12.8,
      layout: {
        'text-field': ['get', 'name'],
        'symbol-placement': 'line',
        'symbol-spacing': 240,
        'text-size': 10,
        'text-letter-spacing': 0.06,
      },
      paint: { 'text-color': '#1c2733', 'text-halo-color': '#f6f2ea', 'text-halo-width': 1.6 },
    })
    // portals: open plaza circles. The fill-mask erases the blocks/grid/avenues
    // underneath so the circles read as clear open plazas (no lines through them).
    // Center Camp is the exception — the official 2026 plan fills Rod's Ring Road
    // blue (camps/plaza), with only the ring-road + café drawn as outline circles,
    // so it masks with the block azure rather than the open-plaza cream.
    map.addLayer({
      id: 'portal-mask',
      type: 'fill',
      source: 'grid',
      filter: ['==', ['get', 'kind'], 'portal-fill'],
      paint: { 'fill-color': ['case', ['==', ['get', 'name'], 'Center Camp'], '#2fa1fa', '#fbf9f5'] },
    })
    map.addLayer({
      id: 'portals',
      type: 'line',
      source: 'grid',
      filter: ['==', ['get', 'kind'], 'portal'],
      paint: { 'line-color': '#1c2733', 'line-width': 1.5 },
    })
    // walk-in camping boundary (orange dashed, right side)
    map.addLayer({
      id: 'walkin-boundary',
      type: 'line',
      source: 'grid',
      filter: ['==', ['get', 'kind'], 'walkin-boundary'],
      paint: { 'line-color': '#e08a2b', 'line-width': 1.4, 'line-dasharray': [4, 2] },
    })
    map.addLayer({
      id: 'walkin-labels',
      type: 'symbol',
      source: 'grid',
      filter: ['==', ['get', 'kind'], 'walkin-label'],
      minzoom: 13,
      layout: { 'text-field': ['get', 'name'], 'text-size': 10, 'text-max-width': 6 },
      paint: { 'text-color': '#b06a16', 'text-halo-color': '#f6f2ea', 'text-halo-width': 1.5 },
    })
    map.addLayer({
      id: 'portal-labels',
      type: 'symbol',
      source: 'grid',
      filter: ['==', ['get', 'kind'], 'portal-label'],
      minzoom: 13.2,
      layout: { 'text-field': ['get', 'name'], 'text-size': 10 },
      paint: { 'text-color': '#1c2733', 'text-halo-color': '#ffffff', 'text-halo-width': 1.4 },
    })
    // 2026 themed street names (upper-left, as on the plan) — overview only;
    // hands off to the along-road labels once you zoom in.
    map.addLayer({
      id: 'street-labels',
      type: 'symbol',
      source: 'grid',
      filter: ['==', ['get', 'kind'], 'street-label'],
      minzoom: 12.8,
      maxzoom: 14,
      layout: {
        'text-field': ['get', 'name'],
        'text-size': 9.5,
        'text-allow-overlap': true,
        'text-ignore-placement': true,
        'text-rotation-alignment': 'map',
        'text-rotate': 300,
        'text-anchor': 'left',
      },
      paint: { 'text-color': '#1c2733', 'text-halo-color': '#f6f2ea', 'text-halo-width': 1.4 },
    })
    // Lettered ring-road names, curving ALONG each circular street (zoom in).
    map.addLayer({
      id: 'ring-labels',
      type: 'symbol',
      source: 'grid',
      filter: ['==', ['get', 'kind'], 'ring-line'],
      minzoom: 13.8,
      layout: {
        'text-field': ['get', 'name'],
        'symbol-placement': 'line',
        'symbol-spacing': 360,
        'text-size': 10,
        'text-letter-spacing': 0.04,
      },
      paint: { 'text-color': '#42627c', 'text-halo-color': '#f6f2ea', 'text-halo-width': 1.8 },
    })
    // Numbered radial-avenue times, running ALONG each radial (zoom in).
    map.addLayer({
      id: 'radial-labels',
      type: 'symbol',
      source: 'grid',
      filter: ['==', ['get', 'kind'], 'radial-line'],
      minzoom: 13.8,
      layout: {
        'text-field': ['get', 'name'],
        'symbol-placement': 'line',
        'symbol-spacing': 280,
        'text-size': 10,
      },
      paint: { 'text-color': '#1c2733', 'text-halo-color': '#f6f2ea', 'text-halo-width': 1.8 },
    })
    // landmarks: the Man + Center Camp
    map.addSource('landmarks', {
      type: 'geojson',
      data: {
        type: 'FeatureCollection',
        features: [
          { type: 'Feature', properties: { name: 'The Man' }, geometry: { type: 'Point', coordinates: man } },
          { type: 'Feature', properties: { name: 'Center Camp' }, geometry: { type: 'Point', coordinates: centerCamp } },
        ],
      },
    })
    map.addLayer({
      id: 'landmark-dots',
      type: 'circle',
      source: 'landmarks',
      paint: { 'circle-radius': ['interpolate', ['linear'], ['zoom'], 12, 3.5, 15, 5, 18, 10], 'circle-color': '#1c2733', 'circle-stroke-color': '#ffffff', 'circle-stroke-width': 1.5 },
    })
    map.addLayer({
      id: 'landmark-labels',
      type: 'symbol',
      source: 'landmarks',
      layout: { 'text-field': ['get', 'name'], 'text-size': ['interpolate', ['linear'], ['zoom'], 12, 10, 15, 12, 18, 17], 'text-offset': [0, -1.1], 'text-anchor': 'bottom' },
      paint: { 'text-color': '#1c2733', 'text-halo-color': '#ffffff', 'text-halo-width': 1.6 },
    })
    // porta-potties (approx., from 2025 GIS) — small utility markers under everything
    map.addSource('toilets', { type: 'geojson', data: toiletsGeoJson() })
    map.addLayer({
      id: 'toilets',
      type: 'circle',
      source: 'toilets',
      minzoom: 13,
      paint: { 'circle-radius': ['interpolate', ['linear'], ['zoom'], 13, 2.5, 16, 4.5, 18, 8], 'circle-color': '#3f6212', 'circle-stroke-color': '#ffffff', 'circle-stroke-width': 1 },
    })
    map.on('click', 'toilets', (e) => {
      if (map)
        new maplibregl.Popup().setLngLat((e.features?.[0]?.geometry as any).coordinates).setHTML('<b>Porta-potties</b><br>approx. (2025 placement)').addTo(map)
    })
    // civic landmarks: airport, medical, ESD, DPW, Rangers, services… colour-coded
    const civicColor = [
      'match', ['get', 'category'],
      'medical', '#dc2626',
      'safety', '#2563eb',
      'transport', '#d97706',
      'services', '#0e7490',
      'sacred', '#7c3aed',
      /* other */ '#334155',
    ] as any
    map.addSource('civic', { type: 'geojson', data: civicLandmarksGeoJson() })
    map.addLayer({
      id: 'civic-dots',
      type: 'circle',
      source: 'civic',
      paint: {
        'circle-radius': ['interpolate', ['linear'], ['zoom'], 12, 4, 15, 5.5, 18, 11],
        'circle-color': civicColor,
        'circle-stroke-color': '#ffffff',
        'circle-stroke-width': 1.5,
      },
    })
    map.addLayer({
      id: 'civic-labels',
      type: 'symbol',
      source: 'civic',
      minzoom: 13,
      layout: {
        'text-field': ['get', 'name'],
        'text-size': ['interpolate', ['linear'], ['zoom'], 13, 9, 15, 11, 18, 15],
        'text-offset': [0, 0.9],
        'text-anchor': 'top',
        'text-max-width': 7,
      },
      paint: { 'text-color': '#1c2733', 'text-halo-color': '#ffffff', 'text-halo-width': 1.6 },
    })
    map.on('click', 'civic-dots', (e) => {
      const f = e.features?.[0]
      if (f && map) {
        const note = f.properties?.note ? `<br>${esc(f.properties.note)}` : ''
        new maplibregl.Popup()
          .setLngLat((f.geometry as any).coordinates)
          .setHTML(`<b>${esc(f.properties?.name)}</b>${note}`)
          .addTo(map)
      }
    })
    // art pins (violet) — drawn under camp pins
    map.addSource('art', { type: 'geojson', data: pinsGeoJson(props.artPins ?? []) })
    map.addLayer({
      id: 'art',
      type: 'circle',
      source: 'art',
      paint: { 'circle-radius': ['interpolate', ['linear'], ['zoom'], 12, 4.5, 15, 6.5, 18, 13], 'circle-color': '#7c3aed', 'circle-stroke-color': '#fff', 'circle-stroke-width': 2 },
    })
    map.addLayer({
      id: 'art-labels',
      type: 'symbol',
      source: 'art',
      layout: { 'text-field': ['get', 'name'], 'text-size': ['interpolate', ['linear'], ['zoom'], 12, 10, 15, 12, 18, 17], 'text-offset': [0, 1.2], 'text-anchor': 'top' },
      paint: { 'text-color': '#5b21b6', 'text-halo-color': '#fff', 'text-halo-width': 1.6 },
    })
    map.on('click', 'art', (e) => {
      const f = e.features?.[0]
      if (f && map) {
        new maplibregl.Popup()
          .setLngLat((f.geometry as any).coordinates)
          .setHTML(`<b>${esc(f.properties?.name)}</b><br>${esc(f.properties?.address)}`)
          .addTo(map)
      }
    })
    // sun shadows (when the shade tool is active) — drawn under everything
    map.addSource('shadows', { type: 'geojson', data: shadowsGeoJson(props.camps, props.sunTime) })
    map.addLayer({
      id: 'shadows',
      type: 'fill',
      source: 'shadows',
      paint: { 'fill-color': '#1c2733', 'fill-opacity': 0.22 },
    })
    // live wind arrows (when the Wind layer is on) — over the city, under the pins
    map.addSource('wind', { type: 'geojson', data: windFieldGeoJson(props.wind) })
    map.addLayer({
      id: 'wind-arrows',
      type: 'line',
      source: 'wind',
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: {
        'line-color': props.wind?.color ?? '#2563eb',
        'line-width': ['interpolate', ['linear'], ['zoom'], 12, 1.1, 15, 2, 18, 3.5],
        'line-opacity': 0.9,
      },
    })
    // camp plot footprints (appear as you zoom in) — drawn under the pins
    map.addSource('camp-plots', { type: 'geojson', data: campPlotsGeoJson(props.camps) })
    map.addLayer({
      id: 'camp-plots-fill',
      type: 'fill',
      source: 'camp-plots',
      minzoom: 14.5,
      paint: { 'fill-color': '#d6336c', 'fill-opacity': ['interpolate', ['linear'], ['zoom'], 14.5, 0, 16, 0.14] },
    })
    map.addLayer({
      id: 'camp-plots-outline',
      type: 'line',
      source: 'camp-plots',
      minzoom: 14.5,
      paint: { 'line-color': '#d6336c', 'line-width': 1.2, 'line-dasharray': [2, 1.5], 'line-opacity': ['interpolate', ['linear'], ['zoom'], 14.5, 0, 16, 0.85] },
    })
    // camp pins
    map.addSource('camps', { type: 'geojson', data: pinsGeoJson(props.camps) })
    map.addLayer({
      id: 'camps',
      type: 'circle',
      source: 'camps',
      paint: { 'circle-radius': ['interpolate', ['linear'], ['zoom'], 12, 4.5, 15, 6.5, 18, 13], 'circle-color': '#d6336c', 'circle-stroke-color': '#fff', 'circle-stroke-width': 2 },
    })
    map.addLayer({
      id: 'camp-labels',
      type: 'symbol',
      source: 'camps',
      layout: { 'text-field': ['get', 'name'], 'text-size': ['interpolate', ['linear'], ['zoom'], 12, 10, 15, 12, 18, 17], 'text-offset': [0, 1.2], 'text-anchor': 'top' },
      paint: { 'text-color': '#1c2733', 'text-halo-color': '#fff', 'text-halo-width': 1.6 },
    })
    map.on('click', 'camps', (e) => {
      const f = e.features?.[0]
      if (f && map) {
        new maplibregl.Popup()
          .setLngLat((f.geometry as any).coordinates)
          .setHTML(`<b>${esc(f.properties?.name)}</b><br>${esc(f.properties?.address)}`)
          .addTo(map)
      }
    })

    // Placement mode: only when the parent has armed a drop (clicked Drop/Edit)
    // does tapping the map place/move a draggable pin at the EXACT point. Clicks
    // on an existing marker fall through to that marker's popup instead.
    const interactive = ['camps', 'art', 'toilets', 'civic-dots']
    map.on('click', (e) => {
      if (!map || !props.dropMode)
        return
      const hit = map.queryRenderedFeatures(e.point, { layers: interactive.filter(id => map!.getLayer(id)) })
      if (hit.length)
        return
      const { lat, lng } = e.lngLat
      if (!pickMarker) {
        pickMarker = new maplibregl.Marker({ color: '#e1641a', draggable: true }).setLngLat([lng, lat]).addTo(map)
        pickMarker.on('dragend', () => {
          const ll = pickMarker!.getLngLat()
          emit('pick', { lat: ll.lat, lng: ll.lng })
        })
      }
      else {
        pickMarker.setLngLat([lng, lat])
      }
      emit('pick', { lat, lng })
    })

    // Point every label layer at our self-hosted glyphs (public/fonts/OpenSans,
    // no spaces/commas in the name so the offline SW precache-match is exact).
    // Done once here rather than repeating text-font on each addLayer above.
    for (const layer of map.getStyle().layers) {
      if (layer.type === 'symbol')
        map.setLayoutProperty(layer.id, 'text-font', ['OpenSans'])
    }

    applyLayerVisibility()
    applyBasemap()
    // apply an initial focus (?lat&lng "view on map") — the watch below can miss
    // it because it fires before the map finishes loading.
    if (props.focus)
      map.flyTo({ center: [props.focus.lng, props.focus.lat], zoom: 15, speed: 0.8 })
    // arm the boundary editor if we loaded straight into ?editCamp=… (the watch
    // below can fire before the map is ready).
    if (props.editCamp)
      setupEdit(props.editCamp)
  })
})

// show/hide layer groups from the legend toggles
watch(() => props.layers, applyLayerVisibility, { deep: true })
watch(() => props.basemap, applyBasemap)

// placement mode: crosshair cursor while armed; clear the pin when it ends
watch(() => props.dropMode, (on) => {
  if (!map)
    return
  map.getCanvas().style.cursor = on ? 'crosshair' : ''
  if (!on) {
    pickMarker?.remove()
    pickMarker = undefined
  }
})

// keep camp pins + plot footprints + shadows in sync
watch(() => props.camps, () => {
  ;(map?.getSource('camps') as GeoJSONSource | undefined)?.setData(pinsGeoJson(props.camps))
  ;(map?.getSource('camp-plots') as GeoJSONSource | undefined)?.setData(campPlotsGeoJson(props.camps))
  ;(map?.getSource('shadows') as GeoJSONSource | undefined)?.setData(shadowsGeoJson(props.camps, props.sunTime))
}, { deep: true })

// recompute shadows when the shade-tool time changes
watch(() => props.sunTime, () => {
  ;(map?.getSource('shadows') as GeoJSONSource | undefined)?.setData(shadowsGeoJson(props.camps, props.sunTime))
})

// redraw the wind arrows + recolor when the Wind layer toggles or the reading updates
watch(() => props.wind, (w) => {
  ;(map?.getSource('wind') as GeoJSONSource | undefined)?.setData(windFieldGeoJson(w))
  if (map?.getLayer('wind-arrows'))
    map.setPaintProperty('wind-arrows', 'line-color', w?.color ?? '#2563eb')
}, { deep: true })

// keep art pins in sync
watch(() => props.artPins, () => {
  const src = map?.getSource('art') as GeoJSONSource | undefined
  src?.setData(pinsGeoJson(props.artPins ?? []))
}, { deep: true })

// recolor the gate road when the live Gate Road condition changes
watch(() => props.gateColor, (c) => {
  if (!map?.getLayer('gate-road'))
    return
  map.setPaintProperty('gate-road', 'line-color', c ?? '#1c2733')
  map.setPaintProperty('gate-road', 'line-width', c ? 3 : 1.6)
})

// fly to a focused camp when it changes after load (initial focus is applied in
// the load handler above, since this can fire before the map exists)
watch(() => props.focus, (f) => {
  if (f && map)
    map.flyTo({ center: [f.lng, f.lat], zoom: 15, speed: 0.8 })
})

// arm/disarm the live boundary editor as the parent enters/leaves edit mode.
// Keyed on the camp id so re-selecting a different camp re-arms cleanly.
watch(() => props.editCamp?.id, () => {
  if (!map)
    return
  if (props.editCamp)
    setupEdit(props.editCamp)
  else
    teardownEdit()
})

onBeforeUnmount(() => map?.remove())
</script>

<template>
  <div ref="mapEl" class="size-full" />
</template>

<style scoped>
/* Keep the zoom / locate controls clear of the floating top bar (Drop / account). */
:deep(.maplibregl-ctrl-top-right) {
  margin-top: 3.25rem;
}
</style>
