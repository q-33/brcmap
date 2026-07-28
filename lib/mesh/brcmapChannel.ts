// The playa mesh channel set we hand out as a QR / share link.
//
// PRIMARY = "Burntastic", the event's own channel, copied verbatim from Burning
// Man's Burntastic firmware (github.com/meshtastic/burntastic, userPrefs.h).
// Position + node-info broadcasts ride the PRIMARY channel, so joining this puts
// our users on the SAME citywide mesh as every Burntastic radio on the playa —
// seen by everyone, and relayed by every one of those nodes.
//
// SECONDARY = "BRC Map", our own community channel for app traffic. Secondary
// channels carry text only, so BRC Map chat stays ours while positions stay
// citywide. (Tight groups can add a private crew channel — see randomPsk().)
//
// Both PSKs are PUBLIC on purpose (shared community channels).
//
// The LoRa radio settings MUST match Burntastic exactly or the radios are
// physically incompatible: modem preset sets the spreading factor, and
// channelNum sets the frequency slot. Burntastic runs SHORT_FAST on slot 15 —
// SHORT_FAST (10.94 kbps vs LONG_FAST's 1.07) is the right call for a dense
// event anyway, since slow presets keep packets on the air longer and congest
// the channel once a mesh passes ~60 nodes.

// Burntastic's published 32-byte AES256 key (CHANNEL_0_PSK_USERPREFS).
export const BURNTASTIC_PSK = new Uint8Array([
  0x38, 0x4B, 0xBC, 0xC0, 0x1D, 0xC0, 0x22, 0xD1, 0x81, 0xBF, 0x36, 0xB8, 0x61, 0x21, 0xE1, 0xFB,
  0x96, 0xB7, 0x2E, 0x55, 0xBF, 0x74, 0x22, 0x7E, 0x9D, 0x6A, 0xFB, 0x48, 0xD6, 0x4C, 0xB1, 0xA1,
])

// Fixed 32-byte AES256 key for our own channel (published intentionally).
export const BRCMAP_PSK = new Uint8Array([
  181, 113, 10, 126, 86, 149, 41, 214, 129, 101, 226, 54, 180, 228, 12, 6,
  246, 113, 21, 194, 111, 159, 106, 91, 103, 11, 230, 5, 60, 154, 40, 214,
])

export const BURNTASTIC_CHANNEL = { name: 'Burntastic', psk: BURNTASTIC_PSK }
export const BRCMAP_CHANNEL = { name: 'BRC Map', psk: BRCMAP_PSK }

// The channel set we publish: order matters — index 0 is PRIMARY.
export const PLAYA_CHANNELS = [BURNTASTIC_CHANNEL, BRCMAP_CHANNEL]

// LoRa config baked into every share URL. Enum values are the raw Meshtastic
// protobuf numbers (so the URL builder needs no SDK at runtime).
export const BRCMAP_LORA = {
  region: 1, // meshtastic Config_LoRaConfig_RegionCode.US
  modemPreset: 6, // meshtastic Config_LoRaConfig_ModemPreset.SHORT_FAST — matches Burntastic
  channelNum: 15, // frequency slot 15 — matches Burntastic (LORACONFIG_CHANNEL_NUM_USERPREFS)
  hopLimit: 3,
  ignoreMqtt: true,
} as const
