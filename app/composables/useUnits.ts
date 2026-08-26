/**
 * Fahrenheit/mph or Celsius/km-h, remembered per browser.
 *
 * One switch for both: nobody wants Celsius alongside miles per hour. The map
 * pill and the Live page read the same preference, so changing it in one place
 * changes it everywhere.
 */
export type UnitSystem = 'imperial' | 'metric'

const STORE = 'brcmap.units.v1'

export function useUnits() {
  const units = useState<UnitSystem>('units', () => 'imperial')

  onMounted(() => {
    try {
      const saved = localStorage.getItem(STORE)
      if (saved === 'metric' || saved === 'imperial')
        units.value = saved
    }
    catch { /* private mode; the default is fine */ }
  })

  watch(units, (v) => {
    try {
      localStorage.setItem(STORE, v)
    }
    catch { /* not worth telling anyone about */ }
  })

  const metric = computed(() => units.value === 'metric')

  /** Temperature, given Fahrenheit. */
  const temp = (f: number | null | undefined): string =>
    f == null ? '—' : `${Math.round(metric.value ? (f - 32) * 5 / 9 : f)}°`
  /** Wind, given mph. */
  const wind = (mph: number | null | undefined): string =>
    mph == null ? '—' : `${Math.round(metric.value ? mph * 1.609344 : mph)}`

  const tempUnit = computed(() => (metric.value ? '°C' : '°F'))
  const windUnit = computed(() => (metric.value ? 'km/h' : 'mph'))

  return { units, metric, temp, wind, tempUnit, windUnit }
}
