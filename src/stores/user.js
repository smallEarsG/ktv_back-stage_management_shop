import { defineStore } from 'pinia'
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import request from '@/lib/request'
import { authStorage } from '@/lib/auth-storage'
import { findProduct, productAccessible, productTradable, firstProductPath } from '@/lib/products'

export const useUserStore = defineStore('user', () => {
  const token = ref(authStorage.getItem('token'))
  const currentStoreId = ref(authStorage.getItem('currentStoreId') || '')
  
  // Initialize userInfo
  let storedUserInfo = null
  try {
    storedUserInfo = authStorage.getItem('userInfo') ? JSON.parse(authStorage.getItem('userInfo')) : null
  } catch (e) {
    storedUserInfo = null
  }

  const userInfo = ref(storedUserInfo)
  const permissions = ref(userInfo.value?.permissions || []) 
  const products = ref([]), productsReady = ref(false), productsError = ref('')
  let productsRefresh = 0, productGeneration = 0
  const router = useRouter()

  async function refreshProducts(force = false) {
    if (!token.value || (!force && productsReady.value && Date.now() - productsRefresh < 30000)) return
    const generation = ++productGeneration
    try {
      const data = await request.get('/auth/products', { silent: true })
      if (generation !== productGeneration || !token.value) return
      if (!Array.isArray(data?.products)) throw new Error('未取得产品授权，请重新查询')
      products.value = data.products; productsReady.value = true; productsError.value = ''; productsRefresh = Date.now()
    } catch (e) {
      if (generation === productGeneration) { products.value = []; productsReady.value = false; productsError.value = e.message || '产品授权暂时无法查询，请重试' }
    }
  }
  const product = type => findProduct(products.value, type)
  const canAccessProduct = type => productsReady.value && productAccessible(product(type))
  const canTradeProduct = type => productsReady.value && productTradable(product(type))
  const homePath = () => firstProductPath(products.value, hasPermission)

  let lastRefresh = 0
  async function refresh(force = false) {
    if (!token.value || (!force && Date.now() - lastRefresh < 30000)) return
    const user = await request.get('/auth/user', { silent: true })
    userInfo.value = user
    permissions.value = user.permissions || []
    authStorage.setItem('userInfo', JSON.stringify(user))
    lastRefresh = Date.now()
  }

  async function login(loginForm) {
    try {
      const res = await request.post('/auth/login', {
        phone: loginForm.phone, // Convert phone to username for API
        password: loginForm.password
      })
      
      const accessToken = res?.token || res?.accessToken || res?.data?.token
      const user = res?.userInfo || res?.user || res?.data?.userInfo || res?.data?.user || {}
      const defaultStoreId = res?.defaultStoreId ?? res?.storeId ?? user?.storeId ?? res?.data?.defaultStoreId ?? res?.data?.storeId
      
      if (!accessToken) {
        throw new Error('登录响应缺少 token')
      }

      token.value = accessToken
      lastRefresh = 0
      userInfo.value = user
      permissions.value = user.permissions || []
      
      // Set current store ID
      if (defaultStoreId !== undefined && defaultStoreId !== null) {
        currentStoreId.value = defaultStoreId.toString()
        authStorage.setItem('currentStoreId', defaultStoreId)
      }
      
      authStorage.setItem('token', accessToken)
      authStorage.setItem('userInfo', JSON.stringify(user))
      products.value = []; productsReady.value = false; productsRefresh = 0
      await refreshProducts(true)
      return true
    } catch (error) {
      console.error('Login failed:', error)
      return false
    }
  }

  function logout() {
    productGeneration++; products.value = []; productsReady.value = false; productsError.value = ''; productsRefresh = 0
    lastRefresh = 0
    token.value = null
    userInfo.value = null
    permissions.value = []
    currentStoreId.value = ''
    authStorage.removeItem('token')
    authStorage.removeItem('userInfo')
    authStorage.removeItem('currentStoreId')
    router.replace('/login')
  }

  function hasPermission(permission) {
    if (Array.isArray(permission)) return permission.some(hasPermission)
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
      authStorage.setItem('userInfo', JSON.stringify(userInfo.value))
    }
  }

  return {
    token,
    currentStoreId,
    userInfo,
    permissions,
    products, productsReady, productsError, product, canAccessProduct, canTradeProduct, homePath, refreshProducts,
    login,
    logout,
    hasPermission,
    setPermissions,
    refresh
  }
})
