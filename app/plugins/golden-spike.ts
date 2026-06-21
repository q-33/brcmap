import { calibrateCityCenter, parseLatLng } from '~~/lib/brc/geocode'

// Calibrate the city center for the Vue app (SSR render + client) from the
// NUXT_PUBLIC_GOLDEN_SPIKE runtime config. Runs before any page/component, so
// the map and geocoder read the surveyed spike. Server API routes are handled
// separately by the Nitro plugin of the same name.
export default defineNuxtPlugin(() => {
  const center = parseLatLng(useRuntimeConfig().public.goldenSpike as string)
  if (center)
    calibrateCityCenter(center)
})
