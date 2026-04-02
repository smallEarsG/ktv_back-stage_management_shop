<script setup>
import { ref, onMounted, onBeforeUnmount, watch, nextTick } from 'vue'
import {
  Money,
  List,
  Bicycle,
  RefreshRight,
  Top,
  Bottom
} from '@element-plus/icons-vue'
import TimeRangePicker from '@/components/TimeRangePicker.vue'
import request from '@/lib/request'
import dayjs from 'dayjs'

const dateRange = ref([])
const currentLabel = ref('今日')
const loading = ref(false)
const trendLoading = ref(false)
const topProductsLoading = ref(false)

const stats = ref({
  sales: { amount: 0, trend: 'up', percentage: 0 },
  orders: { pending: 0, preparing: 0, delivering: 0, completed: 0, unsettled: 0 },
  refunds: { count: 0, amount: 0, refunding: 0 }
})

const salesTrend = ref({
  xAxis: [],
  series: []
})

const topProducts = ref([])
const trendChartRef = ref(null)
const topProductsChartRef = ref(null)
let trendChart = null
let topProductsChart = null
let echartsLib = null

const toNum = (v) => Number(v ?? 0) || 0

const buildTimeParams = () => {
  const hasRange = Array.isArray(dateRange.value) && dateRange.value[0] && dateRange.value[1]
  const params = {}
  if (hasRange) {
    params.startTime = dayjs(dateRange.value[0]).format('YYYY-MM-DD HH:mm:ss')
    params.endTime = dayjs(dateRange.value[1]).format('YYYY-MM-DD HH:mm:ss')
  } else {
    params.period = 'today'
  }
  return params
}

const fetchStats = async (params) => {
  loading.value = true
  try {
    const res = await request.get('/dashboard/stats', {
      params
    })
    stats.value = {
      ...stats.value,
      sales: {
        amount: toNum(res?.sales?.amount ?? res?.salesAmount ?? res?.amount),
        trend: res?.sales?.trend === 'down' ? 'down' : 'up',
        percentage: toNum(res?.sales?.percentage ?? res?.salesPercentage)
      },
      refunds: {
        count: toNum(res?.refunds?.count ?? res?.refundCount),
        amount: toNum(res?.refunds?.amount ?? res?.refundAmount),
        refunding: toNum(res?.refunds?.refunding ?? res?.refunding)
      }
    }
  } catch (e) {
    console.error(e)
  } finally {
    loading.value = false
  }
}

const fetchSalesTrend = async (params) => {
  trendLoading.value = true
  try {
    const res = await request.get('/dashboard/sales-trend', { params })
    salesTrend.value = {
      xAxis: Array.isArray(res?.xAxis) ? res.xAxis : [],
      series: Array.isArray(res?.series) ? res.series : []
    }
  } catch (e) {
    console.error(e)
    salesTrend.value = { xAxis: [], series: [] }
  } finally {
    trendLoading.value = false
  }
}

const fetchTopProducts = async (params) => {
  topProductsLoading.value = true
  try {
    const res = await request.get('/dashboard/top-products', { params: { ...params, limit: 10 } })
    topProducts.value = res?.list || []
  } catch (e) {
    console.error(e)
    topProducts.value = []
  } finally {
    topProductsLoading.value = false
  }
}

const fetchOrderCounters = async (params) => {
  try {
    const res = await request.get('/dashboard/order-counters', { params })
    stats.value = {
      ...stats.value,
      orders: {
        pending: toNum(res?.toAccept ?? stats.value.orders.pending),
        preparing: toNum(res?.preparing ?? stats.value.orders.preparing),
        delivering: toNum(res?.delivering ?? stats.value.orders.delivering),
        completed: toNum(res?.completed ?? stats.value.orders.completed),
        unsettled: toNum(res?.unsettled ?? stats.value.orders.unsettled)
      },
      refunds: {
        ...stats.value.refunds,
        refunding: toNum(res?.refunding ?? stats.value.refunds.refunding)
      }
    }
  } catch (e) {
    console.error(e)
  }
}

const fetchDashboardData = async () => {
  const params = buildTimeParams()
  await Promise.all([fetchStats(params), fetchSalesTrend(params), fetchTopProducts(params), fetchOrderCounters(params)])
  await nextTick()
  renderCharts()
}

const handleDateRangeChange = () => {
  fetchDashboardData()
}

const handleLabelChange = (label) => {
  currentLabel.value = label
}

const initCharts = async () => {
  if (!echartsLib) {
    echartsLib = await import('echarts')
  }
  if (!trendChart && trendChartRef.value) {
    trendChart = echartsLib.init(trendChartRef.value)
  }
  if (!topProductsChart && topProductsChartRef.value) {
    topProductsChart = echartsLib.init(topProductsChartRef.value)
  }
}

const trendOption = () => {
  const xAxis = Array.isArray(salesTrend.value?.xAxis) ? salesTrend.value.xAxis : []
  const series = Array.isArray(salesTrend.value?.series) ? salesTrend.value.series : []
  return {
    tooltip: { trigger: 'axis' },
    legend: { top: 0 },
    grid: { left: 50, right: 20, top: 36, bottom: 30 },
    xAxis: { type: 'category', data: xAxis },
    yAxis: [
      { type: 'value', name: '销售额' },
      { type: 'value', name: '订单数' }
    ],
    series: [
      {
        name: series?.[0]?.name || '销售额',
        type: 'line',
        smooth: true,
        yAxisIndex: 0,
        data: Array.isArray(series?.[0]?.data) ? series[0].data : []
      },
      {
        name: series?.[1]?.name || '订单数',
        type: 'bar',
        yAxisIndex: 1,
        data: Array.isArray(series?.[1]?.data) ? series[1].data : []
      }
    ]
  }
}

