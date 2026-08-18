<script setup lang="ts">
import { CITY_YEAR, STREET_NAMES, goldenSpikeKnown } from '~~/lib/brc/geocode'

useHead({ title: 'City Guide — BRC Map' })

// Resolved at setup; the golden-spike plugin calibrates before page render.
const spikeKnown = goldenSpikeKnown()

const streets = Object.entries(STREET_NAMES).filter(([k]) => k !== 'Esplanade')

// Landmarks on the clock face.
const landmarks = [
  { icon: 'i-lucide-flame', name: 'The Man', detail: 'Dead center of the city — the midpoint of the 6:00–12:00 axis. Every address is measured from here.' },
  { icon: 'i-lucide-coffee', name: 'Center Camp', detail: 'At 6:00, toward the entrance. The Café is the city’s social heart.' },
  { icon: 'i-lucide-church', name: 'The Temple', detail: 'On the 12:00 axis, north of the Man in the deep playa. Built to be burned on Sunday.' },
  { icon: 'i-lucide-circle-dashed', name: 'The Esplanade', detail: 'The innermost ring street — the grand promenade facing the open playa.' },
  { icon: 'i-lucide-pentagon', name: 'The Trash Fence', detail: 'A ~9-mile pentagon enclosing the whole event. Everything inside is Leave No Trace.' },
  { icon: 'i-lucide-mountain', name: 'Deep Playa', detail: 'The open desert past the Man toward 12:00, where the wandering art lives.' },
]

// Burning Man Project properties people conflate — disambiguated.
const properties = [
  { name: 'Fly Ranch', tag: '~3,800 acres', detail: 'Bought by the Burning Man Project in 2016 for $6.5M, 21 miles north of Gerlach. Home of the (accidental, geothermal) Fly Geyser, regenerative-design projects (LAGI), and guided nature walks. Not the event site.', href: 'https://flyranch.burningman.org/' },
  { name: 'The Ranch (Black Rock Station)', tag: 'DPW base', detail: 'The year-round storage and production facility north of Gerlach — where the Man is built and the Department of Public Works is based. This is what burners usually mean by “the Ranch.”' },
  { name: 'The 360', tag: 'makers ranch', detail: 'A separate ~360-acre, off-grid property at the desert’s edge — workshop and storage space for theme camps, art projects, and mutant vehicles.' },
]
</script>

