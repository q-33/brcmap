<script setup lang="ts">
import 'maplibre-gl/dist/maplibre-gl.css'
import type { GeoJSONSource, Map as MlMap } from 'maplibre-gl'
import { centerCampPoint, cityGridGeoJson, manPoint } from '~~/lib/brc/cityGeoJson'

// Regular component (NOT .client) rendered inside <ClientOnly> by the parent.
// MapLibre is dynamically imported in onMounted so it never loads during SSR.
// (.client components break template refs / onMounted DOM access in Nuxt.)

interface CampPin { name: string, lat: number, lng: number, address: string }

const props = defineProps<{ camps: CampPin[], focus?: { lat: number, lng: number } | null }>()
const emit = defineEmits<{ position: [{ lat: number, lng: number }] }>()

const el = useTemplateRef<HTMLDivElement>('mapEl')
let map: MlMap | undefined

function campsGeoJson(): GeoJSON.FeatureCollection {
  return {
    type: 'FeatureCollection',
    features: props.camps.map(c => ({
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
      layers: [{ id: 'bg', type: 'background', paint: { 'background-color': '#d8c9a3' } }],
    },
    center: manPoint,
    zoom: 13.4,
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
    emit('position', { lat: e.coords.latitude, lng: e.coords.longitude })
  })

  map.on('load', () => {
    if (!map)
      return
    map.addSource('grid', { type: 'geojson', data: cityGridGeoJson() })
    // trash fence (city boundary)
    map.addLayer({
      id: 'fence',
      type: 'line',
      source: 'grid',
      filter: ['==', ['get', 'kind'], 'fence'],
      paint: { 'line-color': '#c25617', 'line-width': 1.5, 'line-dasharray': [3, 3], 'line-opacity': 0.7 },
    })
    map.addLayer({
      id: 'streets',
      type: 'line',
      source: 'grid',
      filter: ['==', ['get', 'kind'], 'street'],
      paint: { 'line-color': '#7a6f57', 'line-width': 1.5 },
    })
    map.addLayer({
      id: 'spokes',
      type: 'line',
      source: 'grid',
      filter: ['==', ['get', 'kind'], 'spoke'],
      paint: { 'line-color': '#a89a78', 'line-width': 0.8 },
    })
    // 2026 themed street names along the arcs
    map.addLayer({
      id: 'street-labels',
      type: 'symbol',
      source: 'grid',
      filter: ['==', ['get', 'kind'], 'street-label'],
      minzoom: 12.8,
      layout: {
        'text-field': ['get', 'name'],
        'text-size': 11,
        'text-allow-overlap': false,
      },
      paint: { 'text-color': '#6b3018', 'text-halo-color': '#ece4d2', 'text-halo-width': 1.5 },
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
      paint: { 'circle-radius': 5, 'circle-color': '#b91c1c', 'circle-stroke-color': '#ece4d2', 'circle-stroke-width': 1.5 },
    })
    map.addLayer({
      id: 'landmark-labels',
      type: 'symbol',
      source: 'landmarks',
      layout: { 'text-field': ['get', 'name'], 'text-size': 11, 'text-offset': [0, -1.1], 'text-anchor': 'bottom' },
      paint: { 'text-color': '#6b3018', 'text-halo-color': '#ece4d2', 'text-halo-width': 1.5 },
    })
    // camp pins
    map.addSource('camps', { type: 'geojson', data: campsGeoJson() })
    map.addLayer({
      id: 'camps',
      type: 'circle',
      source: 'camps',
      paint: { 'circle-radius': 6, 'circle-color': '#1d4ed8', 'circle-stroke-color': '#fff', 'circle-stroke-width': 2 },
    })
    map.addLayer({
      id: 'camp-labels',
      type: 'symbol',
      source: 'camps',
      layout: { 'text-field': ['get', 'name'], 'text-size': 12, 'text-offset': [0, 1.2], 'text-anchor': 'top' },
      paint: { 'text-color': '#1e293b', 'text-halo-color': '#fff', 'text-halo-width': 1.5 },
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
  src?.setData(campsGeoJson())
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
