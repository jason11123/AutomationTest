<script setup lang="ts">
import { clearAuthSession, readAuthSession, type ClientAuthUser } from '~/utils/auth-session'

definePageMeta({
  middleware: 'auth'
})

type ExecutionLog = {
  id: string
  step_order: number
  step_instruction: string
  input_context: string | null
  output_text: string | null
  status: 'success' | 'error'
  error_message: string | null
  created_at: string
  input_tokens: number
  output_tokens: number
  total_tokens: number
  cached_tokens: number
}

type ExecutionResponse = {
  workflow: {
    id: string
    title: string
    topic: string
    status: string
  }
  pagination: {
    limit: number
    offset: number
    total: number
  }
  stats: {
    total_executions: number
    success_executions: number
    failed_executions: number
    last_execution_at: string | null
  }
  logs: ExecutionLog[]
}

const route = useRoute()
const currentUser = ref<ClientAuthUser | null>(null)
const loading = ref(false)
const errorMessage = ref('')
const data = ref<ExecutionResponse | null>(null)
const expanded = ref<Record<string, boolean>>({})
const limit = ref(20)
const offset = ref(0)

if (process.client) {
  currentUser.value = readAuthSession()?.user || null
}

onMounted(async () => {
  await loadLogs()
})

async function loadLogs() {
  if (!currentUser.value?.id) {
    return
  }

  loading.value = true
  errorMessage.value = ''
  try {
    const res = await $fetch<ExecutionResponse>(`/api/workflows/${route.params.id}/executions`, {
      query: {
        userId: currentUser.value.id,
        limit: limit.value,
        offset: offset.value
      },
      headers: {
        'x-user-id': currentUser.value.id
      }
    })

    data.value = res
  } catch (error: any) {
    errorMessage.value = error?.data?.statusMessage || error?.message || 'Gagal memuat execution logs.'
  } finally {
    loading.value = false
  }
}

async function nextPage() {
  const total = Number(data.value?.pagination.total || 0)
  if (offset.value + limit.value >= total) {
    return
  }
  offset.value += limit.value
  await loadLogs()
}

async function prevPage() {
  if (offset.value === 0) {
    return
  }
  offset.value = Math.max(0, offset.value - limit.value)
  await loadLogs()
}

function toggleLog(id: string) {
  expanded.value[id] = !expanded.value[id]
}

function formatDate(value: string | null) {
  if (!value) return '-'
  return new Date(value).toLocaleString('id-ID')
}

async function logout() {
  clearAuthSession()
  await $fetch('/api/auth/logout', { method: 'POST' })
  currentUser.value = null
  await navigateTo('/login')
}
</script>

<template>
  <main class="container">
    <section class="card">
      <AppNavbar :current-user="currentUser" @logout="logout" />

      <div class="head">
        <h1>Workflow Execution Logs</h1>
        <div class="head-actions">
          <NuxtLink class="button ghost small link-btn" :to="`/?workflowId=${route.params.id}`">Execute / Edit</NuxtLink>
          <button class="button ghost small" type="button" :disabled="loading" @click="loadLogs">Refresh</button>
        </div>
      </div>

      <p v-if="errorMessage" class="error">{{ errorMessage }}</p>
      <p v-if="loading" class="muted">Loading...</p>

      <template v-if="data">
        <section class="summary">
          <p><strong>{{ data.workflow.title }}</strong></p>
          <p>{{ data.workflow.topic }}</p>
          <p>
            Total {{ data.stats.total_executions }} | Success {{ data.stats.success_executions }} | Error
            {{ data.stats.failed_executions }}
          </p>
          <p>Last run: {{ formatDate(data.stats.last_execution_at) }}</p>
        </section>

        <section class="list">
          <article v-for="log in data.logs" :key="log.id" class="row">
            <header class="row-head">
              <div>
                <strong>Step {{ log.step_order }}</strong>
                <span class="badge" :class="log.status === 'success' ? 'ok' : 'err'">
                  {{ log.status }}
                </span>
              </div>
              <div class="row-actions">
                <small>{{ formatDate(log.created_at) }}</small>
                <button class="button ghost small" type="button" @click="toggleLog(log.id)">
                  {{ expanded[log.id] ? 'Hide' : 'Show' }}
                </button>
              </div>
            </header>

            <p class="meta">{{ log.step_instruction }}</p>
            <p class="meta">
              Tokens {{ log.total_tokens }} | in {{ log.input_tokens }} | out {{ log.output_tokens }} | cached
              {{ log.cached_tokens }}
            </p>

            <div v-if="expanded[log.id]" class="detail">
              <p><strong>Input Context</strong></p>
              <pre>{{ log.input_context || '-' }}</pre>
              <p><strong>Output</strong></p>
              <pre>{{ log.output_text || '-' }}</pre>
              <p v-if="log.error_message" class="error"><strong>Error:</strong> {{ log.error_message }}</p>
            </div>
          </article>
        </section>

        <div class="pager">
          <button class="button small ghost" type="button" :disabled="offset === 0 || loading" @click="prevPage">
            Prev
          </button>
          <span>{{ offset + 1 }}-{{ Math.min(offset + limit, data.pagination.total) }} / {{ data.pagination.total }}</span>
          <button
            class="button small ghost"
            type="button"
            :disabled="offset + limit >= data.pagination.total || loading"
            @click="nextPage"
          >
            Next
          </button>
        </div>
      </template>
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
  max-width: 980px;
  background: #fff;
  border: 1px solid #e5e7eb;
  border-radius: 12px;
  padding: 1.25rem;
}

.head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 0.75rem;
}

.head-actions {
  display: flex;
  align-items: center;
  gap: 0.6rem;
}

.summary {
  margin-top: 1rem;
  border: 1px solid #e5e7eb;
  border-radius: 10px;
  padding: 0.8rem;
}

.summary p {
  margin: 0.2rem 0;
}

.list {
  margin-top: 1rem;
  display: grid;
  gap: 0.75rem;
}

.row {
  border: 1px solid #e5e7eb;
  border-radius: 10px;
  padding: 0.8rem;
}

.row-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 0.7rem;
  flex-wrap: wrap;
}

.row-actions {
  display: flex;
  align-items: center;
  gap: 0.6rem;
}

.meta {
  margin: 0.3rem 0 0;
  color: #4b5563;
}

.badge {
  margin-left: 0.5rem;
  padding: 0.18rem 0.55rem;
  border-radius: 999px;
  font-size: 0.75rem;
  font-weight: 700;
}

.badge.ok {
  background: #dcfce7;
  color: #166534;
}

.badge.err {
  background: #fee2e2;
  color: #991b1b;
}

.detail {
  margin-top: 0.7rem;
}

pre {
  margin: 0.2rem 0 0.5rem;
  white-space: pre-wrap;
  word-break: break-word;
  background: #f9fafb;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  padding: 0.55rem;
}

.button {
  border: 0;
  border-radius: 8px;
  background: #111827;
  color: #fff;
  padding: 0.5rem 0.85rem;
  font-weight: 600;
  cursor: pointer;
}

.button.ghost {
  background: #e5e7eb;
  color: #111827;
}

.button.small {
  padding: 0.35rem 0.65rem;
  font-size: 0.82rem;
}

.link-btn {
  text-decoration: none;
}

.error {
  margin-top: 0.8rem;
  color: #b91c1c;
}

.muted {
  margin-top: 0.8rem;
  color: #6b7280;
}

.pager {
  margin-top: 1rem;
  display: flex;
  justify-content: flex-end;
  align-items: center;
  gap: 0.75rem;
}
</style>
