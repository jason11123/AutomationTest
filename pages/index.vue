<script setup lang="ts">
type WorkflowResult = {
  topic: string
  step: string[]
  meta?: {
    usage?: TokenUsage
  }
}

type StepStatus = 'pending_approval' | 'approved' | 'running' | 'success' | 'error'

type TokenUsage = {
  inputTokens: number
  outputTokens: number
  totalTokens: number
  cachedTokens: number
}

type StepItem = {
  index: number
  step: string
  status: StepStatus
  output: string
  error: string
  expanded: boolean
  usage: TokenUsage | null
}

const prompt = ref('')
const loading = ref(false)
const stageMessage = ref('')
const errorMessage = ref('')
const workflow = ref<WorkflowResult | null>(null)
const stepItems = ref<StepItem[]>([])
const workflowUsage = ref<TokenUsage | null>(null)
const runningAll = ref(false)

async function submitPrompt() {
  if (!prompt.value.trim()) {
    errorMessage.value = 'Prompt wajib diisi.'
    return
  }

  loading.value = true
  stageMessage.value = 'Menyusun workflow...'
  errorMessage.value = ''
  workflow.value = null
  stepItems.value = []
  workflowUsage.value = null

  try {
    const workflowResponse = await $fetch<WorkflowResult>('/api/workflowbuilder', {
      method: 'POST',
      body: { prompt: prompt.value }
    })

    workflow.value = workflowResponse
    workflowUsage.value = workflowResponse.meta?.usage || null
    stepItems.value = workflowResponse.step.map((step, idx) => ({
      index: idx + 1,
      step,
      status: 'pending_approval',
      output: '',
      error: '',
      expanded: false,
      usage: null
    }))

    stageMessage.value = 'Workflow siap. Approve dan jalankan tiap step.'
  } catch (error: any) {
    stageMessage.value = ''
    errorMessage.value =
      error?.data?.statusMessage || error?.message || 'Terjadi kesalahan saat memanggil API.'
  } finally {
    loading.value = false
  }
}

function onStepEdited(stepIndex: number) {
  const edited = stepItems.value.find((step) => step.index === stepIndex)
  if (!edited) {
    return
  }

  for (const item of stepItems.value) {
    if (item.index < stepIndex) {
      continue
    }

    item.status = 'pending_approval'
    item.output = ''
    item.error = ''
    item.expanded = item.index === stepIndex
  }

  stageMessage.value = `Perubahan di step ${stepIndex} terdeteksi. Approve ulang dari step ini.`
}

function canRun(stepIndex: number) {
  const current = stepItems.value.find((step) => step.index === stepIndex)
  if (!current) {
    return false
  }

  const previousStepsDone = stepItems.value
    .filter((step) => step.index < stepIndex)
    .every((step) => step.status === 'success')

  const allowedStatus = ['pending_approval', 'approved', 'error', 'success'] as StepStatus[]
  return previousStepsDone && allowedStatus.includes(current.status)
}

async function runStep(stepIndex: number) {
  if (!workflow.value) {
    return
  }

  const item = stepItems.value.find((step) => step.index === stepIndex)
  if (!item) {
    return
  }

  if (!item.step.trim()) {
    item.status = 'error'
    item.error = 'Step tidak boleh kosong.'
    item.expanded = true
    return
  }

  if (!canRun(stepIndex)) {
    item.status = item.status === 'pending_approval' ? 'pending_approval' : item.status
    item.error = 'Pastikan step sebelumnya sukses.'
    item.expanded = true
    return
  }

  item.status = 'running'
  item.error = ''

  try {
    const previousOutputs = stepItems.value
      .filter((step) => step.index < stepIndex && step.status === 'success' && step.output.trim())
      .map((step) => `Step ${step.index}: ${step.output}`)

    const res = await $fetch<{ index: number; step: string; output: string; usage?: TokenUsage }>(
      '/api/workflowexecute-step',
      {
        method: 'POST',
        body: {
          topic: workflow.value.topic,
          step: item.step,
          index: item.index,
          previousOutputs
        }
      }
    )

    item.status = 'success'
    item.output = res.output
    item.error = ''
    item.expanded = true
    item.usage = res.usage || null

    stageMessage.value = `Step ${item.index} selesai. Lanjut approve step berikutnya.`
  } catch (error: any) {
    item.status = 'error'
    item.output = ''
    item.error = error?.data?.statusMessage || error?.message || 'Eksekusi step gagal.'
    item.expanded = true
    item.usage = null
  }
}