const topProductsOption = () => {
  const list = Array.isArray(topProducts.value) ? topProducts.value : []
  return {
    tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
    grid: { left: 100, right: 20, top: 20, bottom: 20 },
    xAxis: { type: 'value', name: '销售额' },
    yAxis: {
      type: 'category',
      data: list.map(i => i.productName || '—')
    },
    series: [
      {
        name: '销售额',
        type: 'bar',
        data: list.map(i => Number(i.salesAmount || 0)),
        itemStyle: { color: '#3b82f6' },
        label: { show: true, position: 'right', formatter: ({ value }) => `¥ ${Number(value || 0).toFixed(2)}` }
      }
    ]
  }
}

const renderCharts = async () => {
  await initCharts()
  if (trendChart) trendChart.setOption(trendOption(), true)
  if (topProductsChart) topProductsChart.setOption(topProductsOption(), true)
}

const resizeCharts = () => {
  if (trendChart) trendChart.resize()
  if (topProductsChart) topProductsChart.resize()
}

watch(
  () => [salesTrend.value, topProducts.value],
  () => {
    renderCharts()
  },
  { deep: true }
)

onMounted(() => {
  fetchDashboardData()
  window.addEventListener('resize', resizeCharts)
})

onBeforeUnmount(() => {
  window.removeEventListener('resize', resizeCharts)
  if (trendChart) {
    trendChart.dispose()
    trendChart = null
  }
  if (topProductsChart) {
    topProductsChart.dispose()
    topProductsChart = null
  }
})
</script>

<template>
  <div>
    <div class="flex flex-col gap-4 justify-between items-start mb-6 md:flex-row md:items-center">
      <h2 class="text-2xl font-bold text-slate-800">看板</h2>
      <TimeRangePicker 
        v-model="dateRange" 
        @change="handleDateRangeChange" 
        @update:label="handleLabelChange"
      />
    </div>
    
    <!-- Quick Stats / Shortcuts -->
    <div class="grid grid-cols-1 gap-6 mb-8 md:grid-cols-2 lg:grid-cols-4">
      <el-card shadow="hover" class="transition-colors cursor-pointer hover:border-blue-400">
        <div class="flex items-center">
          <el-icon class="p-3 text-blue-500 bg-blue-100 rounded-full" :size="24"><Money /></el-icon>
          <div class="ml-4">
            <div class="text-sm text-slate-500">{{ currentLabel }}销售额</div>
            <div class="text-2xl font-bold text-slate-800">¥ {{ Number(stats.sales.amount || 0).toFixed(2) }}</div>
            <div class="mt-1 text-xs text-slate-400">
              <span>同比</span>
              <span :class="stats.sales.trend === 'up' ? 'text-red-500' : 'text-green-500'" class="ml-1 font-bold">
                <el-icon><Top v-if="stats.sales.trend === 'up'" /><Bottom v-else /></el-icon> {{ Number(stats.sales.percentage || 0) }}%
              </span>
            </div>
          </div>
        </div>
      </el-card>
      
      <el-card shadow="hover" class="transition-colors cursor-pointer hover:border-orange-400" @click="$router.push('/workbench')">
        <div class="flex items-center">
          <el-icon class="p-3 text-orange-500 bg-orange-100 rounded-full" :size="24"><List /></el-icon>
          <div class="ml-4">
            <div class="text-sm text-slate-500">待接单</div>
            <div class="text-2xl font-bold text-orange-600">{{ stats.orders.pending }}</div>
          </div>
        </div>
      </el-card>
      
      <el-card shadow="hover" class="transition-colors cursor-pointer hover:border-green-400" @click="$router.push('/workbench')">
        <div class="flex items-center">
          <el-icon class="p-3 text-green-500 bg-green-100 rounded-full" :size="24"><Bicycle /></el-icon>
          <div class="ml-4">
            <div class="text-sm text-slate-500">配送中</div>
            <div class="text-2xl font-bold text-green-600">{{ stats.orders.delivering }}</div>
          </div>
        </div>
      </el-card>
      
      <el-card shadow="hover" class="transition-colors cursor-pointer hover:border-red-400" @click="$router.push('/orders?payStatus=0')">
        <div class="flex items-center">
          <el-icon class="p-3 text-red-500 bg-red-100 rounded-full" :size="24"><RefreshRight /></el-icon>
          <div class="ml-4">
            <div class="text-sm text-slate-500">挂账未结</div>
            <div class="text-2xl font-bold text-red-600">{{ stats.orders.unsettled }}</div>
          </div>
        </div>
      </el-card>
    </div>

    <!-- Charts Placeholder -->
    <div class="grid grid-cols-1 gap-6 lg:grid-cols-2">
      <el-card shadow="always">
        <template #header>
          <div class="card-header">
            <span>销售趋势</span>
          </div>
        </template>
        <div class="overflow-hidden p-3 h-64 bg-slate-50" v-loading="trendLoading">
          <div v-if="!salesTrend.xAxis.length" class="flex justify-center items-center h-full text-slate-400">暂无趋势数据</div>
          <div v-else ref="trendChartRef" class="w-full h-full"></div>
        </div>
      </el-card>
      
      <el-card shadow="always">
        <template #header>
          <div class="card-header">
            <span>热门商品</span>
          </div>
        </template>
        <div class="overflow-hidden p-3 h-64 bg-slate-50" v-loading="topProductsLoading">
          <div v-if="!topProducts.length" class="flex justify-center items-center h-full text-slate-400">暂无热门商品数据</div>
          <div v-else ref="topProductsChartRef" class="w-full h-full"></div>
        </div>
      </el-card>
    </div>
  </div>
</template>
