<script setup lang="ts">
const email = ref('')
const busy = ref(false)
const sent = ref(false)
const error = ref('')

async function submit() {
  busy.value = true
  error.value = ''
  try {
    await $fetch('/api/auth/forgot-password', { method: 'POST', body: { email: email.value } })
    sent.value = true
  }
  catch (e: any) {
    error.value = e?.data?.statusMessage ?? 'Something went wrong — try again.'
  }
  finally {
    busy.value = false
  }
}

useHead({ title: 'Reset password — BRC Map' })
</script>

<template>
  <UContainer class="max-w-md py-12 sm:py-16">
    <h1 class="font-display text-3xl font-bold uppercase tracking-tight">Reset password</h1>
    <UCard class="mt-6">
      <div v-if="sent" class="space-y-3 py-2 text-center">
        <UIcon name="i-lucide-mail-check" class="mx-auto size-10 text-primary" />
        <p class="text-sm">If an account exists for <b>{{ email }}</b>, a reset link is on its way. Check your inbox (and spam) — the link expires in an hour.</p>
        <UButton to="/?login=1" variant="link">Back to log in</UButton>
      </div>
      <form v-else class="space-y-3" @submit.prevent="submit">
        <p class="text-sm text-(--ui-text-muted)">Enter your account email and we will send a link to set a new password.</p>
        <UInput v-model="email" type="email" placeholder="you@example.com" required class="w-full" />
        <p v-if="error" class="text-sm text-error">{{ error }}</p>
        <UButton type="submit" block :loading="busy">Send reset link</UButton>
        <NuxtLink to="/?login=1" class="block text-center text-xs text-(--ui-text-muted) underline">Remembered it? Log in</NuxtLink>
      </form>
    </UCard>
  </UContainer>
</template>
