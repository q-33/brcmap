// The BRC Map channel we hand out as a QR / share link.
//
// 2026 CHANGED HOW THIS WORKS. Burning Mesh (burningmesh.org) now ships its own
// firmware, and it bakes in the event's radio settings and a primary channel
// called "Everyone". Their docs are explicit: "Burning Mesh firmware locks in the
// event's radio configuration. Do not change the Frequency Slot, Modem Preset, or
// other frequency settings."
//
// So we publish ONE channel and NO LoRa config. Scanning our link ADDS "BRC Map"
// as a secondary channel and leaves the radio's event settings and its "Everyone"
// primary untouched. Sending LoRa config here would knock a correctly-flashed
// radio off the mesh, which is exactly what the 2025 version of this file did.
//
// Positions: the current firmware sends automatic position broadcasts to the
// LOWEST-numbered channel with position sharing enabled. The setup we document is
// sharing OFF for Everyone (channel 0) and ON for BRC Map (channel 1), so our app
// sees peers while citywide chat and DMs still work through Everyone.
//
// Direct messages need a shared channel 0 — NodeInfo and public keys are exchanged
// there — which is another reason we never replace it.
//
// The PSK below is PUBLIC on purpose: it is a shared community channel.
//
// HISTORY: through 2025 we published Burntastic (github.com/meshtastic/burntastic)
// as primary, on SHORT_FAST / slot 15, copied from its userPrefs.h. That repo has
// not been touched since August 2024 and its settings no longer match the event.
// For 2026 Burning Mesh uses Short Turbo on slot 33. Do not resurrect those
// constants; if the event's radio settings are ever needed again, read them from
// docs.burningmesh.org, not from that repo.

// Fixed 32-byte AES256 key for our own channel (published intentionally).
export const BRCMAP_PSK = new Uint8Array([
  181, 113, 10, 126, 86, 149, 41, 214, 129, 101, 226, 54, 180, 228, 12, 6,
  246, 113, 21, 194, 111, 159, 106, 91, 103, 11, 230, 5, 60, 154, 40, 214,
])

export const BRCMAP_CHANNEL = { name: 'BRC Map', psk: BRCMAP_PSK }

/**
 * What our QR publishes: BRC Map alone, to be ADDED as a secondary.
 *
 * Never send this as a "Replace" — that would wipe the Everyone channel the
 * firmware installed, and with it the ability to DM anyone at the event.
 */
export const PLAYA_CHANNELS = [BRCMAP_CHANNEL]
