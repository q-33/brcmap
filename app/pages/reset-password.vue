<script setup lang="ts">
const route = useRoute()
const token = computed(() => String(route.query.token ?? ''))
const password = ref('')
const confirm = ref('')
const busy = ref(false)
const done = ref(false)
const error = ref('')

async function submit() {
  if (password.value.length < 8) {
    error.value = 'Password must be at least 8 characters.'
    return
  }
  if (password.value !== confirm.value) {
    error.value = 'Passwords do not match.'
    return
  }
  busy.value = true
  error.value = ''
  try {
    await $fetch('/api/auth/reset-password', { method: 'POST', body: { token: token.value, password: password.value } })
    done.value = true
  }
  catch (e: any) {
    error.value = e?.data?.statusMessage ?? 'Could not reset your password.'
  }
  finally {
    busy.value = false
  }
}

useHead({ title: 'Set a new password — BRC Map' })
</script>

<template>
  <UContainer class="max-w-md py-12 sm:py-16">
    <h1 class="font-display text-3xl font-bold uppercase tracking-tight">Set a new password</h1>
    <UCard class="mt-6">
      <div v-if="done" class="space-y-3 py-2 text-center">
        <UIcon name="i-lucide-circle-check" class="mx-auto size-10 text-green-500" />
        <p class="text-sm">Your password has been reset. You can log in with it now.</p>
        <UButton to="/?login=1">Log in</UButton>
      </div>
      <div v-else-if="!token" class="space-y-3 py-2 text-center">
        <UIcon name="i-lucide-unlink" class="mx-auto size-10 text-(--ui-text-muted)" />
        <p class="text-sm">This reset link is missing its token. Request a new one.</p>
        <UButton to="/forgot-password" variant="link">Request a reset link</UButton>
      </div>
      <form v-else class="space-y-3" @submit.prevent="submit">
        <UInput v-model="password" type="password" placeholder="New password (8+ characters)" required class="w-full" />
        <UInput v-model="confirm" type="password" placeholder="Confirm new password" required class="w-full" />
        <p v-if="error" class="text-sm text-error">{{ error }}</p>
        <UButton type="submit" block :loading="busy">Set new password</UButton>
      </form>
    </UCard>
  </UContainer>
</template>
