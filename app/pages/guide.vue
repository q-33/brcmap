<script setup lang="ts">
import { CITY_YEAR, STREET_NAMES, goldenSpikeKnown } from '~~/lib/brc/geocode'

useHead({ title: 'City Guide — BurnerMap' })

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
          radial crosses E. That’s exactly how BurnerMap turns an address into a pin.
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
            BurnerMap is built the same way: every address is computed from that single center point.
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
      <UButton to="/about" icon="i-lucide-info" color="neutral" variant="soft">About BurnerMap</UButton>
    </div>
  </UContainer>
</template>
