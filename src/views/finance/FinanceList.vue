<script setup>
import { computed, ref, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Download, Refresh, Search } from '@element-plus/icons-vue'
import { ElMessage } from 'element-plus'
import axios from 'axios'
import dayjs from 'dayjs'
import TimeRangePicker from '@/components/TimeRangePicker.vue'
import { useFinanceResource } from '@/composables/useFinanceResource'
import { useUserStore } from '@/stores/user'
import { numeric, formatMoney, formatTime, paymentMethods, paymentLabel, initialFinanceRange, financeParams, financeRouteQuery } from '@/lib/finance'
import './finance.css'

const route = useRoute(), router = useRouter(), userStore = useUserStore()
const dateRange = ref(initialFinanceRange(route.query))
const hadInitialRange = dateRange.value.length === 2
const currentLabel = ref(hadInitialRange ? '自定义' : '今日')
const flowType = ref(['income', 'refund'].includes(route.query.type) ? route.query.type : '')
const method = Number(route.query.payMethod)
const payMethod = ref(route.query.payMethod !== undefined && paymentMethods.some(item => item.value === method) ? method : '')
const keyword = ref('')
const appliedFilters = ref({ type: flowType.value, payMethod: payMethod.value, keyword: '' })
const page = ref(1), pageSize = ref(20), exporting = ref(false), dialogVisible = ref(false), selectedFlow = ref(null)
const flows = useFinanceResource('/finance/flows')
const detail = useFinanceResource(params => `/finance/flows/${params.type}/${params.id}`)
const total = ref(0)
const transactions = computed(() => flows.data?.list || [])
const filtersDirty = computed(() => keyword.value.trim() !== appliedFilters.value.keyword)
const periodText = computed(() => dateRange.value.length === 2 ? `${dayjs(dateRange.value[0]).format('YYYY-MM-DD')} 至 ${dayjs(dateRange.value[1]).format('YYYY-MM-DD')}` : '今日')
const buildParams = (pagination = true) => ({
  ...financeParams(dateRange.value, currentLabel.value),
  type: appliedFilters.value.type || undefined,
  payMethod: appliedFilters.value.payMethod === '' ? undefined : appliedFilters.value.payMethod,
  keyword: appliedFilters.value.keyword || undefined,
  ...(pagination ? { page: page.value, pageSize: pageSize.value } : {})
})
const fetchFlows = async (clear = false) => {
  const success = await flows.load(buildParams(), clear)
  if (success) total.value = numeric(flows.data?.total)
  return success
}
// Keep the known total while loading another page so pagination does not reset to page one.
const resetFlows = () => { page.value = 1; total.value = 0; return fetchFlows(true) }
const applyFilters = () => { appliedFilters.value = { type: flowType.value, payMethod: payMethod.value ?? '', keyword: keyword.value.trim() }; return resetFlows() }
const changeRange = () => resetFlows()
const changePage = value => { if (page.value === value) return; page.value = value; return fetchFlows(true) }
const changePageSize = value => { pageSize.value = value; return resetFlows() }
const openDetail = row => { selectedFlow.value = { type: row.type, id: row.id }; dialogVisible.value = true; return detail.load(selectedFlow.value, true) }
const retryDetail = () => detail.load(selectedFlow.value)
const openOverview = () => router.push({ path: '/finance/overview', query: financeRouteQuery(dateRange.value) })
const flowAmount = row => `${row.type === 'income' ? '+' : '−'}${formatMoney(Math.abs(numeric(row.amount)))}`
const itemAttributes = item => {
  const attrs = item.selectedAttrs
  if (!attrs || typeof attrs !== 'object') return ''
  return Object.entries(attrs).map(([key, value]) => `${key}：${Array.isArray(value) ? value.join('/') : value}`).join('，')
}

