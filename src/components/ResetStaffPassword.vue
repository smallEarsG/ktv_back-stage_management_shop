<script setup>
import { onBeforeUnmount, reactive, ref, watch } from 'vue'
import request from '@/lib/request'
import { ElMessage } from 'element-plus'
const props = defineProps({ staff: { type: Object, default: null } }), emit = defineEmits(['close'])
const busy = ref(false), error = ref(''), form = reactive({ operatorPassword: '', newPassword: '', confirmPassword: '', reason: '', confirmed: false })
function wipe() { Object.assign(form, { operatorPassword: '', newPassword: '', confirmPassword: '', reason: '', confirmed: false }); error.value = '' }
watch(() => props.staff?.id, wipe)
onBeforeUnmount(wipe)
function close() { if (!busy.value) { wipe(); emit('close') } }
async function submit() {
  if (busy.value || !props.staff) return
  if (!form.operatorPassword || !form.reason.trim() || !form.confirmed || form.newPassword.length < 8 || new TextEncoder().encode(form.newPassword).length > 72 || form.newPassword !== form.confirmPassword) { error.value = '请验证本人密码，填写原因并确认至少8位的新密码'; return }
  busy.value = true; error.value = ''
  try { await request.post(`/users/${props.staff.id}/reset-password`, { ...form }); ElMessage.success('员工密码已重置，旧登录失效，员工下次登录须先改密'); wipe(); emit('close') }
  catch (e) { error.value = e.message || '结果未确认，请核对操作记录' }
  finally { busy.value = false; form.operatorPassword = ''; form.newPassword = ''; form.confirmPassword = '' }
}
</script>
<template>
  <el-dialog :model-value="!!staff" title="重置员工密码" width="min(520px, 92vw)" :close-on-click-modal="!busy" :show-close="!busy" @update:model-value="value => { if (!value) close() }"><p class="mb-4">员工：{{ staff?.name }} · {{ staff?.username }} · #{{ staff?.id }}</p><el-form label-position="top" :disabled="busy" @submit.prevent="submit"><el-form-item label="当前店长本人的密码"><el-input v-model="form.operatorPassword" type="password" autocomplete="current-password" /></el-form-item><el-form-item label="临时新密码（至少8位）"><el-input v-model="form.newPassword" type="password" autocomplete="new-password" /></el-form-item><el-form-item label="确认临时密码"><el-input v-model="form.confirmPassword" type="password" autocomplete="new-password" /></el-form-item><el-form-item label="重置原因"><el-input v-model="form.reason" maxlength="255" /></el-form-item><el-checkbox v-model="form.confirmed">已核对员工，确认使该账号旧登录全部失效</el-checkbox><p v-if="error" role="alert" class="mt-3 text-sm text-red-700">{{ error }}</p></el-form><template #footer><el-button :disabled="busy" @click="close">取消</el-button><el-button type="primary" :loading="busy" @click="submit">确认重置</el-button></template></el-dialog>
</template>
