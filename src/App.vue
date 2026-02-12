<script setup>
import { watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useUserStore } from '@/stores/user'

const route = useRoute()
const router = useRouter()
const userStore = useUserStore()

// Watch for permission changes
watch(
  () => userStore.permissions,
  (newPermissions) => {
    // Check if the current route requires a permission
    const requiredPermission = route.meta.permission
    
    if (requiredPermission && !userStore.hasPermission(requiredPermission)) {
      // If user lost the permission for the current page, redirect to 403
      router.push('/403')
    }
  },
  { deep: true }
)
</script>

<template>
  <router-view />
</template>