<script setup>
import { computed, ref, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Refresh, ArrowRight } from '@element-plus/icons-vue'
import TimeRangePicker from '@/components/TimeRangePicker.vue'
import FinanceTrendChart from '@/components/FinanceTrendChart.vue'
import { useFinanceResource } from '@/composables/useFinanceResource'
import { useUserStore } from '@/stores/user'
import { numeric, formatMoney, paymentLabel, changeText, initialFinanceRange, financeParams, financeRouteQuery } from '@/lib/finance'
import dayjs from 'dayjs'
import './finance.css'

const route = useRoute(), router = useRouter(), userStore = useUserStore()
const dateRange = ref(initialFinanceRange(route.query))
const hadInitialRange = dateRange.value.length === 2
const currentLabel = ref(hadInitialRange ? '自定义' : '今日')
const summary = useFinanceResource('/finance/summary')
const trend = useFinanceResource('/finance/trend')
const methods = useFinanceResource('/finance/payment-methods')
const receivables = useFinanceResource('/finance/receivables')
const refreshing = computed(() => [summary, trend, methods, receivables].some(resource => resource.loading))
const periodText = computed(() => dateRange.value.length === 2 ? `${dayjs(dateRange.value[0]).format('YYYY-MM-DD')} 至 ${dayjs(dateRange.value[1]).format('YYYY-MM-DD')}` : '今日')
const comparison = computed(() => {
  const range = summary.data?.comparison
  return range ? `对比时段：${dayjs(range.startTime).format('MM-DD HH:mm')} 至 ${dayjs(range.endTime).subtract(1, 'second').format('MM-DD HH:mm')}` : '与前一等长时段比较'
})
const metrics = computed(() => [
  { key: 'income', label: '收款金额', note: '已支付订单实收，未扣退款', type: 'income' },
  { key: 'refund', label: '退款金额', note: '已完成退款，按完成时间统计', type: 'refund' },
  { key: 'net', label: '净收款', note: '收款金额 − 退款金额', type: '' }
])
const paymentRows = computed(() => (methods.data?.list || []).slice().sort((a, b) => numeric(b.amount) - numeric(a.amount)))
const paymentTotal = computed(() => paymentRows.value.reduce((sum, row) => sum + numeric(row.amount), 0))
const percentage = row => paymentTotal.value > 0 ? numeric(row.amount) / paymentTotal.value * 100 : 0
const hasTrend = computed(() => trend.data?.xAxis?.length > 0)
const hasActivity = computed(() => (trend.data?.series || []).some(series => series.data?.some(value => numeric(value) !== 0)))
const params = () => financeParams(dateRange.value, currentLabel.value)
const fetchSummary = (clear = false) => summary.load(params(), clear)
const fetchTrend = (clear = false) => trend.load(params(), clear)
const fetchMethods = (clear = false) => methods.load(params(), clear)
const fetchAnalytics = (clear = false) => Promise.all([fetchSummary(clear), fetchTrend(clear), fetchMethods(clear)])
const refresh = () => Promise.all([fetchAnalytics(), receivables.load()])
const changeRange = () => fetchAnalytics(true)
const openFlows = (type = '', payMethod) => router.push({ path: '/finance/flows', query: financeRouteQuery(dateRange.value, { type, payMethod }) })
const openReceivables = () => { if (userStore.hasPermission('order:view')) router.push('/orders?status=credit_unsettled&dateScope=all') }
onMounted(() => { receivables.load(); if (hadInitialRange) fetchAnalytics() })
</script>

