<script setup>
import { ref, onMounted } from 'vue'
import { Download, Top, Bottom } from '@element-plus/icons-vue'
import TimeRangePicker from '@/components/TimeRangePicker.vue'
import request from '@/lib/request'
import dayjs from 'dayjs'
import axios from 'axios'
import { ElMessage } from 'element-plus'
import { useUserStore } from '@/stores/user'

const dateRange = ref([])
const currentLabel = ref('今日')
const loading = ref(false)
const transactions = ref([])
const userStore = useUserStore()
const flowType = ref('')
const keyword = ref('')
const page = ref(1)
const pageSize = ref(20)
const total = ref(0)

const stats = ref({
  income: { amount: 0, trend: 'up', percentage: 0 },
  refund: { amount: 0, trend: 'down', percentage: 0 },
  net: { amount: 0, trend: 'up', percentage: 0 }
})

const periodMap = {
  今日: 'today',
  昨日: 'yesterday',
  本周: 'week',
  本月: 'month',
  本年: 'year',
  自定义: 'custom'
}

const normalizeNum = (v) => Number(v ?? 0) || 0

const buildParams = (forFlow = false) => {
  const period = periodMap[currentLabel.value] || 'today'
  const params = { period }
  if (period === 'custom') {
    const hasRange = Array.isArray(dateRange.value) && dateRange.value[0] && dateRange.value[1]
    if (hasRange) {
      params.startTime = dayjs(dateRange.value[0]).format('YYYY-MM-DD HH:mm:ss')
      params.endTime = dayjs(dateRange.value[1]).format('YYYY-MM-DD HH:mm:ss')
    }
  }
  if (forFlow) {
    params.page = page.value
    params.pageSize = pageSize.value
    if (flowType.value) params.type = flowType.value
    if (keyword.value) params.keyword = keyword.value
  }
  return params
}

const fetchSummary = async () => {
  const res = await request.get('/finance/summary', { params: buildParams(false) })
  stats.value = {
    income: {
      amount: normalizeNum(res?.income?.amount),
      trend: res?.income?.trend === 'down' ? 'down' : 'up',
      percentage: normalizeNum(res?.income?.percentage)
    },
    refund: {
      amount: normalizeNum(res?.refund?.amount),
      trend: res?.refund?.trend === 'up' ? 'up' : 'down',
      percentage: normalizeNum(res?.refund?.percentage)
    },
    net: {
      amount: normalizeNum(res?.net?.amount),
      trend: res?.net?.trend === 'down' ? 'down' : 'up',
      percentage: normalizeNum(res?.net?.percentage)
    }
  }
}

const fetchFlows = async () => {
  const res = await request.get('/finance/flows', { params: buildParams(true) })
  total.value = normalizeNum(res?.total)
  transactions.value = Array.isArray(res?.list) ? res.list : []
}

const fetchFinanceData = async () => {
  loading.value = true
  try {
    await Promise.all([fetchSummary(), fetchFlows()])
  } catch (e) {
    console.error(e)
  } finally {
    loading.value = false
  }
}

const handleDateRangeChange = (range) => {
  dateRange.value = range
  page.value = 1
  fetchFinanceData()
}

const handleLabelChange = (label) => {
  currentLabel.value = label
}

const handleSearch = () => {
  page.value = 1
  fetchFinanceData()
}

const handlePageChange = (val) => {
  page.value = val
  fetchFinanceData()
}

const handlePageSizeChange = (val) => {
  pageSize.value = val
  page.value = 1
  fetchFinanceData()
}

const exportFlows = async () => {
  try {
    const params = buildParams(true)
    delete params.page
    delete params.pageSize
    const res = await axios.get('/api/finance/flows/export', {
      params,
      responseType: 'blob',
      headers: {
        Authorization: userStore.token ? `Bearer ${userStore.token}` : '',
        'X-Store-Id': userStore.currentStoreId || '1001'
      }
    })
    const blob = new Blob([res.data], { type: 'text/csv;charset=utf-8;' })
    const url = window.URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `finance-flows-${dayjs().format('YYYYMMDDHHmmss')}.csv`
    document.body.appendChild(a)
    a.click()
    a.remove()
    window.URL.revokeObjectURL(url)
    ElMessage.success('导出成功')
  } catch (e) {
    console.error(e)
    ElMessage.error('导出失败')
  }
}

