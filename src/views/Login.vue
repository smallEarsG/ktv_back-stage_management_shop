<script setup>
import { ref, reactive } from 'vue'
import { useRouter } from 'vue-router'
import { useUserStore } from '@/stores/user'
import { ElMessage } from 'element-plus'
import { Iphone, Lock } from '@element-plus/icons-vue'

const router = useRouter()
const userStore = useUserStore()

const loading = ref(false)
const form = reactive({
  phone: '',
  password: ''
})

const handleLogin = async () => {
  if (!form.phone || !form.password) {
    ElMessage.warning('请输入手机号和密码')
    return
  }
  
  loading.value = true
  try {
    const success = await userStore.login({
      phone: form.phone,
      password: form.password
    })
    
    if (success) {
      ElMessage.success('登录成功')
      router.push('/dashboard')
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
        <h1 class="text-3xl font-bold text-slate-800">KTV 商户后台</h1>
        <p class="text-slate-500 mt-2">请登录您的账户</p>
      </div>
      
      <el-form :model="form" @submit.prevent="handleLogin">
        <el-form-item>
          <el-input 
            v-model="form.phone" 
            placeholder="手机号" 
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
        
        <div class="mt-4 text-center text-sm text-slate-400">
          测试账号: 13800138000 / password123
        </div>
      </el-form>
    </div>
  </div>
</template>
