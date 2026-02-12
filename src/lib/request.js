import axios from 'axios'
import { ElMessage } from 'element-plus'
import { useUserStore } from '@/stores/user'

// Create axios instance
const service = axios.create({
  baseURL: '/api', // Base URL from documentation
  timeout: 10000 // Request timeout
})

// Request interceptor
service.interceptors.request.use(
  (config) => {
    const userStore = useUserStore()
    
    // Add Token to header
    if (userStore.token) {
      config.headers['Authorization'] = `Bearer ${userStore.token}`
    }
    
    // Add Store ID to header (Priority: Custom Config > Store > Default)
    const storeId = config.headers['X-Store-Id'] || userStore.currentStoreId || '1001'
    if (storeId) {
      config.headers['X-Store-Id'] = storeId
    }

    return config
  },
  (error) => {
    console.error('Request Error:', error)
    return Promise.reject(error)
  }
)

// Response interceptor
service.interceptors.response.use(
  (response) => {
    const res = response.data

    // Check custom code
    if (res.code !== 200) {
      ElMessage.error(res.message || 'Error')

      // Handle specific error codes (e.g., 401 Unauthorized)
      if (res.code === 401) {
        const userStore = useUserStore()
        userStore.logout()
        location.reload()
      }
      return Promise.reject(new Error(res.message || 'Error'))
    } else {
      return res.data
    }
  },
  (error) => {
    console.error('Response Error:', error)
    ElMessage.error(error.message || 'Request Failed')
    return Promise.reject(error)
  }
)

export default service
