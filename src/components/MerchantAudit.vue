<script setup>
import { onBeforeUnmount, onMounted, ref } from 'vue'
import request from '@/lib/request'
import { auditSummary } from '@/lib/governance'
const rows = ref([]), total = ref(0), page = ref(1), loading = ref(false), error = ref('')
const labels = { ACCOUNT_CHANGE: '本人改密', ACCOUNT_RESET: '受控重置密码', STAFF_CREATE: '新增员工', STAFF_DELETE: '删除员工', STAFF_PERMISSIONS: '变更员工权限', STAFF_STATUS: '变更员工状态', MERCHANT_CREATE: '开通商户', MERCHANT_ENABLE: '启用商户', MERCHANT_DISABLE: '停用商户', SERVICE_TERM: '调整服务期限' }
let generation = 0
async function load() { const version = ++generation; loading.value = true; error.value = ''; try { const result = await request.get('/audit', { params: { page: page.value } }); if (version === generation) { rows.value = result.list; total.value = result.total } } catch (e) { if (version === generation) error.value = e.message } finally { if (version === generation) loading.value = false } }
onMounted(load); onBeforeUnmount(() => { generation++ })
</script>
<template>
  <div class="py-4"><p class="mb-3 text-sm text-slate-600">近30天本店操作记录，包含平台对本店的停启、服务期限及密码重置操作，不显示密码或秘钥。</p><el-button :loading="loading" @click="load">刷新记录</el-button><el-alert v-if="error" :title="error" type="error" :closable="false" class="mt-3" /><el-table v-loading="loading" :data="rows" class="mt-4"><el-table-column prop="createdAt" label="时间" min-width="170" /><el-table-column label="操作人" min-width="150"><template #default="{ row }">{{ row.actorName }} · #{{ row.actorId }}</template></el-table-column><el-table-column label="操作" min-width="130"><template #default="{ row }">{{ labels[row.action] || row.action }}</template></el-table-column><el-table-column label="对象编号" min-width="110"><template #default="{ row }">#{{ row.targetId }}</template></el-table-column><el-table-column prop="reason" label="原因" min-width="180" /><el-table-column label="变更内容" min-width="240"><template #default="{ row }">{{ auditSummary(row) }}</template></el-table-column></el-table><el-pagination v-model:current-page="page" :total="total" :page-size="20" layout="total, prev, pager, next" class="mt-4" @current-change="load" /></div>
</template>
