import axios from 'axios'
import { ElMessage } from 'element-plus'
import { useUserStore } from '@/stores/user'

const service = axios.create({ baseURL: import.meta.env.VITE_API_BASE_URL || '/api', timeout: 10000 })
service.interceptors.request.use(config => {
  const user = useUserStore()
  if (user.token) config.headers.Authorization = `Bearer ${user.token}`
  if (user.currentStoreId) config.headers['X-Store-Id'] = user.currentStoreId
  return config
})
service.interceptors.response.use(response => {
  const result = response.data
  if (result.code === 200) return result.data
  if (!response.config.silent) ElMessage.error(result.message || '请求失败，请重试')
  if (result.code === 401) useUserStore().logout()
  const error = new Error(result.message || '请求失败')
  error.definitive = [400, 401, 403, 409, 422].includes(result.code)
  return Promise.reject(error)
}, error => {
  if (!error.config?.silent) ElMessage.error(error.response?.data?.message || (error.response?.status === 403 ? '您没有此操作的权限，请联系店长' : '连接失败，请检查服务后重试'))
  if (error.response?.status === 401) useUserStore().logout()
  return Promise.reject(error)
})
export default service
