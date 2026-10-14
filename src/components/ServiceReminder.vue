<script setup>
import { onBeforeUnmount, onMounted, ref } from 'vue'
import request from '@/lib/request'
const service = ref(null), error = ref('')
let timer, disposed = false
async function load() { try { const data = await request.get('/auth/service', { silent: true }); if (!disposed) { service.value = data; error.value = '' } } catch { if (!disposed) error.value = '服务期限暂时无法查询，请刷新核对' } }
onMounted(() => { load(); timer = setInterval(load, 60000) }); onBeforeUnmount(() => { disposed = true; clearInterval(timer) })
</script>
<template>
  <el-alert v-if="error" :title="error" type="warning" :closable="false" class="mb-4"><el-button link @click="load">重新查询</el-button></el-alert><el-alert v-else-if="service?.status === 'EXPIRED' || service?.status === 'EXPIRING'" :type="service.status === 'EXPIRED' ? 'error' : 'warning'" :closable="false" class="mb-4" :title="service.status === 'EXPIRED' ? `门店服务已于 ${service.expiresOn} 到期，请联系平台续费。新增消费已暂停，历史账单仍可结账、退款。` : `门店服务将于 ${service.expiresOn} 到期（剩余 ${service.daysRemaining} 天），请联系平台办理续费。`" />
</template>
