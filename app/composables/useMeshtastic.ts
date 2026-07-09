// Meshtastic LoRa-mesh integration — the SINGLE boundary around the Meshtastic
// SDK. Nothing else in the app imports @meshtastic/*; everything goes through the
// plain types + methods below. This keeps the GPL-3.0 SDK isolated (it is
// dynamically imported, so it also stays in a lazy chunk loaded only on connect)
// and lets the rest of the app stay decoupled from protobuf shapes.
//
// Transports: Web Bluetooth + Web Serial (desktop Chrome/Edge, Android Chrome).
// iOS Safari supports neither — that path (HTTP-to-local-node / native wrapper)
// is Phase 2. See tasks/meshtastic-offline-plan.md.

export interface MeshNode {
  num: number
  id?: string
  longName?: string
  shortName?: string
  hwModel?: string
  lat?: number
  lng?: number
  batteryLevel?: number
  snr?: number
  hopsAway?: number
  lastHeard?: number // epoch seconds
  isSelf?: boolean
}

export interface MeshMessage {
  id: number
  from: number
  fromName?: string
  text: string
  at: number // epoch ms
  channel: number
  outbound?: boolean
}

export type MeshTransport = 'ble' | 'serial'
export type MeshStatus = 'disconnected' | 'connecting' | 'configuring' | 'connected'

// One radio connection is shared app-wide. The SDK device + its unsubscribers
// live at module scope (client-only; connect() only runs from a user gesture).
let device: any = null
let unsubs: Array<() => void> = []

export function useMeshtastic() {
  const supported = {
    ble: import.meta.client && 'bluetooth' in navigator,
    serial: import.meta.client && 'serial' in navigator,
  }

  const status = useState<MeshStatus>('mesh-status', () => 'disconnected')
  const error = useState<string | null>('mesh-error', () => null)
  const myNum = useState<number | null>('mesh-mynum', () => null)
  const nodes = useState<Record<number, MeshNode>>('mesh-nodes', () => ({}))
  const messages = useState<MeshMessage[]>('mesh-messages', () => [])

  const connected = computed(() => status.value === 'connected')
  const nodesList = computed(() => Object.values(nodes.value).sort((a, b) => (b.lastHeard ?? 0) - (a.lastHeard ?? 0)))
  // Peers we can actually place on the map (have a fix, aren't us).
  const locatedPeers = computed(() => nodesList.value.filter(n => n.lat != null && n.lng != null))

  function upsert(num: number, patch: Partial<MeshNode>) {
    const prev = nodes.value[num] ?? { num }
    nodes.value = { ...nodes.value, [num]: { ...prev, ...patch } }
  }

  function wire(dev: any) {
    const e = dev.events
    unsubs.push(e.onDeviceStatus.subscribe((s: number) => {
      // DeviceStatusEnum: 5 Connected, 6 Configuring, 7 Configured
      if (s === 7 || s === 5)
        status.value = 'connected'
      else if (s === 6)
        status.value = 'configuring'
    }))
    unsubs.push(e.onMyNodeInfo.subscribe((info: any) => {
      const num = info?.myNodeNum
      if (num != null) {
        myNum.value = num
        upsert(num, { isSelf: true })
      }
    }))
    unsubs.push(e.onNodeInfoPacket.subscribe((n: any) => {
      const num = n?.num
      if (num == null)
        return
      upsert(num, {
        id: n.user?.id,
        longName: n.user?.longName,
        shortName: n.user?.shortName,
        hwModel: n.user?.hwModel != null ? String(n.user.hwModel) : undefined,
        lat: n.position?.latitudeI ? n.position.latitudeI / 1e7 : undefined,
        lng: n.position?.longitudeI ? n.position.longitudeI / 1e7 : undefined,
        batteryLevel: n.deviceMetrics?.batteryLevel,
        snr: n.snr,
        hopsAway: n.hopsAway,
        lastHeard: n.lastHeard,
        isSelf: num === myNum.value || undefined,
      })
    }))
    unsubs.push(e.onUserPacket.subscribe((pkt: any) => {
      const num = pkt?.from
      if (num == null)
        return
      upsert(num, { id: pkt.data?.id, longName: pkt.data?.longName, shortName: pkt.data?.shortName })
    }))
    unsubs.push(e.onPositionPacket.subscribe((pkt: any) => {
      const num = pkt?.from
      const p = pkt?.data
      if (num == null || !p?.latitudeI || !p?.longitudeI)
        return
      upsert(num, { lat: p.latitudeI / 1e7, lng: p.longitudeI / 1e7, lastHeard: Math.floor((pkt.rxTime?.getTime?.() ?? Date.now()) / 1000) })
    }))
    unsubs.push(e.onMessagePacket.subscribe((pkt: any) => {
      messages.value = [...messages.value, {
        id: pkt.id,
        from: pkt.from,
        fromName: nodes.value[pkt.from]?.shortName ?? nodes.value[pkt.from]?.longName,
        text: pkt.data,
        at: pkt.rxTime?.getTime?.() ?? Date.now(),
        channel: pkt.channel ?? 0,
      }]
    }))
  }

  async function connect(kind: MeshTransport) {
    if (status.value !== 'disconnected')
      return
    error.value = null
    status.value = 'connecting'
    try {
      const { MeshDevice } = await import('@meshtastic/core')
      let transport: any
      if (kind === 'ble') {
        const { TransportWebBluetooth } = await import('@meshtastic/transport-web-bluetooth')
        transport = await TransportWebBluetooth.create()
      }
      else {
        const { TransportWebSerial } = await import('@meshtastic/transport-web-serial')
        transport = await TransportWebSerial.create()
      }
      device = new MeshDevice(transport)
      wire(device)
      status.value = 'configuring'
      await device.configure()
      status.value = 'connected'
    }
    catch (e: any) {
      // The chooser being dismissed shows up as an Abort/NotFound DOMException.
      error.value = e?.name === 'NotFoundError' ? null : (e?.message ?? 'Connection failed')
      await disconnect()
    }
  }

  async function disconnect() {
    for (const u of unsubs) {
      try { u() }
      catch {}
    }
    unsubs = []
    try { await device?.disconnect() }
    catch {}
    device = null
    status.value = 'disconnected'
  }

  // Wipe the last-known peers + chat (state; the persistence plugin then clears
  // the saved copy on the next tick).
  function clearMesh() {
    nodes.value = {}
    messages.value = []
  }

  async function sendText(text: string, channel = 0) {
    if (!device || !connected.value || !text.trim())
      return
    const at = Date.now()
    await device.sendText(text, 'broadcast', true, channel)
    messages.value = [...messages.value, { id: at, from: myNum.value ?? 0, fromName: 'You', text, at, channel, outbound: true }]
  }

  return { supported, status, connected, error, myNum, nodes, nodesList, locatedPeers, messages, connect, disconnect, sendText, clearMesh }
}
