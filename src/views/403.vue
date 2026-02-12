<script setup>
import { useRouter } from 'vue-router'

const router = useRouter()

const goBack = () => {
  router.back()
}

const goHome = () => {
  router.push('/')
}
</script>

<template>
  <div class="h-screen w-full flex flex-col items-center justify-center bg-slate-50">
    <div class="text-9xl font-bold text-slate-200">403</div>
    <div class="text-2xl font-medium text-slate-600 mt-4">抱歉，您没有权限访问该页面</div>
    <div class="text-slate-400 mt-2">如有需要，请联系管理员开通权限</div>
    
    <div class="mt-8 flex gap-4">
      <el-button @click="goBack">返回上一页</el-button>
      <el-button type="primary" @click="goHome">返回首页</el-button>
    </div>
  </div>
</template>
