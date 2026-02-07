import { defineStore } from 'pinia'
import { ref } from 'vue'
import { useRouter } from 'vue-router'

export const useUserStore = defineStore('user', () => {
  const token = ref<string | null>(localStorage.getItem('token'))
  const userInfo = ref<any>(null)
  const router = useRouter()

  function login(mockToken: string, user: any) {
    token.value = mockToken
    userInfo.value = user
    localStorage.setItem('token', mockToken)
  }

  function logout() {
    token.value = null
    userInfo.value = null
    localStorage.removeItem('token')
    // Note: router might not be available here directly depending on when store is used, 
    // but usually it's fine if called from component.
  }

  return {
    token,
    userInfo,
    login,
    logout
  }
})
