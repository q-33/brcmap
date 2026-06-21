import { calibrateCityCenter, parseLatLng } from '~~/lib/brc/geocode'

// Calibrate the city center for Nitro (server API geocoding, e.g. the locations
// endpoint) from NUXT_PUBLIC_GOLDEN_SPIKE. Runs once at server startup. The Vue
// app render is calibrated by the matching Nuxt plugin.
export default defineNitroPlugin(() => {
  const center = parseLatLng(useRuntimeConfig().public.goldenSpike as string)
  if (center)
    calibrateCityCenter(center)
})
