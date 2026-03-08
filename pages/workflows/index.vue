<script setup lang="ts">
import { clearAuthSession, readAuthSession, type ClientAuthUser } from '~/utils/auth-session'

definePageMeta({
  middleware: 'auth'
})

type WorkflowHistoryItem = {
  id: string
  title: string
  topic: string
  status: string
  updated_at: string
  created_at: string
  step_count: number
  total_executions: number
  success_executions: number
  failed_executions: number
  total_tokens: number
  total_input_tokens: number
  total_output_tokens: number
}

type WorkflowHistoryResponse = {
  pagination: {
    limit: number
    offset: number
    total: number
  }
  workflows: WorkflowHistoryItem[]
}

const currentUser = ref<ClientAuthUser | null>(null)
const loading = ref(false)
const errorMessage = ref('')
const items = ref<WorkflowHistoryItem[]>([])
const pageSize = ref(10)
const offset = ref(0)
const total = ref(0)

if (process.client) {
  currentUser.value = readAuthSession()?.user || null
}

const currentPage = computed(() => Math.floor(offset.value / pageSize.value) + 1)
const totalPages = computed(() => {
  if (total.value <= 0) {
    return 1
  }
  return Math.ceil(total.value / pageSize.value)
})

onMounted(async () => {
  await loadHistory()
})

async function loadHistory() {
  if (!currentUser.value?.id) {
    return
  }

  loading.value = true
  errorMessage.value = ''

  try {
    const res = await $fetch<WorkflowHistoryResponse>('/api/workflows/history', {
      query: {
        userId: currentUser.value.id,
        limit: pageSize.value,
        offset: offset.value
      },
      headers: {
        'x-user-id': currentUser.value.id
      }
    })

    items.value = res.workflows || []
    total.value = Number(res.pagination?.total || 0)
  } catch (error: any) {
    errorMessage.value = error?.data?.statusMessage || error?.message || 'Gagal memuat workflow history.'
  } finally {
    loading.value = false
  }
}

async function nextPage() {
  if (offset.value + pageSize.value >= total.value) {
    return
  }
  offset.value += pageSize.value
  await loadHistory()
}

async function prevPage() {
  if (offset.value === 0) {
    return
  }
  offset.value = Math.max(0, offset.value - pageSize.value)
  await loadHistory()
}

function formatDate(value: string) {
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
        <h1>Workflow History</h1>
        <button class="button ghost small" type="button" :disabled="loading" @click="loadHistory">
          Refresh
        </button>
      </div>

      <p v-if="errorMessage" class="error">{{ errorMessage }}</p>
      <p v-if="loading" class="muted">Loading...</p>
      <p v-else-if="items.length === 0" class="muted">Belum ada workflow tersimpan.</p>

      <section v-else class="list">
        <article v-for="item in items" :key="item.id" class="row">
          <div class="row-main">
            <NuxtLink class="title" :to="`/workflows/${item.id}`">{{ item.title }}</NuxtLink>
            <p class="meta">{{ item.topic }}</p>
            <p class="meta">
              Step {{ item.step_count }} | Exec {{ item.total_executions }} (OK {{ item.success_executions }} / ERR
              {{ item.failed_executions }})
            </p>
            <p class="meta">
              Tokens total {{ item.total_tokens }} | in {{ item.total_input_tokens }} | out {{ item.total_output_tokens }}
            </p>
          </div>
          <div class="row-side">
            <span class="badge">{{ item.status }}</span>
            <small class="meta">{{ formatDate(item.updated_at) }}</small>
            <NuxtLink class="quick-link" :to="`/?workflowId=${item.id}`">Execute / Edit</NuxtLink>
          </div>
        </article>
      </section>

      <div class="pager">
        <button class="button small ghost" type="button" :disabled="offset === 0 || loading" @click="prevPage">
          Prev
        </button>
        <span>Page {{ currentPage }} / {{ totalPages }}</span>
        <button
          class="button small ghost"
          type="button"
          :disabled="offset + pageSize >= total || loading"
          @click="nextPage"
        >
          Next
        </button>
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

.list {
  margin-top: 1rem;
  display: grid;
  gap: 0.7rem;
}

.row {
  border: 1px solid #e5e7eb;
  border-radius: 10px;
  padding: 0.8rem;
  display: flex;
  justify-content: space-between;
  gap: 1rem;
}

.row-main {
  min-width: 0;
}

.row-side {
  text-align: right;
  display: grid;
  gap: 0.45rem;
  align-content: start;
}

.quick-link {
  color: #1d4ed8;
  font-size: 0.85rem;
  text-decoration: none;
}

.title {
  font-weight: 700;
  color: #111827;
  text-decoration: none;
}

.meta {
  margin: 0.2rem 0 0;
  color: #4b5563;
}

.muted {
  margin-top: 0.8rem;
  color: #6b7280;
}

.error {
  margin-top: 0.8rem;
  color: #b91c1c;
}

.badge {
  padding: 0.18rem 0.55rem;
  border-radius: 999px;
  background: #e5e7eb;
  font-size: 0.75rem;
  font-weight: 700;
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

.pager {
  margin-top: 1rem;
  display: flex;
  justify-content: flex-end;
  align-items: center;
  gap: 0.75rem;
}
</style>
