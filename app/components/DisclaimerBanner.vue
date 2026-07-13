<script setup lang="ts">
// Persistent-but-dismissible disclaimer under the countdown: this is an
// independent, unofficial project — a fork of the Unofficial BRC Map — and NOT
// the separate burnermap.com project. Dismissal is stored in a cookie so it's
// SSR-aware (no flash for returning visitors who've closed it).
const dismissed = useCookie<boolean>('bm-disclaimer-dismissed', {
  maxAge: 60 * 60 * 24 * 365,
  sameSite: 'lax',
})
</script>

<template>
  <div
    v-if="!dismissed"
    class="relative flex items-center justify-center gap-1.5 border-b border-(--ui-border) bg-(--ui-bg-muted) px-9 py-1 text-center text-xs text-(--ui-text-muted)"
  >
    <UIcon name="i-lucide-info" class="size-3.5 shrink-0" />
    <span>
      Unofficial · a fork of the <b class="font-medium text-(--ui-text)">Unofficial BRC Map</b> — not the original
      <a href="https://burnermap.com" target="_blank" rel="noopener noreferrer" class="font-medium text-primary underline underline-offset-2">burnermap.com</a>
      project.
    </span>
    <button
      type="button"
      class="absolute right-2 top-1/2 -translate-y-1/2 rounded p-0.5 transition hover:text-(--ui-text)"
      aria-label="Dismiss notice"
      @click="dismissed = true"
    >
      <UIcon name="i-lucide-x" class="size-3.5" />
    </button>
  </div>
</template>
