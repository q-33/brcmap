export interface MeshChannel { name: string, psk: Uint8Array }

// Build a Meshtastic channel-set share URL (https://meshtastic.org/e/#…) for the
// given channel(s). Scanning it in the Meshtastic app ADDS them to a radio that
// is already flashed with Burning Mesh firmware.
//
// NO lora_config is emitted, deliberately. Burning Mesh firmware locks the event's
// radio settings (region, modem preset, frequency slot) and their docs say not to
// change them; a share URL carrying lora_config would override those on the
// receiving radio and drop it off the mesh. Channels only.
//
// Pass an ARRAY to publish several channels at once: `settings` is a repeated
// field and its ORDER is the channel index, so settings[0] becomes the device's
// PRIMARY channel (the one position/node-info rides) and the rest become
// secondaries (text only).
//
// The ChannelSet protobuf is hand-encoded (wire format below) so this has ZERO
// runtime dependency on the (heavy, browser-fragile) Meshtastic SDK — the field
// numbers are verified byte-for-byte against the SDK encoder in channelSet.test.ts.
//
//   ChannelSet   { settings=1 (msg, repeated), lora_config=2 (msg, NOT SENT) }
//   ChannelSettings { psk=2 (bytes), name=3 (string) }
export function buildChannelUrl(channels: MeshChannel | MeshChannel[]): string {
  const list = Array.isArray(channels) ? channels : [channels]
  const encoded = list.map((channel) => {
    const settings: number[] = []
    bytesField(settings, 2, channel.psk)
    bytesField(settings, 3, new TextEncoder().encode(channel.name))
    return settings
  })

  const set: number[] = []
  for (const settings of encoded) // repeated field: emitted once per channel, in order
    bytesField(set, 1, settings)
  // field 2 (lora_config) is intentionally absent — see the note above

  return `https://meshtastic.org/e/#${base64url(Uint8Array.from(set))}`
}

// A fresh 32-byte AES256 key for a private crew channel.
export function randomPsk(): Uint8Array {
  const psk = new Uint8Array(32)
  crypto.getRandomValues(psk)
  return psk
}

// --- minimal protobuf wire encoding -----------------------------------------
function pushVarint(out: number[], n: number): void {
  while (n > 0x7F) {
    out.push((n & 0x7F) | 0x80)
    n = Math.floor(n / 128)
  }
  out.push(n)
}
function bytesField(out: number[], num: number, bytes: ArrayLike<number>): void {
  pushVarint(out, (num << 3) | 2) // wire type 2 (length-delimited)
  pushVarint(out, bytes.length)
  for (let i = 0; i < bytes.length; i++)
    out.push(bytes[i]!)
}
function varintField(out: number[], num: number, value: number): void {
  if (!value)
    return // proto3 omits default/zero
  pushVarint(out, (num << 3) | 0) // wire type 0 (varint)
  pushVarint(out, value)
}

// URL-safe base64 with no padding, per Meshtastic's channel-URL format.
function base64url(bytes: Uint8Array): string {
  let bin = ''
  for (let i = 0; i < bytes.length; i++)
    bin += String.fromCharCode(bytes[i]!)
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}
