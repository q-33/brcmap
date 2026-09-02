// Playa live media — the radio streams and the official webcast — in one place.
//
// They lived in two files and drifted: the map's BMIR button pointed at
// bmir-ice.streamguys.com, a host that does not answer at all, while /live
// pointed at the working iHeart stream. Same button, same station, one of them
// silent. A shared constant is the fix.
//
// The bmir-ice name is a trap worth naming: it belongs to Shouting Fire, whose
// founder used to manage BMIR. It looks like the obvious BMIR URL and is not.
export interface RadioStation {
  key: string
  name: string
  dial: string
  stream: string
  blurb: string
  /** only on air during the event */
  eventOnly?: boolean
}

export const BMIR: RadioStation = {
  key: 'bmir',
  name: 'BMIR',
  dial: '94.5 FM',
  // Redirects to a token-signed cloud.revma URL; browsers follow it, which is
  // why a plain HEAD against it looks like a 302 rather than audio.
  stream: 'https://stream.revma.ihrhls.com/zc8378',
  blurb: 'Burning Man Information Radio — the Voice of the Man.',
  eventOnly: true,
}

export const SHOUTING_FIRE: RadioStation = {
  key: 'shouting-fire',
  name: 'Shouting Fire',
  dial: '99.5 FM',
  stream: 'https://shoutingfire-ice.streamguys1.com/live',
  blurb: 'The global burner radio network. On air year round.',
}

export const RADIO_STATIONS: RadioStation[] = [BMIR, SHOUTING_FIRE]

/**
 * The official Burning Man webcast. Video rather than radio, but it answers the
 * same question the streams do — what is happening out there right now — so it
 * lives beside them instead of inline in the page.
 *
 * The ID changes every year. When the next one is announced, this is the only
 * line that needs editing.
 */
export const WEBCAST = {
  key: 'bm-webcast',
  name: '2026 Burning Man Live Webcast from Black Rock City',
  videoId: 'Z8b1Be-HUGU',
  watch: 'https://www.youtube.com/watch?v=Z8b1Be-HUGU',
  // youtube-nocookie serves the same player without setting a tracking cookie
  // until playback actually starts.
  embed: 'https://www.youtube-nocookie.com/embed/Z8b1Be-HUGU?autoplay=1&rel=0',
}
