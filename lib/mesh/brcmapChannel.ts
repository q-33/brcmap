// The public "BRC Map" community mesh — a shared Meshtastic PRIMARY channel so
// anyone can join and see each other on the map + chat off-grid, with no firmware
// fork. Position broadcasts ride the primary channel, so joining this = being on
// the citywide BRC Map mesh. (Tight groups can instead generate a private crew
// channel — see randomPsk() in channelSet.ts.)
//
// The PSK is PUBLIC on purpose (a community channel, like Burntastic's shared key).
// Playa-tuned LoRa defaults: region US, LONG_FAST (range across the 7-mile city),
// MQTT off (no internet on the playa), hop limit 3. channelNum 0 = the frequency
// slot is derived from the channel name+PSK, which puts BRC Map on its own slot,
// off the congested public default.

// Fixed 32-byte AES256 key for the public channel (published intentionally).
export const BRCMAP_PSK = new Uint8Array([
  181, 113, 10, 126, 86, 149, 41, 214, 129, 101, 226, 54, 180, 228, 12, 6,
  246, 113, 21, 194, 111, 159, 106, 91, 103, 11, 230, 5, 60, 154, 40, 214,
])

export const BRCMAP_CHANNEL = { name: 'BRC Map', psk: BRCMAP_PSK }

// LoRa config baked into every BRC Map share URL. Enum values are the raw
// Meshtastic protobuf numbers (so the URL builder needs no SDK at runtime).
export const BRCMAP_LORA = {
  region: 1, // meshtastic Config_LoRaConfig_RegionCode.US
  modemPreset: 0, // meshtastic Config_LoRaConfig_ModemPreset.LONG_FAST
  channelNum: 0, // 0 = derive the frequency slot from the channel (dodges the public default)
  hopLimit: 3,
  ignoreMqtt: true,
} as const
