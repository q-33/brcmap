// WMO weather code → label + lucide icon (Open-Meteo uses WMO codes).
const WMO: Record<number, [string, string]> = {
  0: ['Clear', 'i-lucide-sun'],
  1: ['Mainly clear', 'i-lucide-sun'],
  2: ['Partly cloudy', 'i-lucide-cloud-sun'],
  3: ['Overcast', 'i-lucide-cloud'],
  45: ['Fog', 'i-lucide-cloud-fog'],
  48: ['Fog', 'i-lucide-cloud-fog'],
  51: ['Light drizzle', 'i-lucide-cloud-drizzle'],
  53: ['Drizzle', 'i-lucide-cloud-drizzle'],
  55: ['Drizzle', 'i-lucide-cloud-drizzle'],
  61: ['Light rain', 'i-lucide-cloud-rain'],
  63: ['Rain', 'i-lucide-cloud-rain'],
  65: ['Heavy rain', 'i-lucide-cloud-rain-wind'],
  66: ['Freezing rain', 'i-lucide-cloud-rain'],
  67: ['Freezing rain', 'i-lucide-cloud-rain'],
  71: ['Light snow', 'i-lucide-cloud-snow'],
  73: ['Snow', 'i-lucide-cloud-snow'],
  75: ['Heavy snow', 'i-lucide-cloud-snow'],
  77: ['Snow grains', 'i-lucide-cloud-snow'],
  80: ['Rain showers', 'i-lucide-cloud-rain'],
  81: ['Rain showers', 'i-lucide-cloud-rain'],
  82: ['Heavy showers', 'i-lucide-cloud-rain-wind'],
  95: ['Thunderstorm', 'i-lucide-cloud-lightning'],
  96: ['Thunderstorm', 'i-lucide-cloud-lightning'],
  99: ['Thunderstorm', 'i-lucide-cloud-lightning'],
}

export function wmo(code: number): { label: string, icon: string } {
  const [label, icon] = WMO[code] ?? ['—', 'i-lucide-cloud']
  return { label, icon }
}

export function windDir(deg: number): string {
  const dirs = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW']
  return dirs[Math.round(deg / 22.5) % 16]!
}

// Open-Meteo is asked for Fahrenheit and mph (see server/api/weather.get.ts),
// which suits the US crowd and nobody else. Convert for display rather than
// fetching twice: the response is cached for everyone, and Open-Meteo rounds to
// one decimal anyway, so a second request would buy no precision.
export const toCelsius = (f: number): number => (f - 32) * 5 / 9
export const toKmh = (mph: number): number => mph * 1.609344

/** "95°F / 35°C" */
export function tempBoth(f: number): string {
  return `${Math.round(f)}°F / ${Math.round(toCelsius(f))}°C`
}

/** "28 mph / 45 km/h" */
export function windBoth(mph: number): string {
  return `${Math.round(mph)} mph / ${Math.round(toKmh(mph))} km/h`
}

/**
 * Is it raining right now, and how hard — read off the WMO code, which is the
 * one field that answers the question directly. Station sensors report rain
 * ACCUMULATED today, which stays high for hours after the sky clears, so they
 * can't drive an animation that claims to show what is falling this minute.
 *
 * 0 none · 1 drizzle or light rain · 2 steady · 3 heavy, or a thunderstorm.
 *
 * Snow codes deliberately return 0. Snow falls nothing like rain, and animating
 * it as rain would be a confident lie about what is happening outside the tent.
 */
export function rainIntensity(code: number): 0 | 1 | 2 | 3 {
  switch (code) {
    case 51: // light drizzle
    case 53: // moderate drizzle
    case 56: // light freezing drizzle
    case 61: // light rain
    case 80: // slight rain showers
      return 1
    case 55: // dense drizzle
    case 57: // dense freezing drizzle
    case 63: // moderate rain
    case 66: // light freezing rain
    case 81: // moderate rain showers
      return 2
    case 65: // heavy rain
    case 67: // heavy freezing rain
    case 82: // violent rain showers
    case 95: // thunderstorm
    case 96: // thunderstorm with slight hail
    case 99: // thunderstorm with heavy hail
      return 3
    default:
      return 0
  }
}

// Playa-specific dust heuristic from wind gusts (mph). Whiteouts are the real
// hazard on the playa, so this is the most useful read of the forecast.
export function dustRisk(gustMph: number): { label: string, color: string } {
  if (gustMph >= 35)
    return { label: 'High dust risk', color: '#dc2626' }
  if (gustMph >= 25)
    return { label: 'Dusty — goggles up', color: '#d97706' }
  if (gustMph >= 15)
    return { label: 'Breezy', color: '#65a30d' }
  return { label: 'Calm', color: '#16a34a' }
}
