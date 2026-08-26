<script setup lang="ts">
import type { GeoJSONSource, Map as MlMap } from 'maplibre-gl'
import { cityGridGeoJson, getManPoint } from '~~/lib/brc/cityGeoJson'

// The playa's weather stations, on the city.
//
// A list of numbers does not tell you that it is gusting at 9:00 and calm at
// 4:00 — the whole point of having several stations is the SHAPE of the weather
// across the city, and only a map shows that.
//
// Drawn from our own surveyed geometry rather than a tile service, so it matches
// the main map and works with no signal. Deliberately its own small MapLibre
// instance: the main map carries camps, art, mesh peers and an editing mode, and
// none of that belongs in a weather panel.
export interface StationPoint {
  key: string
  label: string
  owner: string
  lat: number | null
  lng: number | null
  fresh: boolean
  tempF: number | null
  windMph: number | null
  gustMph: number | null
  windDirDeg: number | null
}

const props = defineProps<{ stations: StationPoint[] }>()

const el = ref<HTMLDivElement | null>(null)
let map: MlMap | null = null
let mlgl: typeof import('maplibre-gl') | null = null
const markers: any[] = []

const placed = computed(() => props.stations.filter(s => s.lat != null && s.lng != null))

/**
 * A station marker: a filled pill showing the temperature, with a stalk pointing
 * the way the wind is blowing. Length scales with speed, so a glance across the
 * city reads as a wind field rather than as six separate numbers.
 */
function markerEl(s: StationPoint): HTMLElement {
  const wrap = document.createElement('div')
  wrap.style.cssText = 'position:relative;width:0;height:0'

  if (s.windMph != null && s.windDirDeg != null && s.windMph > 0.5) {
    const len = Math.min(46, 12 + s.windMph * 1.1)
    const stalk = document.createElement('div')
    // meteorological direction is where wind comes FROM; draw it blowing away
    stalk.style.cssText = `position:absolute;left:0;top:0;width:${len}px;height:3px;`
      + `background:#101820;transform-origin:0 50%;`
      + `transform:rotate(${(s.windDirDeg + 90) % 360}deg);border-radius:2px;`
    wrap.appendChild(stalk)
  }

  const pill = document.createElement('div')
  const t = s.tempF == null ? '—' : String(Math.round(s.tempF))
  pill.textContent = t
  pill.style.cssText = 'position:absolute;left:0;top:0;transform:translate(-50%,-50%);'
    + 'min-width:30px;height:30px;padding:0 6px;border-radius:999px;'
    + `background:${s.fresh ? '#d96a1e' : '#9c9588'};color:#fff;`
    + 'border:2.5px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.35);'
    + 'display:flex;align-items:center;justify-content:center;'
    + 'font:600 13px/1 system-ui,-apple-system,Segoe UI,Roboto,sans-serif;cursor:pointer'
  pill.title = `${s.label}${s.owner ? ` — ${s.owner}` : ''}`
  wrap.appendChild(pill)
  return wrap
}

function popupHtml(s: StationPoint): string {
  const esc = (v: unknown) => String(v ?? '').replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', '\'': '&#39;' }[c]!))
  const bits = [`<b>${esc(s.label)}</b>`]
  if (s.owner)
    bits.push(`<div style="color:#6b6255">brought by ${esc(s.owner)}</div>`)
  if (s.tempF != null)
    bits.push(`<div style="margin-top:4px;font-size:15px"><b>${Math.round(s.tempF)}°F</b></div>`)
  if (s.windMph != null) {
    const gust = s.gustMph != null ? `, gusting ${Math.round(s.gustMph)}` : ''
    bits.push(`<div>wind ${Math.round(s.windMph)} mph${gust}</div>`)
  }
  if (!s.fresh)
    bits.push('<div style="margin-top:4px;color:#b45309">not reporting right now</div>')
  return `<div style="font-size:13px;line-height:1.45">${bits.join('')}</div>`
}

function drawMarkers() {
  if (!map || !mlgl)
    return
  for (const m of markers) m.remove()
  markers.length = 0
  for (const s of placed.value) {
    const m = new mlgl.Marker({ element: markerEl(s), anchor: 'center' })
      .setLngLat([s.lng!, s.lat!])
      .setPopup(new mlgl.Popup({ offset: 16 }).setHTML(popupHtml(s)))
      .addTo(map)
    markers.push(m)
  }
}

onMounted(async () => {
  if (!el.value)
    return
  mlgl = await import('maplibre-gl')
  // getManPoint() is already [lng, lat] — MapLibre's own order
  const man = getManPoint()
  map = new mlgl.Map({
    container: el.value,
    style: {
      version: 8,
      glyphs: '/fonts/{fontstack}/{range}.pbf',
      sources: {},
      layers: [{ id: 'bg', type: 'background', paint: { 'background-color': '#f6f2ea' } }],
    },
    center: man,
    zoom: 12.1,
    attributionControl: false,
    // A weather panel is for looking at, not for navigating.
    dragRotate: false,
    pitchWithRotate: false,
  })

  map.on('load', () => {
    if (!map)
      return
    map.addSource('grid', { type: 'geojson', data: cityGridGeoJson() as any })
    // Just enough city to locate a reading: blocks, streets, the fence.
    map.addLayer({
      id: 'blocks',
      type: 'fill',
      source: 'grid',
      filter: ['==', ['get', 'kind'], 'block'],
      paint: { 'fill-color': '#27a3df', 'fill-opacity': 0.13 },
    })
    map.addLayer({
      id: 'streets',
      type: 'line',
      source: 'grid',
      filter: ['==', ['get', 'kind'], 'street-channel'],
      paint: { 'line-color': '#101820', 'line-opacity': 0.35, 'line-width': 1 },
    })
    map.addLayer({
      id: 'fence',
      type: 'line',
      source: 'grid',
      filter: ['==', ['get', 'kind'], 'fence'],
      paint: { 'line-color': '#e1241a', 'line-width': 1.2, 'line-dasharray': [4, 3] },
    })
    map.addLayer({
      id: 'ring-labels',
      type: 'symbol',
      source: 'grid',
      filter: ['==', ['get', 'kind'], 'ring-line'],
      minzoom: 12.8,
      layout: { 'text-field': ['get', 'name'], 'symbol-placement': 'line', 'symbol-spacing': 300, 'text-size': 9 },
      paint: { 'text-color': '#42627c', 'text-halo-color': '#f6f2ea', 'text-halo-width': 1.5 },
    })
    drawMarkers()
  })
})

watch(placed, () => drawMarkers(), { deep: true })
onBeforeUnmount(() => {
  for (const m of markers) m.remove()
  map?.remove()
  map = null
})
</script>

<template>
  <div>
    <div ref="el" class="h-72 w-full overflow-hidden rounded-xl border border-(--ui-border) sm:h-96" />
    <p class="mt-2 text-xs text-(--ui-text-muted)">
      Each pill is a station's temperature; the stalk shows which way the wind is blowing and how hard.
      Grey means it has stopped reporting.
    </p>
  </div>
</template>
