<script setup>
import { watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useUserStore } from '@/stores/user'

const route = useRoute()
const router = useRouter()
const userStore = useUserStore()

// Watch for permission changes
watch(
  () => [userStore.token, userStore.permissions, route.meta.permission, route.path],
  () => {
    if (!userStore.token) return
    if (route.path === '/login' || route.path === '/403') return
    const requiredPermission = route.meta.permission
    if (requiredPermission && !userStore.hasPermission(requiredPermission)) {
      router.replace('/403')
    }
  },
  { deep: true }
)
</script>

<template>
  <router-view />
</template>
