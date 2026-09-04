import type { RadioStation } from '~~/lib/radio'
import { RADIO_STATIONS } from '~~/lib/radio'

// One radio for the whole app.
//
// The player used to be an <audio> element owned by whichever page you happened
// to be on: the map built its own, /live had two more. Navigating unmounted the
// element mid-song, so walking from the map to the camp list cut the music. This
// moves the element OUT of the component tree entirely — it is a module-level
// object, created once on first play and never torn down — so navigation cannot
// touch it. The pills and cards are now just controls pointed at it.
//
// State lives in useState so every control on every page reflects the same
// player: press stop on the floating bar and the map's pill goes quiet too.
//
// Nothing is fetched until someone presses play, same rule the rest of the app
// follows on playa data. The element does not exist before that.

let el: HTMLAudioElement | null = null

export interface RadioState {
  /** key of the station currently loaded, or null */
  key: string | null
  playing: boolean
  loading: boolean
  /** set when a stream opened but never produced audio — i.e. off air */
  error: string | null
}

export function useRadio() {
  const state = useState<RadioState>('radio', () => ({
    key: null,
    playing: false,
    loading: false,
    error: null,
  }))

  const station = computed<RadioStation | null>(() =>
    RADIO_STATIONS.find(s => s.key === state.value.key) ?? null)

  function ensureEl(): HTMLAudioElement {
    if (el)
      return el
    el = new Audio()
    el.preload = 'none'
    el.addEventListener('playing', () => {
      state.value.playing = true
      state.value.loading = false
      state.value.error = null
    })
    el.addEventListener('pause', () => {
      state.value.playing = false
    })
    // A playa station that is not broadcasting does not 404 — the mount answers
    // with nothing, or with a 503 body that is not audio. Either way the element
    // errors or simply stalls, and the honest thing to tell someone is that the
    // station is off air rather than leaving a spinner going forever.
    const offAir = () => {
      state.value.playing = false
      state.value.loading = false
      const s = RADIO_STATIONS.find(x => x.key === state.value.key)
      state.value.error = s?.eventOnly
        ? `${s.name} isn't broadcasting right now.`
        : 'That stream is not responding.'
    }
    el.addEventListener('error', offAir)
    el.addEventListener('stalled', offAir)
    el.addEventListener('ended', offAir)
    return el
  }

  function stop() {
    el?.pause()
    // Drop the connection rather than holding an open socket to a stream nobody
    // is listening to — this runs on hotspots and phone batteries.
    if (el)
      el.removeAttribute('src')
    state.value.playing = false
    state.value.loading = false
    state.value.key = null
    state.value.error = null
  }

  async function play(s: RadioStation) {
    const audio = ensureEl()
    if (state.value.key !== s.key) {
      audio.src = s.stream
      state.value.key = s.key
    }
    state.value.loading = true
    state.value.error = null
    try {
      await audio.play()
    }
    catch {
      // Autoplay refusal, or a stream that will not open at all.
      state.value.loading = false
      state.value.playing = false
      state.value.error = s.eventOnly
        ? `${s.name} isn't broadcasting right now.`
        : 'Could not start that stream.'
    }
  }

  function toggle(s: RadioStation) {
    if (state.value.key === s.key && (state.value.playing || state.value.loading))
      stop()
    else
      play(s)
  }

  /** Is this specific station the one currently playing or opening? */
  const isActive = (s: RadioStation) => state.value.key === s.key
  const isPlaying = (s: RadioStation) => isActive(s) && state.value.playing
  const isLoading = (s: RadioStation) => isActive(s) && state.value.loading

  return { state, station, play, stop, toggle, isActive, isPlaying, isLoading }
}
