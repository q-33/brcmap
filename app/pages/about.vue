<script setup lang="ts">
import { CITY_YEAR, STREET_NAMES } from '~~/lib/brc/geocode'

useHead({ title: 'About — BRC Map' })

const streets = Object.entries(STREET_NAMES).filter(([k]) => k !== 'Esplanade')

const team = ['digit', 'LB', 'Gizmo']
const alumni = [
  'Crockett! (Vince Ferhino — Soon To Be Infamous)',
  'Pee Pee La Poo (Trashistan)',
  'Hammer Time (Kevin Bond — Black Rock Observatory)',
  'DhammaSeeker (Wade Harrell — Pretty Pickle)',
  'Blue Skies (Mike McGee — Northwest Mist)',
  'Pup (Jeremy Lee — Vinyl Bunker)',
]
</script>

<template>
  <UContainer class="max-w-3xl py-12 sm:py-16">
    <div class="mb-10">
      <UBadge color="primary" variant="subtle" class="mb-4">Black Rock City {{ CITY_YEAR }} · Unofficial</UBadge>
      <h1 class="font-display text-4xl font-bold uppercase tracking-tight sm:text-5xl">
        About BRC Map
      </h1>
      <p class="mt-4 text-lg text-(--ui-text-muted)">
        A passion project by a small group of people who love Black Rock City — and maps.
      </p>
    </div>

    <div class="space-y-4 text-(--ui-text-toned) leading-relaxed">
      <p>
        First of all, BRC Map would not be possible without <strong class="text-(--ui-text)">your participation</strong>.
        We're merely the shell for all your shiny pearls of information — thank you to every gracious contributor!
      </p>
      <p>
        The map is built from two things. Camps and artists <strong class="text-(--ui-text)">come here
        and share</strong> their approximate location ahead of arriving on the playa — that is where
        this started, and those are the pins someone chose to put up. Alongside them we now show
        Burning Man's own <strong class="text-(--ui-text)">public placement directory</strong>, so the
        map shows the whole city rather than only the camps who found us. You can switch the directory
        off in the map's Layers panel if you only want to see who opted in.
      </p>
      <p>
        Where a camp appears in both, the pin its own people placed always wins — we never move
        somebody's pin to match a spreadsheet. Placements are good guesses either way, and may not
        reflect reality for those lucky enough to be there in person. The map should give you a decent
        idea of what you'll find in your neighborhood — but you'll discover even more once you're out
        there.
      </p>
    </div>

    <UCard class="mt-10" variant="subtle">
      <div class="flex items-start gap-3">
        <UIcon name="i-lucide-triangle-alert" class="mt-0.5 size-5 shrink-0 text-primary" />
        <p class="text-sm text-(--ui-text-muted)">
          This is an <strong class="text-(--ui-text)">unofficial</strong> map. Pins do not equal reserved space.
          Only Burning Man Placement determines camp locations and only the ARTery determines art placement.
          Always confirm on playa.
        </p>
      </div>
    </UCard>

    <section class="mt-10">
      <h2 class="font-display mb-1 text-lg font-semibold text-primary">{{ CITY_YEAR }} streets — “Axis Mundi”</h2>
      <p class="mb-3 text-sm text-(--ui-text-muted)">
        This year's radial streets are named for notional centers of the world. We show these names
        across the map; addresses still use the clock + street letter.
      </p>
      <div class="flex flex-wrap gap-1.5">
        <UBadge v-for="[letter, name] in streets" :key="letter" color="neutral" variant="subtle">
          {{ letter }} · {{ name }}
        </UBadge>
      </div>
    </section>

    <div class="mt-12 grid gap-8 sm:grid-cols-2">
      <section>
        <h2 class="font-display mb-3 text-lg font-semibold text-primary">The Team</h2>
        <ul class="space-y-1.5 text-sm text-(--ui-text-toned)">
          <li v-for="m in team" :key="m" class="flex gap-2">
            <UIcon name="i-lucide-flame" class="mt-0.5 size-4 shrink-0 text-primary/70" />{{ m }}
          </li>
        </ul>
      </section>
      <section>
        <h2 class="font-display mb-3 text-lg font-semibold text-primary">Alumni</h2>
        <ul class="space-y-1.5 text-sm text-(--ui-text-toned)">
          <li v-for="m in alumni" :key="m" class="flex gap-2">
            <UIcon name="i-lucide-sparkles" class="mt-0.5 size-4 shrink-0 text-(--ui-text-muted)" />{{ m }}
          </li>
        </ul>
      </section>
    </div>

    <section class="mt-10">
      <h2 class="font-display mb-3 text-lg font-semibold text-primary">What we count, and what we don't</h2>
      <div class="space-y-3 text-sm text-(--ui-text-toned) leading-relaxed">
        <p>
          We wanted to know whether anyone was actually using this thing, so the map counts visits.
          There is no Google Analytics here, and no third-party tracker of any kind — those cost you
          a download and a lookup on a hotspot your whole camp is sharing, and they send your browsing
          to a company that has nothing to do with Black Rock City.
        </p>
        <p>
          Instead the site sends one small note to <em>our own</em> server saying “someone loaded this
          page”, at most once a minute, and only while the tab is actually open in front of you.
        </p>
        <p>
          <strong class="text-(--ui-text)">We do not store who you are.</strong> Your address and browser
          are scrambled together with today's date into a jumble of letters that cannot be turned back
          into either. Because the date is part of it, the jumble changes at playa midnight — so even we
          cannot tell that today's visitor and tomorrow's are the same person. No cookie, no advertising
          id, nothing kept on your device. There is nothing to opt out of because there is nothing
          persistent to opt out from.
        </p>
        <p class="text-(--ui-text-muted)">
          The honest catch: everyone sharing one connection looks like one visitor, so on playa these
          numbers run low. That is fine — we only wanted to know if the map was worth keeping running.
        </p>
      </div>
    </section>

    <div class="mt-12 flex flex-wrap gap-3">
      <UButton to="mailto:feedback@unofficialbrcmap.com" icon="i-lucide-mail" color="neutral" variant="soft">
        Contact us
      </UButton>
      <UButton to="https://github.com/q-33/brcmap" target="_blank" icon="i-lucide-github" color="neutral" variant="soft">
        Contribute on GitHub
      </UButton>
      <UButton to="/" icon="i-lucide-map" color="primary">
        Open the map
      </UButton>
    </div>
  </UContainer>
</template>