const exportFlows = async () => {
  if (exporting.value) return
  exporting.value = true
  const params = buildParams(false)
  try {
    const res = await axios.get(`${import.meta.env.VITE_API_BASE_URL || '/api'}/finance/flows/export`, {
      params, responseType: 'blob',
      headers: { Authorization: userStore.token ? `Bearer ${userStore.token}` : '', 'X-Store-Id': userStore.currentStoreId || '' }
    })
    if (res.headers['content-type']?.includes('json')) throw new Error(JSON.parse(await res.data.text()).message || '导出失败')
    const url = window.URL.createObjectURL(new Blob([res.data], { type: 'text/csv;charset=utf-8;' }))
    const a = document.createElement('a')
    a.href = url; a.download = `资金流水-${dayjs().format('YYYYMMDDHHmmss')}.csv`
    document.body.appendChild(a); a.click(); a.remove(); window.URL.revokeObjectURL(url)
    ElMessage.success('导出成功')
  } catch (error) {
    let message = error.message || '导出失败'
    if (error.response?.data instanceof Blob) { try { message = JSON.parse(await error.response.data.text()).message || message } catch { /* Retain the original error. */ } }
    ElMessage.error(message)
  } finally { exporting.value = false }
}
onMounted(() => { if (hadInitialRange) fetchFlows() })
</script>

