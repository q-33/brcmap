import { describe, expect, it } from 'vitest'
import { BRCMAP_CHANNEL, PLAYA_CHANNELS } from './brcmapChannel'
import { buildChannelUrl, randomPsk } from './channelSet'

describe('buildChannelUrl', () => {
  const decode = async (url: string) => {
    const data = url.split('#')[1]!
    const { fromBinary } = await import('@bufbuild/protobuf')
    const { Protobuf } = await import('@meshtastic/core')
    const pad = data + '='.repeat((4 - (data.length % 4)) % 4)
    const bytes = Uint8Array.from(atob(pad.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0))
    return fromBinary(Protobuf.AppOnly.ChannelSetSchema, bytes)
  }

  // The hand-rolled encoder must exactly match the real Meshtastic protobuf
  // encoder — this is what makes it safe to ship without the SDK at runtime.
  it('matches the Meshtastic SDK encoder byte-for-byte', async () => {
    const data = buildChannelUrl(PLAYA_CHANNELS).split('#')[1]!

    const { create, toBinary } = await import('@bufbuild/protobuf')
    const { Protobuf } = await import('@meshtastic/core')
    const ref = create(Protobuf.AppOnly.ChannelSetSchema, {
      settings: PLAYA_CHANNELS.map(c => create(Protobuf.Channel.ChannelSettingsSchema, { name: c.name, psk: c.psk })),
      // no loraConfig — see the encoder's note
    })
    const refB64 = Buffer.from(toBinary(Protobuf.AppOnly.ChannelSetSchema, ref)).toString('base64')
      .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
    expect(data).toBe(refB64)
  })

  // THE important test. Burning Mesh firmware locks the event's radio settings and
  // their docs say not to change them. A share URL carrying lora_config overrides
  // those on the receiving radio and silently drops it off the mesh — which is
  // exactly what we shipped through 2025 (SHORT_FAST on slot 15, from a Burntastic
  // build last touched in August 2024, while the 2026 event runs Short Turbo on
  // slot 33). Never emit radio settings from here again.
  it('never sends LoRa radio settings', async () => {
    for (const url of [
      buildChannelUrl(PLAYA_CHANNELS),
      buildChannelUrl(BRCMAP_CHANNEL),
      buildChannelUrl([BRCMAP_CHANNEL, { name: 'Crew', psk: randomPsk() }]),
    ]) {
      const cs = await decode(url)
      expect(cs.loraConfig).toBeUndefined()
    }
  })

  it('publishes BRC Map alone, to be ADDED as a secondary', async () => {
    const url = buildChannelUrl(PLAYA_CHANNELS)
    expect(url.startsWith('https://meshtastic.org/e/#')).toBe(true)
    const cs = await decode(url)
    // One channel only. The radio's own "Everyone" stays channel 0, which is what
    // carries NodeInfo and the public keys that direct messages depend on.
    expect(cs.settings.map(s => s.name)).toEqual(['BRC Map'])
    expect(cs.settings.every(s => s.psk.length === 32)).toBe(true)
  })

  it('never republishes the retired Burntastic channel', async () => {
    const cs = await decode(buildChannelUrl(PLAYA_CHANNELS))
    expect(cs.settings.some(s => s.name === 'Burntastic')).toBe(false)
  })

  it('appends a crew channel after BRC Map', async () => {
    const crew = { name: 'Crew', psk: randomPsk() }
    const cs = await decode(buildChannelUrl([...PLAYA_CHANNELS, crew]))
    expect(cs.settings.map(s => s.name)).toEqual(['BRC Map', 'Crew'])
  })

  it('still accepts a single channel, and gives distinct URLs for distinct PSKs', () => {
    expect(buildChannelUrl(BRCMAP_CHANNEL)).toContain('meshtastic.org/e/#')
    expect(buildChannelUrl({ name: 'Crew', psk: randomPsk() })).not.toBe(buildChannelUrl({ name: 'Crew', psk: randomPsk() }))
  })
})
