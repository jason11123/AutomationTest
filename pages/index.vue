<script setup lang="ts">
const prompt = ref('')
const loading = ref(false)
const errorMessage = ref('')
const responseText = ref('')

async function submitPrompt() {
  if (!prompt.value.trim()) {
    errorMessage.value = 'Prompt wajib diisi.'
    return
  }

  loading.value = true
  errorMessage.value = ''
  responseText.value = ''

  try {
    const res = await $fetch<{ output: string }>('/api/llm', {
      method: 'POST',
      body: { prompt: prompt.value }
    })

    responseText.value = res.output
  } catch (error: any) {
    errorMessage.value =
      error?.data?.statusMessage || error?.message || 'Terjadi kesalahan saat memanggil API.'
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <main class="container">
    <section class="card">
      <h1>Test OpenAI LLM</h1>
      <p>Kirim prompt ke API Nuxt: <code>POST /api/llm</code></p>

      <form class="form" @submit.prevent="submitPrompt">
        <textarea
          v-model="prompt"
          class="textarea"
          placeholder="Tulis prompt kamu di sini..."
          rows="6"
        />
        <button class="button" type="submit" :disabled="loading">
          {{ loading ? 'Menunggu respon...' : 'Submit' }}
        </button>
      </form>

      <p v-if="errorMessage" class="error">{{ errorMessage }}</p>
      <div v-if="responseText" class="response">
        <h2>Response</h2>
        <pre>{{ responseText }}</pre>
      </div>
    </section>
  </main>
</template>

<style scoped>
.container {
  min-height: 100vh;
  display: grid;
  place-items: center;
  padding: 1.5rem;
}

.card {
  width: 100%;
  max-width: 760px;
  background: #ffffff;
  border: 1px solid #e5e7eb;
  border-radius: 12px;
  padding: 1.25rem;
}

h1 {
  margin: 0 0 0.25rem;
  font-size: 1.6rem;
}

p {
  margin: 0;
  color: #4b5563;
}

.form {
  margin-top: 1rem;
  display: grid;
  gap: 0.75rem;
}

.textarea {
  width: 100%;
  resize: vertical;
  border: 1px solid #d1d5db;
  border-radius: 8px;
  padding: 0.75rem;
  font: inherit;
}

.button {
  width: fit-content;
  border: 0;
  border-radius: 8px;
  background: #111827;
  color: #fff;
  padding: 0.55rem 1rem;
  font-weight: 600;
  cursor: pointer;
}

.button:disabled {
  opacity: 0.65;
  cursor: not-allowed;
}

.error {
  margin-top: 0.9rem;
  color: #b91c1c;
}

.response {
  margin-top: 1rem;
  border-top: 1px solid #e5e7eb;
  padding-top: 1rem;
}

h2 {
  margin: 0 0 0.5rem;
  font-size: 1rem;
}

pre {
  margin: 0;
  white-space: pre-wrap;
  word-break: break-word;
  font: inherit;
  color: #111827;
}
</style>