<template>
  <div class="finance-page">
    <div class="finance-header">
      <div><h2>资金流水</h2><p>按收款和退款记录查询，查看关联订单与商品明细。</p></div>
      <div class="finance-actions"><el-button @click="openOverview">财务看板</el-button><el-button :icon="Refresh" :loading="flows.loading" @click="fetchFlows()">刷新数据</el-button><el-button type="primary" :icon="Download" :loading="exporting" :disabled="filtersDirty" @click="exportFlows">导出当前筛选</el-button></div>
    </div>
    <div class="finance-period"><span class="finance-note">{{ periodText }}</span><TimeRangePicker v-model="dateRange" :clearable="false" @update:label="currentLabel = $event" @change="changeRange" /></div>
    <div class="finance-panel">
      <div class="finance-filters">
        <el-select v-model="flowType" placeholder="全部类型" clearable aria-label="流水类型" @change="applyFilters"><el-option label="收款" value="income" /><el-option label="退款" value="refund" /></el-select>
        <el-select v-model="payMethod" placeholder="全部支付方式" clearable aria-label="支付方式" @change="applyFilters"><el-option v-for="item in paymentMethods" :key="item.value" :label="item.label" :value="item.value" /></el-select>
        <el-input v-model="keyword" placeholder="订单号 / 退款单号" clearable aria-label="业务单号" @keyup.enter="applyFilters" @clear="applyFilters" /><el-button :icon="Search" @click="applyFilters">查询</el-button>
      </div>
      <p v-if="filtersDirty" class="finance-note">搜索内容已修改，点击查询后生效。</p>
      <p class="finance-note">收款按支付时间、退款按完成时间统计；导出包含当前筛选下的全部页，单次最多 10,000 条。</p>
      <el-alert v-if="flows.error" :title="flows.error" type="warning" :closable="false" show-icon class="finance-alert"><template #default><el-button link type="primary" :loading="flows.loading" @click="fetchFlows()">重试流水</el-button></template></el-alert>
      <el-table :data="transactions" row-key="flowId" v-loading="flows.loading" :empty-text="flows.loading ? '正在加载流水…' : flows.error ? '暂时无法显示流水' : '当前筛选下暂无资金流水'">
        <el-table-column prop="businessNo" label="业务单号" min-width="200" show-overflow-tooltip />
        <el-table-column prop="orderNo" label="关联订单号" min-width="200" show-overflow-tooltip />
        <el-table-column label="时间" width="180"><template #default="{ row }">{{ formatTime(row.time) }}</template></el-table-column>
        <el-table-column prop="roomId" label="包厢" min-width="80"><template #default="{ row }">{{ row.roomId || '—' }}</template></el-table-column>
        <el-table-column label="类型" width="80"><template #default="{ row }"><el-tag :type="row.type === 'income' ? 'success' : 'warning'" effect="plain">{{ row.type === 'income' ? '收款' : '退款' }}</el-tag></template></el-table-column>
        <el-table-column label="支付方式" width="100"><template #default="{ row }">{{ paymentLabel(row.payMethod, row.refundChannel) }}</template></el-table-column>
        <el-table-column label="金额" width="150" align="right" fixed="right"><template #default="{ row }"><span :class="['finance-amount', row.type === 'income' ? 'finance-income' : 'finance-refund']">{{ flowAmount(row) }}</span></template></el-table-column>
        <el-table-column label="操作" width="75" fixed="right"><template #default="{ row }"><el-button link type="primary" @click="openDetail(row)">详情</el-button></template></el-table-column>
      </el-table>
      <div class="finance-pagination"><el-pagination background layout="total, sizes, prev, pager, next" :total="total" :page-size="pageSize" :current-page="page" :page-sizes="[20, 50, 100, 200]" @current-change="changePage" @size-change="changePageSize" /></div>
      <p v-if="flows.updatedAt" class="finance-update">更新于 {{ flows.updatedAt }}</p>
    </div>
    <el-dialog v-model="dialogVisible" title="流水与关联订单" width="min(900px, 92vw)">
      <el-alert v-if="detail.error" :title="detail.error" type="warning" :closable="false" show-icon class="finance-alert"><template #default><el-button link type="primary" :loading="detail.loading" @click="retryDetail">重试详情</el-button></template></el-alert>
      <div v-loading="detail.loading" :class="{ 'finance-detail-loading': !detail.data }">
        <template v-if="detail.data">
          <el-descriptions :column="2" border>
            <el-descriptions-item label="业务单号"><span class="finance-order-no">{{ detail.data.flow.businessNo }}</span></el-descriptions-item><el-descriptions-item label="类型">{{ detail.data.flow.type === 'income' ? '收款' : '退款' }}</el-descriptions-item>
            <el-descriptions-item label="金额">{{ flowAmount(detail.data.flow) }}</el-descriptions-item><el-descriptions-item label="支付方式">{{ paymentLabel(detail.data.flow.payMethod, detail.data.flow.refundChannel) }}</el-descriptions-item>
            <el-descriptions-item label="发生时间">{{ formatTime(detail.data.flow.time) }}</el-descriptions-item><el-descriptions-item label="流水标识">{{ detail.data.flow.flowId }}</el-descriptions-item>
            <el-descriptions-item v-if="detail.data.flow.type === 'refund'" label="退款原因" :span="2">{{ detail.data.flow.reason || '—' }}</el-descriptions-item>
          </el-descriptions>
          <h3 class="finance-detail-header">关联订单</h3>
          <el-descriptions :column="2" border>
            <el-descriptions-item label="订单号"><span class="finance-order-no">{{ detail.data.order.orderNo }}</span></el-descriptions-item><el-descriptions-item label="包厢">{{ detail.data.order.roomId || '—' }}</el-descriptions-item>
            <el-descriptions-item label="订单金额">{{ formatMoney(detail.data.order.amountTotal) }}</el-descriptions-item><el-descriptions-item label="已收款">{{ formatMoney(detail.data.order.amountPaid) }}</el-descriptions-item>
            <el-descriptions-item label="累计退款">{{ formatMoney(detail.data.order.amountRefunded) }}</el-descriptions-item><el-descriptions-item label="支付时间">{{ formatTime(detail.data.order.paidAt) }}</el-descriptions-item>
          </el-descriptions>
          <h3 class="finance-detail-header">商品明细</h3>
          <el-table :data="detail.data.order.items || []"><el-table-column label="商品" min-width="180"><template #default="{ row }"><div>{{ row.name }}</div><div class="finance-note">{{ itemAttributes(row) }}</div></template></el-table-column><el-table-column label="单价" width="120" align="right"><template #default="{ row }">{{ formatMoney(row.unitPrice) }}</template></el-table-column><el-table-column prop="qty" label="数量" width="80" align="right" /><el-table-column label="小计" width="130" align="right"><template #default="{ row }">{{ formatMoney(row.lineAmount) }}</template></el-table-column></el-table>
        </template>
      </div>
      <template #footer><el-button @click="dialogVisible = false">关闭</el-button></template>
    </el-dialog>
  </div>
</template>