<template>
  <UContainer class="max-w-3xl py-12 sm:py-16">
    <div class="mb-10">
      <UBadge color="primary" variant="subtle" class="mb-4">Black Rock City {{ CITY_YEAR }} · “Axis Mundi”</UBadge>
      <h1 class="font-display text-4xl font-bold uppercase tracking-tight sm:text-5xl">City Guide</h1>
      <p class="mt-4 text-lg text-(--ui-text-muted)">
        How Black Rock City is built, how to read its streets, and what all the names mean —
        so the map makes sense before you ever hit the playa.
      </p>
    </div>

    <!-- Meshtastic -->
    <section class="mt-12">
      <h2 class="font-display text-xl font-semibold text-primary">Meshtastic — find your people off-grid</h2>
      <div class="mt-3 space-y-4 text-(--ui-text-toned) leading-relaxed">
        <p>
          There's no cell service on the playa. <strong class="text-(--ui-text)">Meshtastic</strong> is an
          open-source, off-grid radio network: inexpensive <strong class="text-(--ui-text)">LoRa</strong>
          devices form a self-healing mesh that relays text messages and GPS positions for miles — no
          internet, no towers. BRC Map talks to your radio directly, so you can see
          <strong class="text-(--ui-text)">your people live on the map</strong> and
          <strong class="text-(--ui-text)">chat</strong> with them when nothing else works.
        </p>
      </div>

      <UCard class="mt-4" variant="subtle">
        <div class="flex items-start gap-3">
          <UIcon name="i-lucide-triangle-alert" class="mt-0.5 size-5 shrink-0 text-amber-500" />
          <p class="text-sm text-(--ui-text-muted)">
            <strong class="text-(--ui-text)">New for 2026: you must flash the Burning Mesh firmware.</strong>
            The event mesh changed its radio settings this year. Firmware from previous years
            <strong class="text-(--ui-text)">will not connect</strong>, even if your radio worked last time.
            If you set up your radio using our old instructions, redo step 1 below.
          </p>
        </div>
      </UCard>

      <h3 class="mt-6 font-semibold text-(--ui-text)">What you need</h3>
      <ul class="mt-2 list-disc space-y-2 pl-5 text-(--ui-text-toned) leading-relaxed">
        <li>
          A <strong class="text-(--ui-text)">Meshtastic radio</strong> — e.g. a SenseCAP T1000-E, Heltec
          LoRa32 V3, LILYGO T-Beam, or T-Deck. Models with onboard
          <strong class="text-(--ui-text)">GPS</strong> put you on the map automatically.
        </li>
        <li>
          A <strong class="text-(--ui-text)">USB data cable</strong> (charge-only cables won't work) and a
          computer running <strong class="text-(--ui-text)">Chrome or Firefox</strong>, to flash the firmware.
        </li>
        <li>
          The official <strong class="text-(--ui-text)">Meshtastic</strong> app for iOS or Android.
        </li>
      </ul>

      <h3 class="mt-6 font-semibold text-(--ui-text)">1. Flash the Burning Mesh 2026 firmware</h3>
      <p class="mt-2 text-(--ui-text-toned) leading-relaxed">
        <a href="https://burningmesh.org" target="_blank" rel="noopener noreferrer" class="text-primary underline">Burning Mesh</a>
        runs the citywide mesh at Burning Man, and ships its own firmware with the event's radio settings
        and a public <strong class="text-(--ui-text)">Everyone</strong> channel already built in. Flashing it
        is what puts you on the same network as everyone else on playa.
      </p>
      <ol class="mt-3 list-decimal space-y-3 pl-5 text-(--ui-text-toned) leading-relaxed">
        <li>Connect the radio to your computer with a USB data cable.</li>
        <li>
          Open <a href="https://burn.meshtastic.org" target="_blank" rel="noopener noreferrer" class="text-primary underline">burn.meshtastic.org</a>
          in Chrome or Firefox.
        </li>
        <li>Select your device and the current <strong class="text-(--ui-text)">Burning Mesh 2.8.x</strong> firmware, then Flash.</li>
        <li>
          If the radio isn't detected, check the cable carries data, then put the radio into
          bootloader / DFU mode.
        </li>
        <li>
          <strong class="text-(--ui-text)">Factory reset after flashing</strong> if you upgraded from an older
          version, installed a UF2 on an nRF52 device, or the radio hasn't been updated in about a year.
          This activates Burning Man mode and clears stale settings.
        </li>
      </ol>
      <UCard class="mt-4" variant="subtle">
        <div class="flex items-start gap-3">
          <UIcon name="i-lucide-globe" class="mt-0.5 size-5 shrink-0 text-amber-500" />
          <p class="text-sm text-(--ui-text-muted)">
            <strong class="text-(--ui-text)">United States only.</strong> This firmware uses frequencies that
            are legal in the US and may not be legal elsewhere. Don't flash it — or power on a radio running
            it — outside the United States.
          </p>
        </div>
      </UCard>

      <h3 class="mt-6 font-semibold text-(--ui-text)">2. Connect and name your radio</h3>
      <ol class="mt-2 list-decimal space-y-3 pl-5 text-(--ui-text-toned) leading-relaxed">
        <li>
          Open the Meshtastic app and connect to the radio over Bluetooth. On the T1000-E and most radios
          without a screen the default PIN is
          <code class="rounded bg-(--ui-bg-muted) px-1 py-0.5 text-sm">123456</code>.
        </li>
        <li>
          Under <strong class="text-(--ui-text)">Settings → LoRa</strong>, check the firmware set:
          region <strong class="text-(--ui-text)">United States</strong>, preset
          <strong class="text-(--ui-text)">Short Turbo</strong>, frequency slot
          <strong class="text-(--ui-text)">33</strong>.
          <strong class="text-(--ui-text)">Don't change these</strong> — the firmware locks in the event's
          radio configuration, and altering the preset or frequency slot takes you off the mesh.
        </li>
        <li>
          Under <strong class="text-(--ui-text)">Settings → User</strong>, set a long name and a short name
          (up to four characters) so people recognise you, and save.
        </li>
        <li>
          Confirm <strong class="text-(--ui-text)">Everyone</strong> is channel 0 and leave it there. It's
          public — anyone at the event can read it — but it's also what carries the node info and keys that
          direct messages depend on. Remove it and you can't DM anyone.
        </li>
      </ol>

      <h3 class="mt-6 font-semibold text-(--ui-text)">3. Add the BRC Map channel</h3>
      <p class="mt-2 text-(--ui-text-toned) leading-relaxed">
        <strong class="text-(--ui-text)">Connect the app to your radio first</strong> — a channel QR is
        written straight to the connected device, and with nothing connected Meshtastic answers
        “Connection failed. Not connected to any device.”
        Then scan our QR below to add <strong class="text-(--ui-text)">BRC Map</strong> as channel 1,
        alongside Everyone. Choose <strong class="text-(--ui-text)">Add</strong>, never
        <strong class="text-(--ui-text)">Replace</strong> — Replace would wipe the Everyone channel your
        firmware just installed. Our code carries no radio settings, so it can't disturb what the firmware set.
      </p>

      <h3 class="mt-6 font-semibold text-(--ui-text)">4. Turn on position sharing</h3>
      <p class="mt-2 text-(--ui-text-toned) leading-relaxed">
        The firmware sends automatic position broadcasts to the
        <strong class="text-(--ui-text)">lowest-numbered channel that has position sharing enabled</strong>.
        So leave it <strong class="text-(--ui-text)">off</strong> for Everyone on channel 0 and turn it
        <strong class="text-(--ui-text)">on</strong> for BRC Map on channel 1 — your dot then rides our
        channel and shows up on the map for everyone else who has it.
      </p>
      <ul class="mt-2 list-disc space-y-2 pl-5 text-(--ui-text-toned) leading-relaxed">
        <li>
          On iOS, open the BRC Map channel and enable
          <strong class="text-(--ui-text)">Allow Position Requests</strong>, then pick
          <strong class="text-(--ui-text)">Precise</strong> or
          <strong class="text-(--ui-text)">Approximate</strong> location. A green arrow marks the channel
          receiving automatic broadcasts.
        </li>
        <li>
          If your radio has no GPS of its own, let the phone supply it — on iOS enable
          <strong class="text-(--ui-text)">Share Location</strong> (and Always Allow for background
          updates); on Android set Meshtastic's location permission to
          <strong class="text-(--ui-text)">Allow all the time</strong> and enable
          <strong class="text-(--ui-text)">Provide phone location to mesh</strong>.
        </li>
        <li>
          Anyone holding a channel's key can see the positions shared on it. Share channel links and QR
          codes only with people you trust.
        </li>
      </ul>

      <h3 class="mt-6 font-semibold text-(--ui-text)">5. Connect it to BRC Map</h3>
      <ol class="mt-2 list-decimal space-y-3 pl-5 text-(--ui-text-toned) leading-relaxed">
        <li>
          Open the map, tap the <strong class="text-(--ui-text)">Mesh</strong> button (bottom-left), and
          choose <strong class="text-(--ui-text)">Connect via Bluetooth</strong> or
          <strong class="text-(--ui-text)">USB</strong>.
        </li>
        <li>
          Radios show in the <strong class="text-(--ui-text)">People</strong> list and — once they have a fix —
          as <span class="font-medium text-emerald-600 dark:text-emerald-400">green dots</span> on the map
          (you're <span class="font-medium text-amber-600 dark:text-amber-400">amber</span>). Type in
          <strong class="text-(--ui-text)">Mesh chat</strong> to message the mesh. It all keeps working with
          no internet, and your people stay on the map even after you reload.
        </li>
      </ol>

      <UCard class="mt-4" variant="subtle">
        <div class="flex items-start gap-3">
          <UIcon name="i-lucide-smartphone" class="mt-0.5 size-5 shrink-0 text-primary" />
          <p class="text-sm text-(--ui-text-muted)">
            <strong class="text-(--ui-text)">On an iPhone?</strong> Apple doesn't let web apps reach a radio
            over Bluetooth or USB, so pair your radio in the official
            <strong class="text-(--ui-text)">Meshtastic</strong> app instead — BRC Map's radio connection is
            for Chrome/Edge on desktop and Android. And bring power: GPS + Bluetooth drain a radio fast over a
            week, so pack a battery bank or a small solar panel.
          </p>
        </div>
      </UCard>

      <UCard class="mt-4" variant="subtle">
        <div class="flex items-start gap-3">
          <UIcon name="i-lucide-book-open" class="mt-0.5 size-5 shrink-0 text-primary" />
          <p class="text-sm text-(--ui-text-muted)">
            Burning Mesh runs the network, not us — their
            <a href="https://docs.burningmesh.org/en/guides/quick_start" target="_blank" rel="noopener noreferrer" class="text-primary underline">quick start</a>
            and
            <a href="https://docs.burningmesh.org/en/guides/camp_channels_and_locations" target="_blank" rel="noopener noreferrer" class="text-primary underline">camp channels guide</a>
            are the authority on firmware and radio settings, including video walkthroughs and how to set up
            a private channel for your camp. They also run a
            <a href="https://discord.gg/ZSVADp77Sn" target="_blank" rel="noopener noreferrer" class="text-primary underline">Discord</a>.
          </p>
        </div>
      </UCard>

      <h3 class="mt-8 font-semibold text-(--ui-text)">Join the BRC Map mesh</h3>
      <p class="mt-2 text-(--ui-text-toned) leading-relaxed">
        Scan this to add the shared <strong class="text-(--ui-text)">BRC Map</strong> channel to a radio
        already running the Burning Mesh firmware — or spin up a private channel just for your crew.
        Choose <strong class="text-(--ui-text)">Add</strong>, not Replace. Everyone on the same channel
        shows up on each other's map.
      </p>
      <div class="mt-4 rounded-2xl border border-(--ui-border) p-4 sm:p-5">
        <ClientOnly>
          <MeshSetup />
          <template #fallback>
            <p class="py-8 text-center text-sm text-(--ui-text-muted)">Loading channel setup…</p>
          </template>
        </ClientOnly>
      </div>
    </section>

    <!-- Layout -->
    <section class="mt-12">
      <h2 class="font-display text-xl font-semibold text-primary">A city shaped like a clock</h2>
      <div class="mt-3 space-y-4 text-(--ui-text-toned) leading-relaxed">
        <p>
          Black Rock City is laid out as a giant clock face on the open desert, a plan first drawn by
          Rod Garrett in 1999. The <strong class="text-(--ui-text)">Man</strong> stands at the center.
          <strong class="text-(--ui-text)">Radial avenues</strong> run outward like clock hands, named for
          clock positions — 2:00, 7:30, 9:45. Crossing them are <strong class="text-(--ui-text)">concentric
          ring streets</strong>, lettered from the Esplanade out to K.
        </p>
        <p>
          The city occupies roughly the <strong class="text-(--ui-text)">2:00 to 10:00</strong> arc — about
          two-thirds of a circle — opening toward the deep playa. An address is simply where a time street
          meets a letter street: <strong class="text-(--ui-text)">“7:30 &amp; E”</strong> is where the 7:30
          radial crosses E. That’s exactly how BRC Map turns an address into a pin.
        </p>
      </div>

      <div class="mt-6 grid gap-3 sm:grid-cols-2">
        <div v-for="l in landmarks" :key="l.name" class="flex gap-3 rounded-lg border border-(--ui-border) p-3">
          <UIcon :name="l.icon" class="mt-0.5 size-5 shrink-0 text-primary" />
          <div>
            <p class="font-semibold">{{ l.name }}</p>
            <p class="text-sm text-(--ui-text-muted)">{{ l.detail }}</p>
          </div>
        </div>
      </div>
    </section>

    <!-- Rod's Ring Road -->
    <section class="mt-12">
      <h2 class="font-display text-xl font-semibold text-primary">Rod's Ring Road</h2>
      <div class="mt-3 space-y-4 text-(--ui-text-toned) leading-relaxed">
        <p>
          The road that circles Center Camp at 6:00 is <strong class="text-(--ui-text)">Rod's Ring
          Road</strong>, named for <strong class="text-(--ui-text)">Rod Garrett (1936–2011)</strong>,
          Black Rock City's site architect. Garrett attended his first burn in 1995 and became the
          city's chief designer in 1997.
        </p>
        <p>
          He's the hand behind almost everything the city's shape rests on: the radial clockwork plan,
          the Esplanade and the 2:00–10:00 arc, the great tensometric Center Camp Café canopy, and the
          Man bases from 2001 to 2011. The ring road around Center Camp carries his name.
        </p>
        <p>
          Garrett died in August 2011; as the Man burned that year, a box holding his ashes sat beside
          it. The geometry you navigate today — and this map — is still his.
        </p>
      </div>
    </section>

    <!-- Street names -->
    <section class="mt-12">
      <h2 class="font-display text-xl font-semibold text-primary">{{ CITY_YEAR }} streets</h2>
      <p class="mt-2 text-(--ui-text-toned) leading-relaxed">
        The letters stay the same year to year, but each year’s theme renames them. For 2026’s
        <em>Axis Mundi</em> — the cross-cultural idea of a “center of the world” — the ring streets carry
        these names. Addresses still use the letter; the map shows the name.
      </p>
      <div class="mt-4 flex flex-wrap gap-1.5">
        <UBadge v-for="[letter, name] in streets" :key="letter" color="neutral" variant="subtle">
          {{ letter }} · {{ name }}
        </UBadge>
      </div>
    </section>

    <!-- Golden Spike -->
    <section class="mt-12">
      <h2 class="font-display text-xl font-semibold text-primary">The Golden Spike</h2>
      <div class="mt-3 space-y-4 text-(--ui-text-toned) leading-relaxed">
        <p>
          Every year the city is born from a single point. Weeks before the event, the
          <strong class="text-(--ui-text)">Department of Public Works</strong> drives a
          <strong class="text-(--ui-text)">“golden spike”</strong> into the empty playa in a ceremony where
          founders and crew take turns on the sledgehammer. It marks the exact center of the city — the spot
          directly beneath the Man’s feet — and serves as the survey origin for everything else.
        </p>
        <p>
          From that one coordinate the survey crew lays ~80,000 points: the streets, the plazas, the fence.
          A point becomes a line to the Temple, then an arc, then the full clockwork.
        </p>
      </div>
      <UCard class="mt-4" variant="subtle">
        <div class="flex items-start gap-3">
          <UIcon name="i-lucide-target" class="mt-0.5 size-5 shrink-0 text-primary" />
          <p class="text-sm text-(--ui-text-muted)">
            BRC Map is built the same way: every address is computed from that single center point.
            <template v-if="spikeKnown">
              The 2026 golden spike has been set, so the map is snapped to this year’s real survey.
            </template>
            <template v-else>
              The 2026 spike hasn’t been surveyed yet, so the map uses a best-known estimate. The moment
              Burning Man publishes the real coordinate, <strong class="text-(--ui-text)">the whole city
              snaps to it</strong> — no other changes needed.
            </template>
          </p>
        </div>
      </UCard>
    </section>

    <!-- Gate Road -->
    <section class="mt-12">
      <h2 class="font-display text-xl font-semibold text-primary">Getting in: Gate Road</h2>
      <div class="mt-3 space-y-4 text-(--ui-text-toned) leading-relaxed">
        <p>
          The only way to drive into Black Rock City is <strong class="text-(--ui-text)">Gate Road</strong>.
          From Gerlach you head out Highway 447, fork onto County Road 34, and reach the “8-Mile” entrance
          that opens onto Gate Road. (The 3-Mile and 12-Mile playa entrances don’t lead to the event.)
        </p>
        <p>
          Inbound you pass, in order: the <strong class="text-(--ui-text)">Box Office / Will Call</strong> just
          outside the gate, then <strong class="text-(--ui-text)">the Gate</strong> itself (tickets scanned,
          vehicle searched), then the <strong class="text-(--ui-text)">Greeters</strong> a couple miles on,
          who hand you a printed city map, the Leave-No-Trace rundown, and — if you’re lucky — a hug. Gate Road
          delivers you toward the 6:00 / Center Camp side of the city.
        </p>
      </div>
    </section>

    <!-- L2K -->
    <section class="mt-12">
      <h2 class="font-display text-xl font-semibold text-primary">L2K — the ring of light</h2>
      <div class="mt-3 space-y-4 text-(--ui-text-toned) leading-relaxed">
        <p>
          <strong class="text-(--ui-text)">L2K</strong> is short for <strong class="text-(--ui-text)">“Lights
          2000.”</strong> Invented by Tim Black and first lit in 1999, it’s a ~600-foot-diameter ring of about
          <strong class="text-(--ui-text)">2,000 computer-controlled LED pods buried in the playa</strong>
          encircling the Man — famously “the only computer network ever designed to be buried in the desert.”
        </p>
        <p>
          The “2000” is the light count, not a year. On burn night the ring becomes sacred ground; participants
          can send pulses of light racing around it from across the circle. It’s returned almost every year since.
        </p>
      </div>
    </section>

    <!-- Beyond the playa -->
    <section class="mt-12">
      <h2 class="font-display text-xl font-semibold text-primary">Beyond the playa</h2>
      <p class="mt-2 text-(--ui-text-toned) leading-relaxed">
        Three Burning Man Project properties near Gerlach get mixed up constantly. They’re different places:
      </p>
      <div class="mt-4 space-y-3">
        <UCard v-for="p in properties" :key="p.name" variant="subtle">
          <div class="flex flex-wrap items-center gap-2">
            <h3 class="font-semibold">{{ p.name }}</h3>
            <UBadge color="neutral" variant="subtle" size="xs">{{ p.tag }}</UBadge>
            <UButton v-if="p.href" :to="p.href" target="_blank" size="xs" variant="link" class="px-0" icon="i-lucide-external-link" />
          </div>
          <p class="mt-1 text-sm text-(--ui-text-muted)">{{ p.detail }}</p>
        </UCard>
      </div>
    </section>

    <!-- 2026 at a glance -->
    <section class="mt-12">
      <h2 class="font-display text-xl font-semibold text-primary">{{ CITY_YEAR }} at a glance</h2>
      <dl class="mt-3 grid gap-3 sm:grid-cols-2">
        <div class="rounded-lg border border-(--ui-border) p-3">
          <dt class="text-xs uppercase tracking-wide text-(--ui-text-muted)">Theme</dt>
          <dd class="font-semibold">Axis Mundi</dd>
        </div>
        <div class="rounded-lg border border-(--ui-border) p-3">
          <dt class="text-xs uppercase tracking-wide text-(--ui-text-muted)">Event dates</dt>
          <dd class="font-semibold">Aug 30 – Sep 7, 2026</dd>
        </div>
        <div class="rounded-lg border border-(--ui-border) p-3">
          <dt class="text-xs uppercase tracking-wide text-(--ui-text-muted)">The Man burns</dt>
          <dd class="font-semibold">Sat, Sep 5 <span class="font-normal text-(--ui-text-muted)">(expected)</span></dd>
        </div>
        <div class="rounded-lg border border-(--ui-border) p-3">
          <dt class="text-xs uppercase tracking-wide text-(--ui-text-muted)">The Temple burns</dt>
          <dd class="font-semibold">Sun, Sep 6 <span class="font-normal text-(--ui-text-muted)">(expected)</span></dd>
        </div>
      </dl>
      <p class="mt-3 text-xs text-(--ui-text-muted)">
        Burn nights are derived from the usual schedule (the Man on the Saturday before Labor Day) until
        Burning Man publishes the official daily lineup.
      </p>
    </section>

    <div class="mt-12 flex flex-wrap gap-3">
      <UButton to="/" icon="i-lucide-map" color="primary">Open the map</UButton>
      <UButton to="/about" icon="i-lucide-info" color="neutral" variant="soft">About BRC Map</UButton>
    </div>
  </UContainer>
</template>
