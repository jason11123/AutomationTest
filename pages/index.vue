<script setup lang="ts">
type WorkflowResult = {
  topic: string
  step: string[]
}

type ExecutionLog = {
  index: number
  step: string
  output: string
}

const prompt = ref('')
const loading = ref(false)
const stageMessage = ref('')
const errorMessage = ref('')
const workflow = ref<WorkflowResult | null>(null)
const executionLogs = ref<ExecutionLog[]>([])

async function submitPrompt() {
  if (!prompt.value.trim()) {
    errorMessage.value = 'Prompt wajib diisi.'
    return
  }

  loading.value = true
  stageMessage.value = 'Menyusun workflow...'
  errorMessage.value = ''
  workflow.value = null
  executionLogs.value = []

  try {
    const workflowResponse = await $fetch<WorkflowResult>('/api/workflowbuilder', {
      method: 'POST',
      body: { prompt: prompt.value }
    })

    workflow.value = workflowResponse

    await streamExecution(workflowResponse.topic, workflowResponse.step)
  } catch (error: any) {
    stageMessage.value = ''
    errorMessage.value =
      error?.data?.statusMessage || error?.message || 'Terjadi kesalahan saat memanggil API.'
  } finally {
    loading.value = false
  }
}

function streamExecution(topic: string, steps: string[]) {
  return new Promise<void>((resolve, reject) => {
    const params = new URLSearchParams({
      topic,
      steps: JSON.stringify(steps)
    })

    const source = new EventSource(`/api/workflowexecute-stream?${params.toString()}`)
    let finished = false

    source.addEventListener('stage', (event) => {
      const data = safeJsonParse((event as MessageEvent).data)
      if (data?.message) {
        stageMessage.value = data.message
      }
    })

    source.addEventListener('step', (event) => {
      const data = safeJsonParse((event as MessageEvent).data)
      if (data?.index && data?.step && data?.output) {
        executionLogs.value.push(data as ExecutionLog)
      }
    })

    source.addEventListener('execution_error', (event) => {
      const data = safeJsonParse((event as MessageEvent).data)
      finished = true
      source.close()
      reject(new Error(data?.message || 'Eksekusi workflow gagal.'))
    })

    source.addEventListener('done', (event) => {
      const data = safeJsonParse((event as MessageEvent).data)
      stageMessage.value = data?.message || 'Selesai.'
      finished = true
      source.close()
      resolve()
    })

    source.onerror = () => {
      if (finished) {
        return
      }

      source.close()
      reject(new Error('Koneksi stream terputus saat eksekusi workflow.'))
    }
  })
}

function safeJsonParse(value: string): any {
  try {
    return JSON.parse(value)
  } catch {
    return null
  }
}
</script>

<template>
  <main class="container">
    <section class="card">
      <h1>Agate AI Agent Workflow</h1>
      <p>Autonomous Task Runner</p>

      <form class="form" @submit.prevent="submitPrompt">
        <textarea
          v-model="prompt"
          class="textarea"
          placeholder="Example : Research [topic], then write a summary, then draft a social media post about it."
          rows="6"
        />
        <button class="button" type="submit" :disabled="loading">
          {{ loading ? 'Processing...' : 'Submit' }}
        </button>
      </form>

      <p v-if="stageMessage" class="stage">{{ stageMessage }}</p>
      <p v-if="errorMessage" class="error">{{ errorMessage }}</p>

      <section v-if="workflow" class="response">
        <h2>Workflow</h2>
        <p><strong>Topic:</strong> {{ workflow.topic }}</p>
        <ol class="steps">
          <li v-for="(item, idx) in workflow.step" :key="`${idx}-${item}`">{{ item }}</li>
        </ol>
      </section>

      <section v-if="executionLogs.length > 0" class="response">
        <h2>Execution Log</h2>
        <details v-for="log in executionLogs" :key="log.index" class="log-card">
          <summary>Proses Step {{ log.index }}: {{ log.step }}</summary>
          <div class="log-content">
            <p><strong>Output:</strong></p>
            <pre>{{ log.output }}</pre>
          </div>
        </details>
      </section>
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
  max-width: 860px;
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

.stage {
  margin-top: 0.9rem;
  color: #1d4ed8;
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

.steps {
  margin: 0.5rem 0 0;
  padding-left: 1.25rem;
  color: #111827;
}

.log-card {
  margin-top: 0.9rem;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  padding: 0.65rem 0.75rem;
  background: #f9fafb;
}

summary {
  cursor: pointer;
  font-weight: 600;
  color: #111827;
}

.log-content {
  margin-top: 0.6rem;
}

h2 {
  margin: 0;
  font-size: 1rem;
}

pre {
  margin: 0.35rem 0 0.2rem;
  white-space: pre-wrap;
  word-break: break-word;
  font: inherit;
  color: #111827;
}
</style>
