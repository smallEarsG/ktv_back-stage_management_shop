import { defineStore } from 'pinia'
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import request from '@/lib/request'
import { authStorage } from '@/lib/auth-storage'
import { findProduct, productAccessible, productTradable, firstProductPath } from '@/lib/products'
import { businessAllowed } from '@/lib/business'
import { hasAction, isV2Permissions } from '@/lib/permissions'

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
  let productsRefresh = 0, productGeneration = 0, sessionGeneration = 0, refreshGeneration = 0
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
  const canAccessProduct = type => productsReady.value && productAccessible(product(type)) && businessAllowed(userInfo.value?.role, permissions.value, type)
  const canTradeProduct = type => canAccessProduct(type) && productTradable(product(type))
  const homePath = () => firstProductPath(products.value.filter(p => businessAllowed(userInfo.value?.role, permissions.value, p.productType)), hasPermission)

  let lastRefresh = 0
  async function refresh(force = false) {
    if (!token.value || (!force && Date.now() - lastRefresh < 30000)) return
    const generation = ++refreshGeneration, session = sessionGeneration, expectedToken = token.value, expectedStore = currentStoreId.value
    const current = () => generation === refreshGeneration && session === sessionGeneration && token.value === expectedToken && currentStoreId.value === expectedStore
    try {
      const user = await request.get('/auth/user', { silent: true })
      if (!current()) return
      userInfo.value = user
      permissions.value = user.permissions || []
      authStorage.setItem('userInfo', JSON.stringify(user))
      lastRefresh = Date.now()
    } catch (error) { if (current()) throw error }
  }

  async function login(loginForm) {
    const session = ++sessionGeneration
    refreshGeneration++
    try {
      const res = await request.post('/auth/login', {
        phone: loginForm.phone, // Convert phone to username for API
        password: loginForm.password
      })
      if (session !== sessionGeneration) return false
      
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
    } catch { return false }
  }

  function logout() {
    sessionGeneration++; refreshGeneration++
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

  function hasPermission(permission, business, legacyPermission) {
    if (legacyPermission && !isV2Permissions(permissions.value)) permission = legacyPermission
    if (!permission) return true
    const path = router.currentRoute?.value?.path || ''
    const selected = (['DINING', 'MALL', 'COMMON', 'ALL'].includes(business) ? business : null) || (path.startsWith('/mall') ? 'MALL' : path === '/settings' || path.startsWith('/account') || path === '/services' ? 'COMMON' : path.startsWith('/reports') || path === '/overview' || path === '/login' || !path ? 'ALL' : 'DINING')
    if (selected === 'ALL') return ['DINING', 'MALL', 'COMMON'].some(type => (type === 'COMMON' || canAccessProduct(type)) && hasAction(userInfo.value?.role, permissions.value, type, permission))
    return hasAction(userInfo.value?.role, permissions.value, selected, permission)
  }
  function hasActionPermission(action, business, legacyPermission) {
    return hasPermission(isV2Permissions(permissions.value) ? action : legacyPermission, business)
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
    hasActionPermission,
    setPermissions,
    refresh
  }
})
