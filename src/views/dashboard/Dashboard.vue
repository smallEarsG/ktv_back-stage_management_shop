<script setup>
import { computed, reactive, ref, onMounted, onBeforeUnmount, nextTick, watch } from 'vue'
import { useRouter } from 'vue-router'
import { Refresh, ArrowRight, Wallet, RefreshLeft, Money, Tickets, List, Box, Bicycle, Clock } from '@element-plus/icons-vue'
import TimeRangePicker from '@/components/TimeRangePicker.vue'
import request from '@/lib/request'
import { useUserStore } from '@/stores/user'
import { dateRangeParams } from '@/lib/date-range'
import dayjs from 'dayjs'

const router = useRouter()
const userStore = useUserStore()
const dateRange = ref([])
const currentLabel = ref('今日')
const trendChartRef = ref(null)
const createResource = () => ({ data: null, loading: false, error: '', updatedAt: '' })
const resources = reactive({ summary: createResource(), trend: createResource(), products: createResource(), counters: createResource() })
const versions = { summary: 0, trend: 0, products: 0, counters: 0 }
let disposed = false
let pollTimer = null
let chart = null
let chartLibrary = null
let resizeObserver = null

const number = value => Number(value ?? 0) || 0
const money = value => `¥ ${number(value).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const periodText = computed(() => dateRange.value?.length === 2
  ? `${dayjs(dateRange.value[0]).format('YYYY-MM-DD')} 至 ${dayjs(dateRange.value[1]).format('YYYY-MM-DD')}` : '今日')
const refreshing = computed(() => Object.values(resources).some(resource => resource.loading))
const hasTrend = computed(() => Array.isArray(resources.trend.data?.xAxis) && resources.trend.data.xAxis.length > 0)
const rankedProducts = computed(() => (Array.isArray(resources.products.data?.list) ? resources.products.data.list : [])
  .slice().sort((a, b) => number(b.salesAmount) - number(a.salesAmount)).slice(0, 10))
const hasSales = computed(() => (resources.trend.data?.series || []).some(series => (series.data || []).some(value => number(value) > 0)))
const comparisonText = computed(() => {
  const comparison = resources.summary.data?.comparison
  if (!comparison?.startTime || !comparison?.endTime) return '较前一等长时段'
  const start = dayjs(comparison.startTime).format('MM-DD HH:mm')
  const end = dayjs(comparison.endTime).subtract(1, 'second').format('MM-DD HH:mm')
  return `对比时段：${start} 至 ${end}`
})
const summaryCards = computed(() => {
  const data = resources.summary.data
  return [
    { key: 'income', label: '收款金额', value: data ? money(data.income?.amount ?? data.sales?.amount) : '—', metric: data?.income || data?.sales, icon: Wallet, tone: 'blue', note: '已支付订单实收，未扣退款' },
    { key: 'refunds', label: '退款金额', value: data ? money(data.refunds?.amount) : '—', metric: data?.refunds, icon: RefreshLeft, tone: 'orange', note: '按退款完成时间统计' },
    { key: 'net', label: '净收入', value: data?.net ? money(data.net.amount) : '—', metric: data?.net, icon: Money, tone: 'green', note: '收款金额 − 退款金额' },
    { key: 'paidOrders', label: '支付订单数', value: data?.paidOrderCount != null ? number(data.paidOrderCount).toLocaleString('zh-CN') : '—', icon: Tickets, tone: 'slate', note: '按支付时间统计，单位：单' }
  ]
})
const tasks = computed(() => [
  { key: 'toAccept', label: '待接单', icon: List, tone: 'orange', to: '/workbench?status=20', permission: 'workbench:view' },
  { key: 'preparing', label: '备货中', icon: Box, tone: 'blue', to: '/workbench?status=30', permission: 'workbench:view' },
  { key: 'delivering', label: '配送中', icon: Bicycle, tone: 'green', to: '/workbench?status=40', permission: 'workbench:view' },
  { key: 'unsettled', label: '挂账未结', icon: Clock, tone: 'red', to: '/orders?status=credit_unsettled&dateScope=all', permission: 'order:view' },
  { key: 'refunding', label: '退款中', icon: RefreshLeft, tone: 'red', to: '/orders?status=91&dateScope=all', permission: 'order:view' }
])

const changeText = metric => {
  if (!metric || metric.comparable === false || metric.percentage === null || metric.percentage === undefined) return '暂无可比数据'
  const value = number(metric.percentage)
  if (!value) return '与上一周期持平'
  return `较上一周期${metric.trend === 'down' ? '下降' : '上升'} ${value.toFixed(1)}%`
}

const loadResource = async (key, path, params, clear = false) => {
  const version = ++versions[key]
  const resource = resources[key]
  if (clear) { resource.data = null; resource.updatedAt = '' }
  resource.loading = true
  resource.error = ''
  try {
    const data = await request.get(path, { params, silent: true })
    if (disposed || version !== versions[key]) return
    resource.data = data
    resource.updatedAt = dayjs().format('HH:mm:ss')
  } catch {
    if (disposed || version !== versions[key]) return
    resource.error = resource.data ? '更新失败，当前显示上次成功获取的数据。' : '加载失败，请重试。'
  } finally {
    if (!disposed && version === versions[key]) resource.loading = false
  }
}

const fetchSummary = (clear = false) => loadResource('summary', '/dashboard/stats', { period: 'today', ...dateRangeParams(dateRange.value) }, clear)
const fetchTrend = (clear = false) => loadResource('trend', '/dashboard/sales-trend', dateRangeParams(dateRange.value), clear)
const fetchProducts = (clear = false) => loadResource('products', '/dashboard/top-products', { ...dateRangeParams(dateRange.value), limit: 10 }, clear)
const fetchCounters = () => loadResource('counters', '/dashboard/order-counters', { scope: 'all' })
const fetchAnalytics = (clear = false) => Promise.all([fetchSummary(clear), fetchTrend(clear), fetchProducts(clear)])
const refreshDashboard = () => Promise.all([fetchAnalytics(), fetchCounters()])
const handleDateRangeChange = () => fetchAnalytics(true)
const openTask = task => { if (userStore.hasPermission(task.permission)) router.push(task.to) }

const renderTrend = async () => {
  await nextTick()
  if (disposed || !hasTrend.value || !trendChartRef.value) return
  try {
    if (!chartLibrary) chartLibrary = import('@/lib/dashboard-chart')
    const echarts = await chartLibrary
    if (disposed || !hasTrend.value || !trendChartRef.value) return
    if (!chart) chart = echarts.init(trendChartRef.value)
    const data = resources.trend.data
    chart.resize()
    chart.setOption({
      color: ['#2563eb', '#cbd5e1'],
      tooltip: { trigger: 'axis', valueFormatter: value => number(value).toLocaleString('zh-CN') },
      legend: { top: 0, right: 0, icon: 'roundRect', itemWidth: 14, itemHeight: 8 },
      grid: { left: 16, right: 16, top: 54, bottom: 12, containLabel: true },
      xAxis: { type: 'category', data: data.xAxis, axisTick: { show: false }, axisLine: { lineStyle: { color: '#e2e8f0' } }, axisLabel: { color: '#64748b', hideOverlap: true } },
      yAxis: [
        { type: 'value', name: '收款金额（元）', nameTextStyle: { color: '#64748b' }, axisLabel: { color: '#64748b' }, splitLine: { lineStyle: { color: '#f1f5f9' } } },
        { type: 'value', name: '支付订单（单）', minInterval: 1, nameTextStyle: { color: '#64748b' }, axisLabel: { color: '#64748b' }, splitLine: { show: false } }
      ],
      series: [
        { name: '收款金额', type: 'line', smooth: false, yAxisIndex: 0, showSymbol: false, lineStyle: { width: 3 }, areaStyle: { color: '#dbeafe', opacity: 0.45 }, data: data.series?.[0]?.data || [] },
        { name: '支付订单', type: 'bar', yAxisIndex: 1, barMaxWidth: 16, itemStyle: { borderRadius: [3, 3, 0, 0] }, data: data.series?.[1]?.data || [] }
      ]
    }, true)
  } catch {
    if (!disposed) resources.trend.error = '趋势图加载失败，请重试。'
  }
}

watch(() => resources.trend.data, renderTrend, { flush: 'post' })

onMounted(() => {
  fetchCounters()
  if (typeof ResizeObserver !== 'undefined') {
    resizeObserver = new ResizeObserver(() => chart?.resize())
    if (trendChartRef.value) resizeObserver.observe(trendChartRef.value)
  }
  pollTimer = setInterval(() => {
    if (!document.hidden && !resources.counters.loading) fetchCounters()
  }, 30000)
})

onBeforeUnmount(() => {
  disposed = true
  clearInterval(pollTimer)
  resizeObserver?.disconnect()
  chart?.dispose()
  chart = null
})
</script>

<template>
  <div class="dashboard">
    <div class="dashboard-heading">
      <div>
        <h2>经营概览</h2>
        <p>查看门店经营情况，及时跟进未完成事项。</p>
      </div>
      <el-button :icon="Refresh" :loading="refreshing" @click="refreshDashboard">刷新数据</el-button>
    </div>

    <section aria-labelledby="business-title">
      <div class="section-heading business-heading">
        <div>
          <h3 id="business-title">{{ currentLabel === '自定义' ? '所选时段' : currentLabel }}经营数据</h3>
          <span class="section-note">{{ periodText }}</span>
        </div>
        <TimeRangePicker v-model="dateRange" :clearable="false" @change="handleDateRangeChange" @update:label="currentLabel = $event" />
      </div>
      <el-alert v-if="resources.summary.error" :title="resources.summary.error" type="warning" :closable="false" show-icon class="resource-alert">
        <template #default><el-button link type="primary" :loading="resources.summary.loading" @click="fetchSummary()">重试经营数据</el-button></template>
      </el-alert>
      <div class="metrics-grid" :aria-busy="resources.summary.loading">
        <div v-for="card in summaryCards" :key="card.key" class="metric-card">
          <div class="metric-header">
            <span>{{ card.label }}</span>
            <span :class="['metric-icon', card.tone]"><el-icon :size="19"><component :is="card.icon" /></el-icon></span>
          </div>
          <el-skeleton v-if="resources.summary.loading && !resources.summary.data" animated>
            <template #template><el-skeleton-item variant="text" class="metric-skeleton" /></template>
          </el-skeleton>
          <div v-else class="metric-value">{{ card.value }}</div>
          <div v-if="card.metric" class="metric-comparison">{{ changeText(card.metric) }}</div>
          <p class="metric-note">{{ card.note }}</p>
        </div>
      </div>
      <div class="business-footer">
        <span>{{ comparisonText }}<span v-if="resources.summary.updatedAt"> · 更新于 {{ resources.summary.updatedAt }}</span></span>
        <el-button v-if="userStore.hasPermission('finance:view')" link type="primary" @click="router.push('/finance/flows')">查看财务明细 <el-icon><ArrowRight /></el-icon></el-button>
      </div>
    </section>

    <section aria-labelledby="tasks-title">
      <div class="section-heading">
        <div><h3 id="tasks-title">实时待办</h3><span class="section-note">全部未完成事项，不受上方日期筛选影响</span></div>
        <span class="section-note task-update">每 30 秒更新<span v-if="resources.counters.updatedAt"> · {{ resources.counters.updatedAt }}</span></span>
      </div>
      <el-alert v-if="resources.counters.error" :title="resources.counters.error" type="warning" :closable="false" show-icon class="resource-alert">
        <template #default><el-button link type="primary" :loading="resources.counters.loading" @click="fetchCounters">重试待办</el-button></template>
      </el-alert>
      <div class="tasks-grid" :aria-busy="resources.counters.loading">
        <button v-for="task in tasks" :key="task.key" type="button" class="task-card" :disabled="!userStore.hasPermission(task.permission)" @click="openTask(task)">
          <div class="task-header"><el-icon :class="task.tone" :size="18"><component :is="task.icon" /></el-icon><span>{{ task.label }}</span></div>
          <div class="task-value"><strong>{{ resources.counters.data ? number(resources.counters.data[task.key]) : '—' }}</strong><span>单</span><el-icon v-if="userStore.hasPermission(task.permission)" class="task-arrow"><ArrowRight /></el-icon></div>
        </button>
      </div>
    </section>

    <div class="analysis-grid">
      <section class="analysis-card" aria-labelledby="trend-title">
        <div class="section-heading"><div><h3 id="trend-title">收款趋势</h3><span class="section-note">收款金额与支付订单数</span></div><span class="section-note">{{ currentLabel === '自定义' ? '所选时段' : currentLabel }}</span></div>
        <el-alert v-if="resources.trend.error" :title="resources.trend.error" type="warning" :closable="false" show-icon class="resource-alert">
          <template #default><el-button link type="primary" :loading="resources.trend.loading" @click="fetchTrend().then(renderTrend)">重试趋势</el-button></template>
        </el-alert>
        <div class="trend-body" v-loading="resources.trend.loading">
          <div v-show="hasTrend" ref="trendChartRef" class="trend-chart"></div>
          <div v-if="!hasTrend" class="empty-state">{{ resources.trend.loading ? '正在加载趋势…' : resources.trend.error ? '暂时无法显示趋势' : '所选时段暂无趋势数据' }}</div>
        </div>
        <p v-if="hasTrend && !hasSales" class="section-note">所选时段暂无支付订单，图中金额与订单数均为 0。</p>
        <p v-if="resources.trend.updatedAt" class="chart-update">更新于 {{ resources.trend.updatedAt }}</p>
      </section>

      <section class="analysis-card" aria-labelledby="products-title">
        <div class="section-heading"><div><h3 id="products-title">商品销售排行</h3><span class="section-note">按已支付订单商品金额排序</span></div><span class="rank-badge">TOP 10</span></div>
        <el-alert v-if="resources.products.error" :title="resources.products.error" type="warning" :closable="false" show-icon class="resource-alert">
          <template #default><el-button link type="primary" :loading="resources.products.loading" @click="fetchProducts()">重试排行</el-button></template>
        </el-alert>
        <div class="ranking-body" v-loading="resources.products.loading">
          <div v-if="!rankedProducts.length" class="empty-state">{{ resources.products.loading ? '正在加载排行…' : resources.products.error ? '暂时无法显示排行' : '所选时段暂无商品销售' }}</div>
          <table v-else class="ranking-table">
            <thead><tr><th scope="col">商品</th><th scope="col" class="numeric">销量</th><th scope="col" class="numeric">金额</th></tr></thead>
            <tbody><tr v-for="(product, index) in rankedProducts" :key="`${product.productId}-${index}`">
              <td><div class="product-name"><span :class="['rank-number', { 'rank-leading': index < 3 }]">{{ index + 1 }}</span><span class="product-label" :title="product.productName">{{ product.productName || '未命名商品' }}</span></div></td>
              <td class="numeric">{{ number(product.salesQty).toLocaleString('zh-CN') }}</td><td class="numeric product-amount">{{ money(product.salesAmount) }}</td>
            </tr></tbody>
          </table>
        </div>
        <p v-if="resources.products.updatedAt" class="chart-update">更新于 {{ resources.products.updatedAt }}</p>
      </section>
    </div>
  </div>
</template>

<style scoped>
.dashboard { max-width: 1600px; margin: 0 auto; color: #1e293b; }
.dashboard-heading, .section-heading { display: flex; align-items: center; justify-content: space-between; gap: 16px; }
.dashboard-heading { margin-bottom: 28px; }
.dashboard-heading h2 { margin: 0; font-size: 24px; font-weight: 700; }
.dashboard-heading p { margin: 6px 0 0; color: #64748b; font-size: 14px; }
.dashboard > section { margin-bottom: 28px; }
.section-heading { margin-bottom: 16px; flex-wrap: wrap; }
.section-heading h3 { margin: 0 0 4px; font-size: 16px; font-weight: 650; }
.section-note { color: #64748b; font-size: 12px; }
.metrics-grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 16px; }
.metric-card, .task-card, .analysis-card { background: #fff; border: 1px solid #e2e8f0; border-radius: 12px; }
.metric-card { padding: 20px; }
.metric-header { display: flex; justify-content: space-between; align-items: center; gap: 8px; color: #475569; font-size: 14px; }
.metric-icon { display: inline-flex; padding: 9px; border-radius: 10px; background: #f8fafc; }
.metric-value { margin-top: 16px; font-size: clamp(22px, 2vw, 30px); line-height: 1.3; font-weight: 700; overflow-wrap: anywhere; font-variant-numeric: tabular-nums; }
.metric-skeleton { height: 32px; width: 75%; margin-top: 16px; }
.metric-comparison { margin-top: 8px; font-size: 12px; color: #475569; }
.metric-note { margin: 10px 0 0; font-size: 12px; color: #64748b; }
.business-footer { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 8px; margin-top: 10px; font-size: 12px; color: #64748b; }
.tasks-grid { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 12px; }
.task-card { padding: 18px; text-align: left; cursor: pointer; color: inherit; font: inherit; transition: border-color .15s, box-shadow .15s; }
.task-card:hover:enabled { border-color: #93c5fd; box-shadow: 0 3px 10px #0f172a08; }
.task-card:focus-visible { outline: 2px solid #2563eb; outline-offset: 3px; }
.task-card:disabled { cursor: default; }
.task-header { display: flex; align-items: center; gap: 8px; font-size: 13px; color: #475569; }
.task-value { display: flex; align-items: baseline; gap: 6px; margin-top: 12px; }
.task-value strong { font-size: 28px; line-height: 1; font-variant-numeric: tabular-nums; }
.task-value > span { font-size: 12px; color: #64748b; }
.task-arrow { margin-left: auto; align-self: center; color: #94a3b8; }
.blue { color: #2563eb; }.orange { color: #d97706; }.green { color: #059669; }.red { color: #dc2626; }.slate { color: #64748b; }
.analysis-grid { display: grid; grid-template-columns: minmax(0, 1.65fr) minmax(0, 1fr); gap: 20px; align-items: start; }
.analysis-card { min-width: 0; padding: 20px; }
.trend-body, .trend-chart { height: 340px; width: 100%; }
.empty-state { display: flex; align-items: center; justify-content: center; min-height: 280px; color: #94a3b8; font-size: 14px; text-align: center; }
.trend-body > .empty-state { height: 100%; }
.ranking-body { min-height: 340px; overflow-x: auto; }
.rank-badge { background: #eff6ff; color: #2563eb; padding: 4px 8px; border-radius: 6px; font-size: 11px; font-weight: 600; }
.ranking-table { width: 100%; table-layout: fixed; border-collapse: collapse; font-size: 13px; }
.ranking-table th { text-align: left; font-weight: 500; color: #64748b; background: #f8fafc; padding: 10px 8px; }
.ranking-table th:first-child { width: 49%; }.ranking-table th:nth-child(2) { width: 16%; }
.ranking-table td { padding: 12px 8px; border-bottom: 1px solid #f1f5f9; }
.ranking-table .numeric { text-align: right; white-space: nowrap; font-variant-numeric: tabular-nums; }
.product-name { display: flex; align-items: center; gap: 8px; }
.product-label { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.rank-number { width: 22px; height: 22px; flex-shrink: 0; text-align: center; line-height: 22px; color: #64748b; font-size: 12px; background: #f1f5f9; border-radius: 5px; }
.rank-leading { color: #2563eb; background: #eff6ff; font-weight: 600; }
.product-amount { font-weight: 600; }
.chart-update { margin: 12px 0 0; color: #94a3b8; font-size: 12px; }
.resource-alert { margin-bottom: 12px; }
@media (max-width: 1200px) { .metrics-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); } .analysis-grid { grid-template-columns: minmax(0, 1fr); } .tasks-grid { grid-template-columns: repeat(3, minmax(0, 1fr)); } }
@media (max-width: 640px) { .dashboard-heading { align-items: flex-start; gap: 10px; } .dashboard-heading h2 { font-size: 21px; } .metrics-grid { gap: 10px; } .metric-card { padding: 14px; } .metric-value { font-size: 22px; } .tasks-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); } .analysis-card { padding: 14px; } .task-update { width: 100%; } }
</style>
