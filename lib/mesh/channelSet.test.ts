import { describe, expect, it } from 'vitest'
import { BRCMAP_LORA, BURNTASTIC_CHANNEL, PLAYA_CHANNELS } from './brcmapChannel'
import { buildChannelUrl, randomPsk } from './channelSet'

describe('buildChannelUrl', () => {
  // The hand-rolled encoder must exactly match the real Meshtastic protobuf
  // encoder — this is what makes it safe to ship without the SDK at runtime.
  it('matches the Meshtastic SDK encoder byte-for-byte', async () => {
    const data = buildChannelUrl(PLAYA_CHANNELS).split('#')[1]!

    const { create, toBinary } = await import('@bufbuild/protobuf')
    const { Protobuf } = await import('@meshtastic/core')
    const ref = create(Protobuf.AppOnly.ChannelSetSchema, {
      settings: PLAYA_CHANNELS.map(c => create(Protobuf.Channel.ChannelSettingsSchema, { name: c.name, psk: c.psk })),
      loraConfig: create(Protobuf.Config.Config_LoRaConfigSchema, {
        usePreset: true,
        modemPreset: BRCMAP_LORA.modemPreset,
        region: BRCMAP_LORA.region,
        hopLimit: BRCMAP_LORA.hopLimit,
        txEnabled: true,
        channelNum: BRCMAP_LORA.channelNum,
        ignoreMqtt: BRCMAP_LORA.ignoreMqtt,
      }),
    })
    const refB64 = Buffer.from(toBinary(Protobuf.AppOnly.ChannelSetSchema, ref)).toString('base64')
      .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
    expect(data).toBe(refB64)
  })

  const decode = async (url: string) => {
    const data = url.split('#')[1]!
    const { fromBinary } = await import('@bufbuild/protobuf')
    const { Protobuf } = await import('@meshtastic/core')
    const pad = data + '='.repeat((4 - (data.length % 4)) % 4)
    const bytes = Uint8Array.from(atob(pad.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0))
    return fromBinary(Protobuf.AppOnly.ChannelSetSchema, bytes)
  }

  it('puts Burntastic first (PRIMARY) with BRC Map secondary, on Burntastic radio settings', async () => {
    const url = buildChannelUrl(PLAYA_CHANNELS)
    expect(url.startsWith('https://meshtastic.org/e/#')).toBe(true)
    const cs = await decode(url)

    // index 0 is the device's primary channel — position/node-info ride it
    expect(cs.settings[0]!.name).toBe('Burntastic')
    expect(cs.settings[1]!.name).toBe('BRC Map')
    expect(cs.settings.every(s => s.psk.length === 32)).toBe(true)
    // must match Burntastic's firmware or the radios can't hear each other
    expect(cs.loraConfig?.modemPreset).toBe(6) // SHORT_FAST
    expect(cs.loraConfig?.channelNum).toBe(15)
    expect(cs.loraConfig?.region).toBe(1) // US
    expect(cs.loraConfig?.hopLimit).toBe(3)
    expect(cs.loraConfig?.ignoreMqtt).toBe(true)
  })

  it('appends a crew channel after the shared ones, keeping Burntastic primary', async () => {
    const crew = { name: 'Crew', psk: randomPsk() }
    const cs = await decode(buildChannelUrl([...PLAYA_CHANNELS, crew]))
    expect(cs.settings.map(s => s.name)).toEqual(['Burntastic', 'BRC Map', 'Crew'])
  })

  it('still accepts a single channel, and gives distinct URLs for distinct PSKs', () => {
    expect(buildChannelUrl(BURNTASTIC_CHANNEL)).toContain('meshtastic.org/e/#')
    expect(buildChannelUrl({ name: 'Crew', psk: randomPsk() })).not.toBe(buildChannelUrl({ name: 'Crew', psk: randomPsk() }))
  })
})
