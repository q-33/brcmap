<script setup lang="ts">
useHead({ title: 'About — BurnerMap' })

const team = ['Crockett! (Vince Ferhino — Soon To Be Infamous)', 'Pee Pee La Poo (Trashistan)']
const alumni = [
  'Hammer Time (Kevin Bond — Black Rock Observatory)',
  'DhammaSeeker (Wade Harrell — Pretty Pickle)',
  'Blue Skies (Mike McGee — Northwest Mist)',
  'Pup (Jeremy Lee — Vinyl Bunker)',
]
</script>

<template>
  <UContainer class="max-w-3xl py-12 sm:py-16">
    <div class="mb-10">
      <UBadge color="primary" variant="subtle" class="mb-4">Unofficial · Community-built</UBadge>
      <h1 class="font-display text-4xl font-bold tracking-tight sm:text-5xl">
        About BurnerMap
      </h1>
      <p class="mt-4 text-lg text-(--ui-text-muted)">
        A passion project by a small group of people who love Black Rock City — and maps.
      </p>
    </div>

    <div class="space-y-4 text-(--ui-text-toned) leading-relaxed">
      <p>
        First of all, BurnerMap would not be possible without <strong class="text-(--ui-text)">your participation</strong>.
        We're merely the shell for all your shiny pearls of information — thank you to every gracious contributor!
      </p>
      <p>
        We collect placement information voluntarily from camps and artists who wish to share their
        approximate location ahead of arriving on the playa. Our pin placements are only good guesses
        and may not reflect reality for those lucky enough to be there in person. The map should give
        you a decent idea of what you'll find in your neighborhood — but you'll discover even more once
        you're out there.
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

    <div class="mt-12 flex flex-wrap gap-3">
      <UButton to="mailto:feedback@unofficialbrcmap.com" icon="i-lucide-mail" color="neutral" variant="soft">
        Contact us
      </UButton>
      <UButton to="https://github.com/q-33/burnermap" target="_blank" icon="i-lucide-github" color="neutral" variant="soft">
        Contribute on GitHub
      </UButton>
      <UButton to="/" icon="i-lucide-map" color="primary">
        Open the map
      </UButton>
    </div>
  </UContainer>
</template>
