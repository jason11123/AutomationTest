<script setup lang="ts">
import { clearAuthSession, readAuthSession, type ClientAuthUser } from '~/utils/auth-session'

definePageMeta({
  middleware: 'auth'
})

type SummaryRow = {
  total_calls: number
  input_tokens: number
  output_tokens: number
  total_tokens: number
  cached_tokens: number
}

type TokenSummaryResponse = {
  overview: SummaryRow
  byDay: Array<SummaryRow & { day: string }>
  byWorkflow: Array<SummaryRow & { workflow_id: string | null; workflow_title: string }>
  byDayWorkflow: Array<SummaryRow & { day: string; workflow_id: string | null; workflow_title: string }>
}

const currentUser = ref<ClientAuthUser | null>(null)
const loading = ref(false)
const errorMessage = ref('')
const dateFrom = ref('')
const dateTo = ref('')
const data = ref<TokenSummaryResponse | null>(null)

if (process.client) {
  currentUser.value = readAuthSession()?.user || null
}

onMounted(async () => {
  await loadSummary()
})

async function loadSummary() {
  if (!currentUser.value?.id) {
    return
  }

  loading.value = true
  errorMessage.value = ''
  try {
    data.value = await $fetch<TokenSummaryResponse>('/api/analytics/token-summary', {
      query: {
        userId: currentUser.value.id,
        dateFrom: dateFrom.value || undefined,
        dateTo: dateTo.value || undefined
      },
      headers: {
        'x-user-id': currentUser.value.id
      }
    })
  } catch (error: any) {
    errorMessage.value = error?.data?.statusMessage || error?.message || 'Gagal memuat analytics.'
  } finally {
    loading.value = false
  }
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
        <h1>Token Analytics</h1>
      </div>

      <form class="filters" @submit.prevent="loadSummary">
        <label>
          Date From
          <input v-model="dateFrom" type="date" />
        </label>
        <label>
          Date To
          <input v-model="dateTo" type="date" />
        </label>
        <button class="button small" type="submit" :disabled="loading">{{ loading ? 'Loading...' : 'Apply' }}</button>
      </form>

      <p v-if="errorMessage" class="error">{{ errorMessage }}</p>
      <p v-if="loading" class="muted">Loading...</p>

      <template v-if="data">
        <section class="overview">
          <h2>Overview</h2>
          <p>
            Calls {{ data.overview.total_calls }} | Total {{ data.overview.total_tokens }} | Input
            {{ data.overview.input_tokens }} | Output {{ data.overview.output_tokens }} | Cached
            {{ data.overview.cached_tokens }}
          </p>
        </section>

        <section class="table-wrap">
          <h2>By Day</h2>
          <table>
            <thead>
              <tr>
                <th>Day</th>
                <th>Calls</th>
                <th>Total</th>
                <th>Input</th>
                <th>Output</th>
                <th>Cached</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="row in data.byDay" :key="row.day">
                <td>{{ row.day }}</td>
                <td>{{ row.total_calls }}</td>
                <td>{{ row.total_tokens }}</td>
                <td>{{ row.input_tokens }}</td>
                <td>{{ row.output_tokens }}</td>
                <td>{{ row.cached_tokens }}</td>
              </tr>
            </tbody>
          </table>
        </section>

        <section class="table-wrap">
          <h2>By Workflow</h2>
          <table>
            <thead>
              <tr>
                <th>Workflow</th>
                <th>Calls</th>
                <th>Total</th>
                <th>Input</th>
                <th>Output</th>
                <th>Cached</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="row in data.byWorkflow" :key="`${row.workflow_id || 'none'}`">
                <td>{{ row.workflow_title }}</td>
                <td>{{ row.total_calls }}</td>
                <td>{{ row.total_tokens }}</td>
                <td>{{ row.input_tokens }}</td>
                <td>{{ row.output_tokens }}</td>
                <td>{{ row.cached_tokens }}</td>
              </tr>
            </tbody>
          </table>
        </section>
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

.filters {
  margin-top: 0.8rem;
  display: flex;
  flex-wrap: wrap;
  gap: 0.8rem;
  align-items: end;
}

label {
  display: grid;
  gap: 0.35rem;
  color: #374151;
}

input {
  border: 1px solid #d1d5db;
  border-radius: 8px;
  padding: 0.45rem 0.6rem;
  font: inherit;
}

.overview {
  margin-top: 1rem;
  border: 1px solid #e5e7eb;
  border-radius: 10px;
  padding: 0.8rem;
}

.table-wrap {
  margin-top: 1rem;
}

table {
  width: 100%;
  border-collapse: collapse;
  background: #fff;
}

th,
td {
  border: 1px solid #e5e7eb;
  padding: 0.45rem 0.55rem;
  text-align: left;
  font-size: 0.92rem;
}

th {
  background: #f8fafc;
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

.button.small {
  padding: 0.35rem 0.7rem;
  font-size: 0.82rem;
}

.error {
  margin-top: 0.8rem;
  color: #b91c1c;
}

.muted {
  margin-top: 0.8rem;
  color: #6b7280;
}
</style>
