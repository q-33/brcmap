import { BRCMAP_LORA } from './brcmapChannel'

export interface MeshChannel { name: string, psk: Uint8Array }

// Build a Meshtastic channel-set share URL (https://meshtastic.org/e/#…) for the
// given PRIMARY channel + the BRC Map LoRa preset. Scanning it in the Meshtastic
// app (or applying it to a connected radio) puts a stock device on the mesh.
//
// The ChannelSet protobuf is hand-encoded (wire format below) so this has ZERO
// runtime dependency on the (heavy, browser-fragile) Meshtastic SDK — the field
// numbers are verified byte-for-byte against the SDK encoder in channelSet.test.ts.
//
//   ChannelSet   { settings=1 (msg, repeated), lora_config=2 (msg) }
//   ChannelSettings { psk=2 (bytes), name=3 (string) }
//   LoRaConfig   { use_preset=1, modem_preset=2, region=7, hop_limit=8,
//                  tx_enabled=9, channel_num=11, ignore_mqtt=104 }  (all varint)
export function buildChannelUrl(channel: MeshChannel): string {
  const settings: number[] = []
  bytesField(settings, 2, channel.psk)
  bytesField(settings, 3, new TextEncoder().encode(channel.name))

  const lora: number[] = []
  varintField(lora, 1, 1) // use_preset = true
  varintField(lora, 2, BRCMAP_LORA.modemPreset) // LONG_FAST (0) is the proto default → omitted
  varintField(lora, 7, BRCMAP_LORA.region)
  varintField(lora, 8, BRCMAP_LORA.hopLimit)
  varintField(lora, 9, 1) // tx_enabled = true
  varintField(lora, 11, BRCMAP_LORA.channelNum)
  varintField(lora, 104, BRCMAP_LORA.ignoreMqtt ? 1 : 0)

  const set: number[] = []
  bytesField(set, 1, settings)
  bytesField(set, 2, lora)

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
