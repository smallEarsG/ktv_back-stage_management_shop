<script setup>
import { onBeforeUnmount, onMounted, ref } from 'vue'
import request from '@/lib/request'
import { auditSummary, auditActionLabels } from '@/lib/governance'
const rows = ref([]), total = ref(0), page = ref(1), action = ref(''), loading = ref(false), error = ref('')
const labels = auditActionLabels
let generation = 0
async function load() { const version = ++generation; loading.value = true; error.value = ''; try { const result = await request.get('/audit', { params: { page: page.value, action: action.value || undefined } }); if (version === generation) { rows.value = result.list; total.value = result.total } } catch (e) { if (version === generation) error.value = e.message } finally { if (version === generation) loading.value = false } }
async function search() { page.value = 1; await load() }
onMounted(load); onBeforeUnmount(() => { generation++ })
</script>
<template>
  <div class="py-4"><p class="mb-3 text-sm text-slate-600">近30天本店操作记录，包含产品授权、应用停启、服务期限及账号操作，不显示密码或秘钥。</p><div class="flex flex-wrap items-center gap-3"><el-select v-model="action" placeholder="全部操作" aria-label="操作类型" class="w-52" :disabled="loading" @change="search"><el-option label="全部操作" value="" /><el-option v-for="(label, value) in labels" :key="value" :label="label" :value="value" /></el-select><el-button :loading="loading" @click="load">刷新记录</el-button></div><el-alert v-if="error" :title="error" type="error" :closable="false" class="mt-3" /><el-table v-loading="loading" :data="rows" class="mt-4"><el-table-column prop="createdAt" label="时间" min-width="170" /><el-table-column label="操作人" min-width="150"><template #default="{ row }">{{ row.actorName }} · #{{ row.actorId }}</template></el-table-column><el-table-column label="操作" min-width="130"><template #default="{ row }">{{ labels[row.action] || row.action }}</template></el-table-column><el-table-column label="对象编号" min-width="110"><template #default="{ row }">#{{ row.targetId }}</template></el-table-column><el-table-column prop="reason" label="原因" min-width="180" /><el-table-column label="变更内容" min-width="240"><template #default="{ row }">{{ auditSummary(row) }}</template></el-table-column></el-table><el-pagination v-model:current-page="page" :total="total" :page-size="20" layout="total, prev, pager, next" class="mt-4" @current-change="load" /></div>
</template>
