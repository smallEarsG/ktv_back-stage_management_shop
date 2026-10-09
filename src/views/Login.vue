<script setup>
import { ref, reactive } from 'vue'
import { useRouter } from 'vue-router'
import { useUserStore } from '@/stores/user'
import { ElMessage } from 'element-plus'
import { Iphone, Lock } from '@element-plus/icons-vue'

const router = useRouter()
const userStore = useUserStore()
const demoMode = import.meta.env.VITE_DEMO_MODE === 'true'
const demoAccount = import.meta.env.VITE_DEMO_ACCOUNT || 'merchant-local'
const demoPassword = import.meta.env.VITE_DEMO_PASSWORD || 'LocalDemo123!'

const loading = ref(false)
const form = reactive({
  phone: '',
  password: ''
})

const firstAllowedPath = () => {
  const nav = [
    { path: '/workbench', permission: 'workbench:view' },
    { path: '/pos/index', permission: 'pos:view' },
    { path: '/workbench', permission: 'workbench:view' },
    { path: '/orders', permission: 'order:view' },
    { path: '/products', permission: 'product:view' },
    { path: '/refunds', permission: 'refund:view' },
    { path: '/finance', permission: 'finance:view' },
    { path: '/warehouse', permission: 'warehouse:view' },
    { path: '/settings', permission: 'settings:view' }
  ]
  const hit = nav.find(i => userStore.hasPermission(i.permission))
  return hit?.path || ''
}

const handleLogin = async () => {
  if (loading.value) return
  if (!form.phone || !form.password) {
    ElMessage.warning('请输入账号和密码')
    return
  }
  
  loading.value = true
  try {
    const success = await userStore.login({
      phone: form.phone,
      password: form.password
    })
    
    if (success) {
      const target = firstAllowedPath()
      if (!target) {
        ElMessage.warning('该账号无权限，请联系管理员')
        router.replace('/403')
        return
      }
      ElMessage.success('登录成功')
      router.replace(target)
    }
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="h-screen w-full flex items-center justify-center bg-slate-900">
    <div class="w-full max-w-md p-8 bg-white rounded-lg shadow-lg">
      <div class="text-center mb-8">
        <h1 class="text-3xl font-bold text-slate-800">商户后台</h1>
        <p class="text-slate-500 mt-2">请登录您的账户</p>
      </div>
      
      <el-form :model="form" @submit.prevent="handleLogin">
        <el-form-item>
          <el-input 
            v-model="form.phone" 
            placeholder="账号 / 手机号"
            :prefix-icon="Iphone"
            size="large"
          />
        </el-form-item>
        
        <el-form-item>
          <el-input 
            v-model="form.password" 
            type="password" 
            placeholder="密码" 
            :prefix-icon="Lock"
            size="large"
            show-password
            @keyup.enter="handleLogin"
          />
        </el-form-item>
        
        <el-button 
          type="primary" 
          class="w-full mt-4" 
          size="large" 
          :loading="loading"
          @click="handleLogin"
        >
          登录
        </el-button>
        
        <div v-if="demoMode" class="mt-4 text-center text-sm text-slate-400">
          演示账号：{{ demoAccount }} / {{ demoPassword }}
        </div>
      </el-form>
    </div>
  </div>
</template>
