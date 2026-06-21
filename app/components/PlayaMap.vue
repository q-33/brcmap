<script setup lang="ts">
import 'maplibre-gl/dist/maplibre-gl.css'
import type { GeoJSONSource, Map as MlMap } from 'maplibre-gl'
import { centerCampPoint, cityGridGeoJson, manPoint } from '~~/lib/brc/cityGeoJson'

// Regular component (NOT .client) rendered inside <ClientOnly> by the parent.
// MapLibre is dynamically imported in onMounted so it never loads during SSR.
// (.client components break template refs / onMounted DOM access in Nuxt.)

interface CampPin { name: string, lat: number, lng: number, address: string }

const props = defineProps<{ camps: CampPin[], artPins?: CampPin[], focus?: { lat: number, lng: number } | null }>()
const emit = defineEmits<{ position: [{ lat: number, lng: number, accuracy?: number }] }>()

const el = useTemplateRef<HTMLDivElement>('mapEl')
let map: MlMap | undefined

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

  map = new maplibregl.Map({
    container: el.value,
    // tile-free style: the playa is featureless, so we draw only the city grid
    style: {
      version: 8,
      glyphs: 'https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf',
      sources: {},
      layers: [{ id: 'bg', type: 'background', paint: { 'background-color': '#f6f2ea' } }],
    },
    // frame on a point between the Man and Center Camp so the city fills the view
    center: [(manPoint[0] + centerCampPoint[0]) / 2, (manPoint[1] + centerCampPoint[1]) / 2],
    zoom: 13.65,
    // Orient like the official BRC plan: 12:00 (the opening) up, 6:00 down.
    // The city's 12:00 axis sits at compass bearing ~40°.
    bearing: 40,
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
      filter: ['==', ['get', 'kind'], 'block'],
      paint: { 'fill-color': '#5aa9d8', 'fill-opacity': 0.62 },
    })
    map.addLayer({
      id: 'blocks-outline',
      type: 'line',
      source: 'grid',
      filter: ['==', ['get', 'kind'], 'block'],
      paint: { 'line-color': '#42627c', 'line-width': 0.5 },
    })
    // light-blue promenade wedges along the major avenues
    map.addLayer({
      id: 'wedges',
      type: 'fill',
      source: 'grid',
      filter: ['==', ['get', 'kind'], 'wedge'],
      paint: { 'fill-color': '#dff0fa', 'fill-opacity': 0.5 },
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
      paint: { 'line-color': '#1c2733', 'line-width': 1.6 },
    })
    // portals: open plaza circles. The fill-mask erases the blocks/grid/avenues
    // underneath so the circles read as clear open plazas (no lines through them).
    map.addLayer({
      id: 'portal-mask',
      type: 'fill',
      source: 'grid',
      filter: ['==', ['get', 'kind'], 'portal-fill'],
      paint: { 'fill-color': '#f6f2ea' },
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
    // 2026 themed street names (upper-left, as on the plan)
    map.addLayer({
      id: 'street-labels',
      type: 'symbol',
      source: 'grid',
      filter: ['==', ['get', 'kind'], 'street-label'],
      minzoom: 12.8,
      layout: {
        'text-field': ['get', 'name'],
        'text-size': 9.5,
        'text-allow-overlap': true,
        'text-ignore-placement': true,
        'text-rotation-alignment': 'map',
        'text-rotate': 295,
        'text-anchor': 'left',
      },
      paint: { 'text-color': '#1c2733', 'text-halo-color': '#f6f2ea', 'text-halo-width': 1.4 },
    })
    // landmarks: the Man + Center Camp
    map.addSource('landmarks', {
      type: 'geojson',
      data: {
        type: 'FeatureCollection',
        features: [
          { type: 'Feature', properties: { name: 'The Man' }, geometry: { type: 'Point', coordinates: manPoint } },
          { type: 'Feature', properties: { name: 'Center Camp' }, geometry: { type: 'Point', coordinates: centerCampPoint } },
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
  })
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
