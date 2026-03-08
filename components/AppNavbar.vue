<script setup lang="ts">
import type { ClientAuthUser } from '~/utils/auth-session'

defineProps<{
  currentUser: ClientAuthUser | null
}>()

defineEmits<{
  logout: []
}>()
</script>

<template>
  <div class="navbar">
    <nav class="nav-menu">
      <NuxtLink to="/">Workflow Runner</NuxtLink>
      <NuxtLink to="/workflows">My Workflows</NuxtLink>
      <NuxtLink to="/analytics">Analytics</NuxtLink>
    </nav>
    <div class="nav-user">
      <span>{{ currentUser?.full_name || currentUser?.email }}</span>
      <button class="button small ghost" type="button" @click="$emit('logout')">Logout</button>
    </div>
  </div>
</template>

<style scoped>
.navbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 0.75rem;
  margin-bottom: 0.6rem;
  flex-wrap: wrap;
}

.nav-menu {
  display: flex;
  align-items: center;
  gap: 0.8rem;
}

.nav-user {
  display: flex;
  align-items: center;
  gap: 0.6rem;
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
</style>