<template>
  <div class="finance-page">
    <div class="finance-header">
      <div><h2>财务看板</h2><p>查看收款、退款与未结挂账，追踪门店资金变化。</p></div>
      <div class="finance-actions"><el-button :icon="Refresh" :loading="refreshing" @click="refresh">刷新数据</el-button><el-button type="primary" @click="openFlows()">查看资金流水 <el-icon><ArrowRight /></el-icon></el-button></div>
    </div>
    <div class="finance-period"><span class="finance-note">{{ periodText }}</span><TimeRangePicker v-model="dateRange" :clearable="false" @update:label="currentLabel = $event" @change="changeRange" /></div>
    <el-alert v-if="summary.error" :title="summary.error" type="warning" :closable="false" show-icon class="finance-alert"><template #default><el-button link type="primary" :loading="summary.loading" @click="fetchSummary()">重试经营汇总</el-button></template></el-alert>
    <div class="finance-metrics" :aria-busy="summary.loading">
      <button v-for="metric in metrics" :key="metric.key" type="button" class="finance-metric" @click="openFlows(metric.type)">
        <span class="finance-metric-label">{{ metric.label }}</span>
        <el-skeleton v-if="summary.loading && !summary.data" animated><template #template><el-skeleton-item variant="text" class="finance-metric-skeleton" /></template></el-skeleton>
        <strong v-else>{{ summary.data?.[metric.key] ? formatMoney(summary.data[metric.key].amount) : '—' }}</strong>
        <span v-if="summary.data?.[metric.key]" class="finance-metric-change">{{ changeText(summary.data[metric.key]) }}</span><span class="finance-note">{{ metric.note }}</span>
      </button>
      <button type="button" class="finance-metric" :disabled="!userStore.hasPermission('order:view')" @click="openReceivables">
        <span class="finance-metric-label">未结挂账金额</span><strong>{{ receivables.data ? formatMoney(receivables.data.amount) : '—' }}</strong>
        <span class="finance-metric-change">{{ receivables.data ? `${numeric(receivables.data.count)} 笔待结算` : receivables.loading ? '正在获取待结算金额' : '暂时无法显示待结算金额' }}</span><span class="finance-note">全部未结挂账，不受日期筛选影响</span>
      </button>
    </div>
    <el-alert v-if="receivables.error" :title="receivables.error" type="warning" :closable="false" show-icon class="finance-alert"><template #default><el-button link type="primary" :loading="receivables.loading" @click="receivables.load()">重试挂账金额</el-button></template></el-alert>
    <p class="finance-comparison">{{ comparison }}<span v-if="summary.updatedAt"> · 汇总更新于 {{ summary.updatedAt }}</span><span v-if="receivables.updatedAt"> · 挂账更新于 {{ receivables.updatedAt }}</span></p>
    <div class="finance-charts">
      <section class="finance-panel" aria-labelledby="finance-trend-title">
        <div class="finance-section-header"><div><h3 id="finance-trend-title">收款与退款趋势</h3><span class="finance-note">按资金发生时间统计，净收款可为负值</span></div></div>
        <el-alert v-if="trend.error" :title="trend.error" type="warning" :closable="false" show-icon class="finance-alert"><template #default><el-button link type="primary" :loading="trend.loading" @click="fetchTrend()">重试趋势</el-button></template></el-alert>
        <div v-loading="trend.loading"><FinanceTrendChart v-if="trend.data" :data="trend.data" /><div v-else class="finance-empty">{{ trend.error ? '暂时无法显示趋势' : '正在加载趋势…' }}</div></div>
        <p v-if="hasTrend && !hasActivity" class="finance-note">所选时段暂无收款和退款，图中金额均为 0。</p><p v-if="trend.updatedAt" class="finance-update">更新于 {{ trend.updatedAt }}</p>
      </section>
      <section class="finance-panel" aria-labelledby="finance-methods-title">
        <div class="finance-section-header"><div><h3 id="finance-methods-title">支付方式分布</h3><span class="finance-note">按收款金额统计，点击查看对应流水</span></div></div>
        <el-alert v-if="methods.error" :title="methods.error" type="warning" :closable="false" show-icon class="finance-alert"><template #default><el-button link type="primary" :loading="methods.loading" @click="fetchMethods()">重试支付方式</el-button></template></el-alert>
        <div v-loading="methods.loading">
          <div v-if="!paymentRows.length" class="finance-empty">{{ methods.error ? '暂时无法显示支付方式' : methods.loading ? '正在加载支付方式…' : '所选时段暂无收款' }}</div>
          <button v-for="row in paymentRows" :key="row.payMethod" type="button" class="finance-method" @click="openFlows('income', numeric(row.payMethod))">
            <div class="finance-method-head"><span>{{ paymentLabel(row.payMethod) }}</span><strong>{{ formatMoney(row.amount) }}</strong></div>
            <div class="finance-method-note"><span>{{ numeric(row.count) }} 笔收款</span><span>{{ percentage(row).toFixed(1) }}%</span></div><div class="finance-method-track"><div class="finance-method-fill" :style="{ width: `${percentage(row)}%` }"></div></div>
          </button>
        </div><p v-if="methods.updatedAt" class="finance-update">更新于 {{ methods.updatedAt }}</p>
      </section>
    </div>
  </div>
</template>
