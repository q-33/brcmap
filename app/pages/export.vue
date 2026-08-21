<script setup lang="ts">
// Data export panel. Visible to anyone holding the `data-export` feature flag
// (admins included) — granted per person from /admin → People, and revocable
// without a deploy.
//
// Built for Burning Mesh, who are adding a BRC Map layer to the Meshtastic app.
const { me, isAdmin, hasFeature, refreshMe } = useMe()
const { loggedIn } = useUserSession()

await refreshMe()
const allowed = computed(() => isAdmin.value || hasFeature('data-export'))

interface LayerDef { key: string, label: string, blurb: string, icon: string }
const LAYERS: LayerDef[] = [
  { key: 'camps', label: 'Camps', blurb: 'Every placed theme camp: name, address, description, website, and its frontage and depth where set.', icon: 'i-lucide-tent' },
  { key: 'art', label: 'Art', blurb: 'Placed artworks with artist, address and description.', icon: 'i-lucide-palette' },
  { key: 'landmarks', label: 'Civic landmarks', blurb: 'Medical and ESD stations, Ranger outposts, ice, the gate complex, the Temple — with any admin corrections applied.', icon: 'i-lucide-shield' },
  { key: 'toilets', label: 'Porta-potties', blurb: "The 45 surveyed banks from Burning Man's official 2026 GIS.", icon: 'i-lucide-toilet' },
  { key: 'city', label: 'The city', blurb: 'Streets, blocks, plazas, the trash fence, Gate Road and the Deep-Playa Music Zone.', icon: 'i-lucide-map' },
  { key: 'all', label: 'Everything', blurb: 'All of the above in one file, each feature tagged with a `layer` property.', icon: 'i-lucide-layers' },
]

const busy = ref('')
const err = ref('')

async function download(key: string) {
  busy.value = key
  err.value = ''
  try {
    const res = await fetch(`/api/export/${key}`, { credentials: 'same-origin' })
    if (!res.ok)
      throw new Error(`${res.status} ${res.statusText}`)
    const blob = await res.blob()
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `brcmap-${key}-2026.geojson`
    a.click()
    URL.revokeObjectURL(a.href)
  }
  catch (e: any) {
    err.value = e?.message ?? 'Download failed'
  }
  finally {
    busy.value = ''
  }
}

useHead({ title: 'Data export — BRC Map' })
</script>

<template>
  <UContainer class="py-10 sm:py-14">
    <h1 class="font-display text-3xl font-bold uppercase tracking-tight sm:text-4xl">Data export</h1>

    <div v-if="!loggedIn" class="mt-6 rounded-xl border border-(--ui-border) p-6 text-(--ui-text-muted)">
      <p>Sign in to reach the export panel.</p>
      <UButton to="/" class="mt-3" icon="i-lucide-log-in">Go to the map to sign in</UButton>
    </div>

    <div v-else-if="!allowed" class="mt-6 rounded-xl border border-(--ui-border) p-6">
      <p class="text-(--ui-text-muted)">
        This panel is granted per account. If you're working on a project that needs BRC Map data,
        <NuxtLink to="/contact" class="text-primary underline">get in touch</NuxtLink> and we'll set you up.
      </p>
      <p class="mt-2 text-xs text-(--ui-text-muted)">Signed in as {{ me?.email }}.</p>
    </div>

    <template v-else>
      <p class="mt-2 max-w-2xl text-(--ui-text-toned) leading-relaxed">
        The map as GeoJSON (RFC 7946), in WGS84. Every file is generated live, so a download is
        always current — there's no stale snapshot to re-request.
      </p>

      <div class="mt-6 grid gap-3 sm:grid-cols-2">
        <div v-for="l in LAYERS" :key="l.key" class="flex flex-col rounded-xl border border-(--ui-border) p-4">
          <div class="flex items-center gap-2">
            <UIcon :name="l.icon" class="size-5 shrink-0 text-primary" />
            <h2 class="font-semibold">{{ l.label }}</h2>
          </div>
          <p class="mt-1 flex-1 text-sm text-(--ui-text-muted)">{{ l.blurb }}</p>
          <div class="mt-3 flex items-center gap-2">
            <UButton
              :loading="busy === l.key"
              size="sm"
              icon="i-lucide-download"
              @click="download(l.key)"
            >
              Download
            </UButton>
            <code class="truncate rounded bg-(--ui-bg-muted) px-1.5 py-1 font-mono text-xs text-(--ui-text-muted)">/api/export/{{ l.key }}</code>
          </div>
        </div>
      </div>

      <p v-if="err" class="mt-4 text-sm text-red-600">{{ err }}</p>

      <div class="mt-8 space-y-4 text-sm text-(--ui-text-toned)">
        <div class="rounded-xl border border-(--ui-border) bg-(--ui-bg-muted)/40 p-4">
          <h3 class="font-semibold text-(--ui-text)">Fetching it directly</h3>
          <p class="mt-1">
            The endpoints accept your session cookie, so a signed-in browser can hit them straight.
            For a script, log in and reuse the cookie:
          </p>
          <pre class="mt-2 overflow-x-auto rounded-lg bg-(--ui-bg) p-3 font-mono text-xs">curl -c jar.txt -X POST https://brcmap.net/api/auth/login \
  -H 'content-type: application/json' \
  -d '{"email":"you@example.com","password":"…"}'

curl -b jar.txt https://brcmap.net/api/export/all -o brcmap.geojson</pre>
        </div>

        <div class="rounded-xl border border-(--ui-border) bg-(--ui-bg-muted)/40 p-4">
          <h3 class="font-semibold text-(--ui-text)">What's in it, and what isn't</h3>
          <p class="mt-1">
            Camps and art carry their public listing — name, position, address, description, website,
            hometown. They carry <strong class="text-(--ui-text)">no owner names, emails, account ids
              or contact details</strong>. Everything identifying a person stays behind our login.
          </p>
          <p class="mt-2">
            Camps that asked to be left out of third-party exports are filtered out before the file is
            built. They stay on brcmap.net; they're just not passed on.
          </p>
        </div>

        <div class="rounded-xl border border-(--ui-border) bg-(--ui-bg-muted)/40 p-4">
          <h3 class="font-semibold text-(--ui-text)">Credit and licensing</h3>
          <p class="mt-1">
            Camp and art placements are contributed by the burners who built them — please credit
            <strong class="text-(--ui-text)">BRC Map (brcmap.net)</strong> wherever the data appears.
            Each file carries an <code class="rounded bg-(--ui-bg) px-1 font-mono text-xs">attribution</code>
            string for that.
          </p>
          <p class="mt-2">
            The city geometry is derived from Burning Man's surveyed GIS, whose use is governed by the
            <a href="https://innovate.burningman.org/terms-of-service-for-burning-man-apis-and-datasets/" target="_blank" rel="noopener noreferrer" class="text-primary underline">Terms of Service for Burning Man APIs and Datasets</a>.
            Positions shift year to year — re-export for each event rather than shipping a fixed copy.
          </p>
        </div>
      </div>
    </template>
  </UContainer>
</template>