async function runAllSteps() {
  if (runningAll.value || loading.value) {
    return
  }

  runningAll.value = true
  stageMessage.value = 'Menjalankan semua step...'

  try {
    const ordered = [...stepItems.value].sort((a, b) => a.index - b.index)

    for (const item of ordered) {
      await runStep(item.index)
      const latest = stepItems.value.find((step) => step.index === item.index)

      if (!latest || latest.status !== 'success') {
        stageMessage.value = `Run All berhenti di step ${item.index}. Perbaiki lalu lanjutkan.`
        return
      }
    }

    stageMessage.value = 'Semua step selesai dieksekusi.'
  } finally {
    runningAll.value = false
  }
}

function toggleStep(stepIndex: number) {
  const item = stepItems.value.find((step) => step.index === stepIndex)
  if (!item) {
    return
  }

  item.expanded = !item.expanded
}

function statusLabel(status: StepStatus) {
  if (status === 'pending_approval') return 'Ready'
  if (status === 'approved') return 'Approved'
  if (status === 'running') return 'Running'
  if (status === 'success') return 'Success'
  return 'Error'
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
        <p v-if="workflowUsage" class="usage">
          <strong>Builder Tokens:</strong>
          input {{ workflowUsage.inputTokens }},
          output {{ workflowUsage.outputTokens }},
          total {{ workflowUsage.totalTokens }},
          cached {{ workflowUsage.cachedTokens }}
        </p>
      </section>

      <section v-if="stepItems.length > 0" class="response">
        <div class="section-head">
          <h2>Execution Steps</h2>
          <button class="button small" type="button" :disabled="runningAll || loading" @click="runAllSteps">
            {{ runningAll ? 'Running All...' : 'Run All' }}
          </button>
        </div>

        <article v-for="item in stepItems" :key="item.index" class="log-card">
          <header class="log-header">
            <div class="log-header-left">
              <strong>Step {{ item.index }}</strong>
              <span class="badge" :class="`status-${item.status}`">{{ statusLabel(item.status) }}</span>
            </div>
            <div class="log-header-actions">
              <button
                class="button small"
                type="button"
                :disabled="runningAll || item.status === 'running' || !canRun(item.index)"
                @click="runStep(item.index)"
              >
                {{ item.status === 'error' ? 'Retry' : item.status === 'success' ? 'Rerun' : 'Run' }}
              </button>
              <button class="button ghost small" type="button" @click="toggleStep(item.index)">
                {{ item.expanded ? 'Hide' : 'Show' }}
              </button>
            </div>
          </header>

          <textarea
            v-model="item.step"
            class="step-editor"
            rows="2"
            :disabled="item.status === 'running'"
            @input="onStepEdited(item.index)"
          />

          <div v-if="item.expanded" class="log-content">
            <p v-if="item.error" class="error"><strong>Error:</strong> {{ item.error }}</p>
            <p><strong>Output :</strong></p>
            <textarea
              v-model="item.output"
              class="output-editor"
              rows="5"
              :disabled="item.status === 'running'"
              placeholder="Output step akan muncul di sini. Kamu bisa edit manual."
            />
            <p v-if="item.usage" class="usage">
              <strong>Step Tokens:</strong>
              input {{ item.usage.inputTokens }},
              output {{ item.usage.outputTokens }},
              total {{ item.usage.totalTokens }},
              cached {{ item.usage.cachedTokens }}
            </p>
          </div>
        </article>
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
  max-width: 920px;
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

.button.ghost {
  background: #e5e7eb;
  color: #111827;
}

.button.small {
  padding: 0.35rem 0.7rem;
  font-size: 0.82rem;
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

.section-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 0.75rem;
}

.usage {
  margin-top: 0.5rem;
  font-size: 0.9rem;
  color: #374151;
}

.log-card {
  margin-top: 0.9rem;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  padding: 0.75rem;
  background: #f9fafb;
}

.log-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 0.75rem;
  flex-wrap: wrap;
}

.log-header-left {
  display: flex;
  align-items: center;
  gap: 0.55rem;
}

.log-header-actions {
  display: flex;
  gap: 0.45rem;
}

.badge {
  font-size: 0.72rem;
  font-weight: 700;
  padding: 0.15rem 0.5rem;
  border-radius: 999px;
  border: 1px solid transparent;
}

.status-pending_approval {
  background: #fef3c7;
  color: #92400e;
}

.status-approved {
  background: #dbeafe;
  color: #1e40af;
}

.status-running {
  background: #e0e7ff;
  color: #4338ca;
}

.status-success {
  background: #dcfce7;
  color: #166534;
}

.status-error {
  background: #fee2e2;
  color: #991b1b;
}

.step-editor {
  width: 100%;
  margin-top: 0.7rem;
  resize: vertical;
  border: 1px solid #d1d5db;
  border-radius: 8px;
  padding: 0.55rem;
  font: inherit;
}

.log-content {
  margin-top: 0.65rem;
}

.output-editor {
  width: 100%;
  margin-top: 0.35rem;
  resize: vertical;
  border: 1px solid #d1d5db;
  border-radius: 8px;
  padding: 0.55rem;
  font: inherit;
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
