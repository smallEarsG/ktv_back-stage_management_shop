import { defineStore } from 'pinia'
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import request from '@/lib/request'

export const useUserStore = defineStore('user', () => {
  const token = ref(localStorage.getItem('token'))
  const currentStoreId = ref(localStorage.getItem('currentStoreId') || '')
  
  // Initialize userInfo
  let storedUserInfo = null
  try {
    storedUserInfo = localStorage.getItem('userInfo') ? JSON.parse(localStorage.getItem('userInfo')) : null
  } catch (e) {
    storedUserInfo = null
  }

  // MOCK: Ensure permissions exist on restore (for development/demo)
  if (storedUserInfo && !storedUserInfo.permissions) {
    storedUserInfo.permissions = [
      'dashboard:view',
      'order:view',
      'product:view',
      'refund:view',
      'finance:view',
      'warehouse:view',
      'settings:view'
    ]
  }

  const userInfo = ref(storedUserInfo)
  const permissions = ref(userInfo.value?.permissions || []) 
  const router = useRouter()

  async function login(loginForm) {
    try {
      const res = await request.post('/auth/login', {
        phone: loginForm.phone, // Convert phone to username for API
        password: loginForm.password
      })
      
      const accessToken = res?.token || res?.accessToken || res?.data?.token
      const user = res?.userInfo || res?.user || res?.data?.userInfo || res?.data?.user || {}
      const defaultStoreId = res?.defaultStoreId ?? res?.storeId ?? user?.storeId ?? res?.data?.defaultStoreId ?? res?.data?.storeId
      
      // MOCK: Ensure user has permissions. 
      // If the backend doesn't return permissions yet, we'll assign a default set for demonstration.
      if (!user.permissions) {
        user.permissions = [
          'dashboard:view',
          'order:view',
          'product:view',
          'refund:view',
          'finance:view',
          'warehouse:view',
          'settings:view'
        ]
      }
      
      // MOCK: Ensure user has role
      if (!user.role) {
        user.role = 'admin'
      }

      if (!accessToken) {
        throw new Error('登录响应缺少 token')
      }

      token.value = accessToken
      userInfo.value = user
      permissions.value = user.permissions
      
      // Set current store ID
      if (defaultStoreId !== undefined && defaultStoreId !== null) {
        currentStoreId.value = defaultStoreId.toString()
        localStorage.setItem('currentStoreId', defaultStoreId)
      }
      
      localStorage.setItem('token', accessToken)
      localStorage.setItem('userInfo', JSON.stringify(user))
      return true
    } catch (error) {
      console.error('Login failed:', error)
      return false
    }
  }

  function logout() {
    token.value = null
    userInfo.value = null
    permissions.value = []
    currentStoreId.value = ''
    localStorage.removeItem('token')
    localStorage.removeItem('userInfo')
    localStorage.removeItem('currentStoreId')
  }

  function hasPermission(permission) {
    // Admin has full access
    if (userInfo.value?.role === 'admin') return true
    
    if (!permission) return true
    return permissions.value.includes(permission)
  }

  function setPermissions(newPermissions) {
    permissions.value = newPermissions
    // Update userInfo as well to keep them in sync
    if (userInfo.value) {
      userInfo.value.permissions = newPermissions
      localStorage.setItem('userInfo', JSON.stringify(userInfo.value))
    }
  }

  return {
    token,
    currentStoreId,
    userInfo,
    permissions,
    login,
    logout,
    hasPermission,
    setPermissions
  }
})
