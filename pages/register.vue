<script setup lang="ts">
import { writeAuthSession } from '~/utils/auth-session'

definePageMeta({
  middleware: 'guest'
})

const fullName = ref('')
const email = ref('')
const password = ref('')
const loading = ref(false)
const errorMessage = ref('')

async function submitRegister() {
  loading.value = true
  errorMessage.value = ''

  try {
    const res = await $fetch<{ user: { id: string; email: string; full_name: string | null } }>(
      '/api/auth/register',
      {
      method: 'POST',
      body: {
        fullName: fullName.value,
        email: email.value,
        password: password.value
      }
      }
    )

    writeAuthSession(res.user)

    await navigateTo('/')
  } catch (error: any) {
    errorMessage.value = error?.data?.statusMessage || error?.message || 'Register gagal.'
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <main class="auth-container">
    <section class="auth-card">
      <h1>Register</h1>
      <form class="auth-form" @submit.prevent="submitRegister">
        <input v-model="fullName" type="text" placeholder="Full name" />
        <input v-model="email" type="email" placeholder="Email" required />
        <input v-model="password" type="password" placeholder="Password (min 8 chars)" required />
        <button :disabled="loading" type="submit">
          {{ loading ? 'Loading...' : 'Register' }}
        </button>
      </form>
      <p v-if="errorMessage" class="error">{{ errorMessage }}</p>
      <p class="link-line">
        Sudah punya akun?
        <NuxtLink to="/login">Login</NuxtLink>
      </p>
    </section>
  </main>
</template>

<style scoped>
.auth-container {
  min-height: 100vh;
  display: grid;
  place-items: center;
  padding: 1rem;
}

.auth-card {
  width: 100%;
  max-width: 420px;
  background: #fff;
  border: 1px solid #e5e7eb;
  border-radius: 12px;
  padding: 1rem;
}

h1 {
  margin: 0 0 0.75rem;
}

.auth-form {
  display: grid;
  gap: 0.6rem;
}

input {
  border: 1px solid #d1d5db;
  border-radius: 8px;
  padding: 0.6rem;
  font: inherit;
}

button {
  border: 0;
  border-radius: 8px;
  background: #111827;
  color: #fff;
  padding: 0.6rem;
  font-weight: 600;
  cursor: pointer;
}

button:disabled {
  opacity: 0.65;
}

.error {
  margin-top: 0.6rem;
  color: #b91c1c;
}

.link-line {
  margin-top: 0.8rem;
}
</style>