onMounted(() => {
  fetchFinanceData()
})
</script>

<template>
  <div>
    <div class="flex flex-col gap-4 justify-between items-start mb-6 md:flex-row md:items-center">
      <h2 class="text-2xl font-bold text-slate-800">财务管理</h2>
      <TimeRangePicker 
        v-model="dateRange" 
        @change="handleDateRangeChange" 
        @update:label="handleLabelChange"
      />
    </div>

    <div class="grid grid-cols-1 gap-6 mb-6 md:grid-cols-3">
      <el-card>
        <div class="text-sm text-slate-500">{{ currentLabel }}收入</div>
        <div class="mt-2 text-2xl font-bold text-green-600">¥ {{ stats.income.amount.toFixed(2) }}</div>
        <div class="mt-1 text-xs text-slate-400">
          <span>同比</span>
          <span :class="stats.income.trend === 'up' ? 'text-red-500' : 'text-green-500'" class="ml-1 font-bold">
            <el-icon><Top v-if="stats.income.trend === 'up'" /><Bottom v-else /></el-icon> {{ stats.income.percentage }}%
          </span>
        </div>
      </el-card>
      <el-card>
        <div class="text-sm text-slate-500">{{ currentLabel }}退款</div>
        <div class="mt-2 text-2xl font-bold text-red-600">¥ {{ stats.refund.amount.toFixed(2) }}</div>
        <div class="mt-1 text-xs text-slate-400">
          <span>同比</span>
          <span class="ml-1 font-bold text-green-500">
            <el-icon><Bottom /></el-icon> --%
          </span>
        </div>
      </el-card>
      <el-card>
        <div class="text-sm text-slate-500">实际营收</div>
        <div class="mt-2 text-2xl font-bold text-blue-600">¥ {{ stats.net.amount.toFixed(2) }}</div>
        <div class="mt-1 text-xs text-slate-400">
          <span>同比</span>
          <span class="ml-1 font-bold text-red-500">
            <el-icon><Top /></el-icon> --%
          </span>
        </div>
      </el-card>
    </div>

    <el-card>
      <template #header>
        <div class="flex justify-between items-center">
          <span class="font-bold">资金流水</span>
          <div class="flex gap-2 items-center">
            <el-select v-model="flowType" class="w-32" placeholder="类型筛选" clearable @change="handleSearch">
              <el-option label="收入" value="income" />
              <el-option label="退款" value="refund" />
            </el-select>
            <el-input v-model="keyword" placeholder="订单号搜索" class="w-48" clearable @keyup.enter="handleSearch" @clear="handleSearch" />
            <el-button @click="handleSearch">查询</el-button>
            <el-button :icon="Download" @click="exportFlows">导出报表</el-button>
          </div>
        </div>
      </template>
      
      <el-table :data="transactions" style="width: 100%" stripe v-loading="loading">
        <el-table-column prop="id" label="流水号" width="180" />
        <el-table-column prop="time" label="时间" width="180" />
        <el-table-column prop="source" label="来源/用途" />
        <el-table-column prop="type" label="类型" width="100">
          <template #default="{ row }">
            <el-tag v-if="row.type === 'income'" type="success">收入</el-tag>
            <el-tag v-else type="danger">支出</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="amount" label="金额" width="150">
          <template #default="{ row }">
            <span :class="row.type === 'income' ? 'text-green-600' : 'text-red-600'" class="font-bold">
              {{ row.type === 'income' ? '+' : '' }}¥ {{ Math.abs(row.amount).toFixed(2) }}
            </span>
          </template>
        </el-table-column>
      </el-table>
      <div class="flex justify-end mt-4">
        <el-pagination
          background
          layout="total, sizes, prev, pager, next"
          :total="total"
          :page-size="pageSize"
          :current-page="page"
          :page-sizes="[20, 50, 100, 200]"
          @current-change="handlePageChange"
          @size-change="handlePageSizeChange"
        />
      </div>
    </el-card>
  </div>
</template>
