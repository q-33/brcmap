<script setup lang="ts">
const { label } = useManCountdown()
</script>

<template>
  <Transition name="fade">
    <div
      v-if="label"
      class="flex items-center justify-center gap-2 bg-primary px-4 py-1.5 text-center text-sm font-semibold text-white"
    >
      <UIcon name="i-lucide-flame" class="size-4" />
      <span class="font-display uppercase tracking-wide">{{ label }}</span>
    </div>
  </Transition>
</template>

<style scoped>
.fade-enter-active { transition: opacity 0.4s ease; }
.fade-enter-from { opacity: 0; }
</style>
