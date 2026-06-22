<script setup lang="ts">
import 'maplibre-gl/dist/maplibre-gl.css'
import type { GeoJSONSource, Map as MlMap, Marker } from 'maplibre-gl'
import { cityGridGeoJson, civicLandmarksGeoJson, getCenterCampPoint, getManPoint, streetLinesGeoJson, toiletsGeoJson } from '~~/lib/brc/cityGeoJson'

// Regular component (NOT .client) rendered inside <ClientOnly> by the parent.
// MapLibre is dynamically imported in onMounted so it never loads during SSR.
// (.client components break template refs / onMounted DOM access in Nuxt.)

interface CampPin { name: string, lat: number, lng: number, address: string }

const props = defineProps<{ camps: CampPin[], artPins?: CampPin[], focus?: { lat: number, lng: number } | null, gateColor?: string, layers?: Record<string, boolean>, basemap?: 'blocks' | 'lines', dropMode?: boolean }>()

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
}>()

const el = useTemplateRef<HTMLDivElement>('mapEl')
let map: MlMap | undefined
let pickMarker: Marker | undefined

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

onMounted(async () => {
  await nextTick()
  if (!el.value)
    return
  const maplibregl = (await import('maplibre-gl')).default

  // resolve once, after the golden-spike plugin has calibrated the city center
  const man = getManPoint()
  const centerCamp = getCenterCampPoint()

  map = new maplibregl.Map({
    container: el.value,
    // tile-free style: the playa is featureless, so we draw only the city grid
    style: {
      version: 8,
      glyphs: 'https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf',
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
    map.addLayer({
      id: 'portal-mask',
      type: 'fill',
      source: 'grid',
      filter: ['==', ['get', 'kind'], 'portal-fill'],
      paint: { 'fill-color': '#fbf9f5' },
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
      paint: { 'circle-radius': 4, 'circle-color': '#1c2733', 'circle-stroke-color': '#ffffff', 'circle-stroke-width': 1.5 },
    })
    map.addLayer({
      id: 'landmark-labels',
      type: 'symbol',
      source: 'landmarks',
      layout: { 'text-field': ['get', 'name'], 'text-size': 11, 'text-offset': [0, -1.1], 'text-anchor': 'bottom' },
      paint: { 'text-color': '#1c2733', 'text-halo-color': '#ffffff', 'text-halo-width': 1.6 },
    })
    // porta-potties (approx., from 2025 GIS) — small utility markers under everything
    map.addSource('toilets', { type: 'geojson', data: toiletsGeoJson() })
    map.addLayer({
      id: 'toilets',
      type: 'circle',
      source: 'toilets',
      minzoom: 13,
      paint: { 'circle-radius': 3, 'circle-color': '#3f6212', 'circle-stroke-color': '#ffffff', 'circle-stroke-width': 1 },
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
        'circle-radius': 5,
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
        'text-size': 10,
        'text-offset': [0, 0.9],
        'text-anchor': 'top',
        'text-max-width': 7,
      },
      paint: { 'text-color': '#1c2733', 'text-halo-color': '#ffffff', 'text-halo-width': 1.6 },
    })
    map.on('click', 'civic-dots', (e) => {
      const f = e.features?.[0]
      if (f && map) {
        const note = f.properties?.note ? `<br>${f.properties.note}` : ''
        new maplibregl.Popup()
          .setLngLat((f.geometry as any).coordinates)
          .setHTML(`<b>${f.properties?.name}</b>${note}`)
          .addTo(map)
      }
    })
    // art pins (violet) — drawn under camp pins
    map.addSource('art', { type: 'geojson', data: pinsGeoJson(props.artPins ?? []) })
    map.addLayer({
      id: 'art',
      type: 'circle',
      source: 'art',
      paint: { 'circle-radius': 6, 'circle-color': '#7c3aed', 'circle-stroke-color': '#fff', 'circle-stroke-width': 2 },
    })
    map.addLayer({
      id: 'art-labels',
      type: 'symbol',
      source: 'art',
      layout: { 'text-field': ['get', 'name'], 'text-size': 12, 'text-offset': [0, 1.2], 'text-anchor': 'top' },
      paint: { 'text-color': '#5b21b6', 'text-halo-color': '#fff', 'text-halo-width': 1.6 },
    })
    map.on('click', 'art', (e) => {
      const f = e.features?.[0]
      if (f && map) {
        new maplibregl.Popup()
          .setLngLat((f.geometry as any).coordinates)
          .setHTML(`<b>${f.properties?.name}</b><br>${f.properties?.address ?? ''}`)
          .addTo(map)
      }
    })
    // camp pins
    map.addSource('camps', { type: 'geojson', data: pinsGeoJson(props.camps) })
    map.addLayer({
      id: 'camps',
      type: 'circle',
      source: 'camps',
      paint: { 'circle-radius': 6, 'circle-color': '#d6336c', 'circle-stroke-color': '#fff', 'circle-stroke-width': 2 },
    })
    map.addLayer({
      id: 'camp-labels',
      type: 'symbol',
      source: 'camps',
      layout: { 'text-field': ['get', 'name'], 'text-size': 12, 'text-offset': [0, 1.2], 'text-anchor': 'top' },
      paint: { 'text-color': '#1c2733', 'text-halo-color': '#fff', 'text-halo-width': 1.6 },
    })
    map.on('click', 'camps', (e) => {
      const f = e.features?.[0]
      if (f && map) {
        new maplibregl.Popup()
          .setLngLat((f.geometry as any).coordinates)
          .setHTML(`<b>${f.properties?.name}</b><br>${f.properties?.address ?? ''}`)
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

    applyLayerVisibility()
    applyBasemap()
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

// keep camp pins in sync
watch(() => props.camps, () => {
  const src = map?.getSource('camps') as GeoJSONSource | undefined
  src?.setData(pinsGeoJson(props.camps))
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

// fly to a focused camp (from the list's "view on map")
watch(() => props.focus, (f) => {
  if (f && map)
    map.flyTo({ center: [f.lng, f.lat], zoom: 15, speed: 0.8 })
}, { immediate: true })

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
