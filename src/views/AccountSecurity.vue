<script setup>
import { onBeforeUnmount, reactive, ref } from 'vue'
import { useUserStore } from '@/stores/user'
import request from '@/lib/request'
import { ElMessage } from 'element-plus'
const user = useUserStore(), busy = ref(false), error = ref('')
const form = reactive({ currentPassword: '', newPassword: '', confirmPassword: '' })
onBeforeUnmount(() => { Object.assign(form, { currentPassword: '', newPassword: '', confirmPassword: '' }) })
async function submit() {
  if (busy.value) return
  if (!form.currentPassword || form.newPassword.length < 8 || new TextEncoder().encode(form.newPassword).length > 72 || form.newPassword !== form.confirmPassword) { error.value = '请填写原密码，设置至少8位的新密码并保持两次输入一致'; return }
  busy.value = true; error.value = ''
  try { await request.post('/auth/password', { ...form }); ElMessage.success('密码已修改，请使用新密码重新登录'); user.logout() }
  catch (e) { error.value = e.message || '修改结果未确认，请用新密码登录核对' }
  finally { busy.value = false; Object.assign(form, { currentPassword: '', newPassword: '', confirmPassword: '' }) }
}
</script>
<template>
  <section class="max-w-xl rounded-xl bg-white p-5"><h1 class="mb-4 text-2xl font-semibold">修改密码</h1><el-alert :title="user.userInfo?.passwordChangeRequired ? '请先修改初始或临时密码，再继续营业操作。' : '修改后当前账号的旧登录全部失效，请重新登录。'" type="info" :closable="false" class="mb-4" /><el-form label-position="top" :disabled="busy" @submit.prevent="submit"><el-form-item label="原密码"><el-input v-model="form.currentPassword" type="password" autocomplete="current-password" /></el-form-item><el-form-item label="新密码（至少8位）"><el-input v-model="form.newPassword" type="password" autocomplete="new-password" /></el-form-item><el-form-item label="确认新密码"><el-input v-model="form.confirmPassword" type="password" autocomplete="new-password" /></el-form-item><p v-if="error" role="alert" class="mb-4 text-sm text-red-700">{{ error }}</p><el-button type="primary" native-type="submit" :loading="busy">修改并重新登录</el-button></el-form></section>
</template>
