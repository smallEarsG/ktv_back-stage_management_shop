<script setup>
import { computed, ref, onMounted, onBeforeUnmount } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ArrowRight, Refresh, Wallet, TrendCharts, Tickets, RefreshLeft, Shop, ShoppingBag, Document, User, Box } from '@element-plus/icons-vue'
import dayjs from 'dayjs'
import request from '@/lib/request'
import { useUserStore } from '@/stores/user'
import { businessLabels, modeLabels, channelLabels, currency, reportQuery } from '@/lib/business'
import FinanceTrendChart from '@/components/FinanceTrendChart.vue'
import './commerce.css'

const route = useRoute(), router = useRouter(), user = useUserStore(), tab = route.meta.insightTab
const available = computed(() => ['DINING', 'MALL'].filter(user.canAccessProduct))
const business = ref(route.query.business || (available.value.length === 1 ? available.value[0] : 'ALL'))
const startsOn = ref(route.query.startsOn || dayjs().subtract(6, 'day').format('YYYY-MM-DD'))
const endsOn = ref(route.query.endsOn || dayjs().format('YYYY-MM-DD'))
const mode = ref(route.query.mode || (import.meta.env.VITE_DEMO_MODE !== 'false' ? 'SIMULATED' : 'REAL'))
const channel = ref(route.query.channel || ''), kind = ref(route.query.kind || ''), keyword = ref(route.query.keyword || ''), page = ref(Number(route.query.page) || 1)
const loading = ref(false), error = ref(''), data = ref(null), updated = ref('')
const selectedBusinesses = computed(() => available.value.filter(type => business.value === 'ALL' || business.value === type))
const financialBusinesses = computed(() => data.value?.financialBusinesses || selectedBusinesses.value.filter(type => user.hasPermission('finance:view', type) || user.hasPermission('dashboard:view', type)))
const memberBusinesses = computed(() => data.value?.memberBusinesses || available.value.filter(type => user.hasPermission('operations:view', type)))
const inventoryBusinesses = computed(() => data.value?.inventoryBusinesses || available.value.filter(type => user.hasPermission('warehouse:view', type)))
const canLedger = computed(() => selectedBusinesses.value.some(type => user.hasPermission('finance:view', type)))
const canDrillAllMetrics = computed(() => financialBusinesses.value.length > 0 && financialBusinesses.value.every(type => user.hasPermission('finance:view', type)))
const financialScopeNote = computed(() => business.value === 'ALL' && data.value?.financialBusinesses?.length && data.value.financialBusinesses.length < (data.value.businesses || available.value).length ? `金额仅包含有权查看的业务：${data.value.financialBusinesses.map(type => businessLabels[type]).join('、')}。${tab === 'ledger' ? '资金明细按各业务财务权限展示。' : '其他业务待办仍按操作权限展示。'}` : '')
const names = { overview: '经营总览', report: '经营报表', ledger: '订单资金明细', shared: '会员与库存概览' }
const title = names[tab]
const period = computed(() => `${startsOn.value} — ${endsOn.value}`)
const query = () => reportQuery({ business: business.value, startsOn: startsOn.value, endsOn: endsOn.value, mode: mode.value, ...(tab === 'ledger' ? { channel: channel.value, kind: kind.value, keyword: keyword.value, page: page.value } : {}) })
const metrics = computed(() => [
  { key: 'paid', label: '订单实付', note: '含余额消费与运费 · 未扣退款', icon: Wallet, tone: 'blue' },
  { key: 'refund', label: '成功退款', note: '按退款成功时间计入本期', icon: RefreshLeft, tone: 'amber' },
  { key: 'net', label: '订单净收款', note: '订单实付 − 成功退款', icon: TrendCharts, tone: 'green' },
  { key: 'paidOrders', label: '付款订单', note: '本期成功支付的订单数量', icon: Tickets, tone: 'violet', count: true }
])
const chartData = computed(() => ({ xAxis: (data.value?.trend || []).map(day => dayjs(day.day).format(startsOn.value.slice(0, 4) === endsOn.value.slice(0, 4) ? 'MM-DD' : 'YYYY-MM-DD')), series: [{ name: '订单实付', data: (data.value?.trend || []).map(day => Number(day.paid)) }, { name: '成功退款', data: (data.value?.trend || []).map(day => Number(day.refund)) }, { name: '订单净收款', data: (data.value?.trend || []).map(day => Number(day.net)) }] }))
const channels = computed(() => {
  const rows = new Map()
  for (const row of data.value?.channels || []) { if (row.kind !== 'SALE') continue; const key = `${row.channel}:${row.tradeMode}`; const previous = rows.get(key) || { channel: row.channel, mode: row.tradeMode, amount: 0, events: 0 }; previous.amount += Number(row.amount); previous.events += Number(row.events); rows.set(key, previous) }
  return [...rows.values()].sort((a, b) => b.amount - a.amount)
})
let generation = 0, disposed = false
async function load() {
  const version = ++generation
  loading.value = true; error.value = ''; data.value = null
  try { const result = await request.get(`/commerce/${tab === 'shared' ? 'shared-overview' : tab === 'ledger' ? 'ledger' : 'overview'}`, { params: query(), silent: true }); if (!disposed && version === generation) { data.value = result; updated.value = dayjs().format('HH:mm:ss') } }
  catch (e) { if (!disposed && version === generation) error.value = e.message || '数据暂时无法获取，请重试' }
  finally { if (!disposed && version === generation) loading.value = false }
}
function apply(reset = true) {
  if (reset) page.value = 1
  const next = query()
  if (router.resolve({ path: route.path, query: next }).fullPath === route.fullPath) load()
  else router.replace({ path: route.path, query: next })
}
function quick(value) { endsOn.value = dayjs().format('YYYY-MM-DD'); startsOn.value = dayjs().subtract(value - 1, 'day').format('YYYY-MM-DD'); apply() }
function openLedger(extra = {}) { const selected = extra.business || business.value; if (!available.value.some(type => (selected === 'ALL' || selected === type) && user.hasPermission('finance:view', type))) return; router.push({ path: '/reports/ledger', query: reportQuery({ business: selected, startsOn: startsOn.value, endsOn: endsOn.value, mode: mode.value, ...extra }) }) }
function changePage(value) { page.value = value; apply(false) }
function openOrder(row) { if (row.canViewOrder === false || !user.hasPermission('order:view', row.business)) return; router.push({ path: row.business === 'MALL' ? '/mall/orders' : '/orders', query: { orderId: row.orderId, keyword: row.orderNo } }) }
function businessHome(type) { const permissions = type === 'MALL' ? [['/mall/orders', 'order:view'], ['/mall/products', 'product:view'], ['/mall/members', 'operations:view'], ['/mall/settings', 'settings:view']] : [['/workbench', 'workbench:view'], ['/orders', 'order:view'], ['/pos/index', 'pos:view'], ['/dining/seats', 'dining:view']]; return permissions.find(([, permission]) => user.hasPermission(permission, type))?.[0] }
onMounted(load)
onBeforeUnmount(() => { disposed = true; generation++ })
</script>

<template>
  <section class="commerce-page">
    <header class="insight-heading"><div><div class="insight-eyebrow"><span class="eyebrow-dot" />{{ tab === 'overview' ? '经营数据一览' : 'BUSINESS INSIGHTS' }}</div><h1>{{ title }}<span class="heading-scope">{{ businessLabels[business] }}</span></h1><p>{{ tab === 'overview' ? '把经营看清楚，把今天的事情安排好。' : tab === 'shared' ? '查看有权管理的业务，清楚区分独立账户与共享实物库存。' : '同一统计口径，清晰追踪每一笔业务。' }}</p></div><div class="heading-actions"><el-button v-if="available.includes('MALL') && user.hasPermission('finance:export', 'MALL') && ['report', 'ledger'].includes(tab)" @click="router.push({ path: '/mall/batch', query: { mode: 'export', startsOn, endsOn } })">导出商城订单</el-button><span v-if="updated" class="updated-text">更新于 {{ updated }}</span><el-button :icon="Refresh" :loading="loading" @click="load">刷新</el-button><el-button v-if="tab !== 'ledger' && tab !== 'shared' && canLedger" type="primary" :icon="Document" @click="openLedger()">资金明细</el-button></div></header>

    <form v-if="tab !== 'shared'" class="insight-filters" @submit.prevent="apply()"><div class="quick-periods"><button type="button" :class="{ active: startsOn === endsOn && endsOn === dayjs().format('YYYY-MM-DD') }" @click="quick(1)">今日</button><button type="button" :class="{ active: startsOn === dayjs().subtract(6, 'day').format('YYYY-MM-DD') && endsOn === dayjs().format('YYYY-MM-DD') }" @click="quick(7)">近7天</button><button type="button" :class="{ active: startsOn === dayjs().subtract(29, 'day').format('YYYY-MM-DD') && endsOn === dayjs().format('YYYY-MM-DD') }" @click="quick(30)">近30天</button></div><div class="date-fields"><label><span>开始日期</span><input v-model="startsOn" type="date" required :max="endsOn" aria-label="开始日期" /></label><span class="date-divider">至</span><label><span>结束日期</span><input v-model="endsOn" type="date" required :min="startsOn" :max="dayjs().format('YYYY-MM-DD')" aria-label="结束日期" /></label></div><label class="filter-select"><span>业务范围</span><select v-model="business" aria-label="业务范围" @change="apply()"><option v-if="available.length > 1" value="ALL">全部业务</option><option v-for="type in available" :key="type" :value="type">{{ businessLabels[type] }}</option></select></label><label class="filter-select"><span>交易模式</span><select v-model="mode" aria-label="交易模式" @change="apply()"><option v-for="(label, value) in modeLabels" :key="value" :value="value">{{ label }}</option></select></label><el-button native-type="submit" :loading="loading">查询</el-button></form>
    <div v-if="tab !== 'shared'" class="scope-note"><span><i :class="{ simulated: mode !== 'REAL' }" />{{ modeLabels[mode] }} · {{ period }} · 北京时间</span><small>收款与退款按各自成功时间统计</small></div>
    <el-alert v-if="error" :title="error" type="error" :closable="false" show-icon><el-button link @click="load">重新加载</el-button></el-alert>
    <el-skeleton v-if="loading && !data" :rows="9" animated class="insight-skeleton" />
    <el-alert v-if="financialScopeNote" :title="financialScopeNote" type="info" :closable="false" show-icon />
    <el-alert v-if="data?.metricsVisible && canLedger && !canDrillAllMetrics" title="部分业务仅可查看汇总；资金明细仅包含拥有财务权限的业务，汇总卡片不提供合并下钻。" type="info" :closable="false" show-icon />

    <template v-if="data && ['overview', 'report'].includes(tab)">
      <div v-if="data.metricsVisible" class="insight-metrics"><button v-for="metric in metrics" :key="metric.key" type="button" class="insight-metric" :class="metric.tone" :disabled="!canDrillAllMetrics" @click="openLedger(metric.key === 'refund' ? { kind: 'REFUND' } : metric.key === 'paid' || metric.key === 'paidOrders' ? { kind: 'SALE' } : {})"><div class="metric-top"><span>{{ metric.label }}</span><span class="metric-symbol"><el-icon><component :is="metric.icon" /></el-icon></span></div><strong><small v-if="!metric.count">¥</small>{{ metric.count ? data.totals[metric.key] : currency(data.totals[metric.key]) }}</strong><p>{{ metric.note }}</p></button></div>
      <section v-if="tab === 'overview'" class="insight-panel todo-panel"><div class="panel-heading"><div><h2>今日工作台 <span class="subtle-tag">全部未完成</span></h2><p>待办不受日期与交易模式筛选影响，点击即可处理</p></div><el-icon><Tickets /></el-icon></div><div v-if="data.tasks.length" class="todo-grid"><button v-for="task in data.tasks" :key="`${task.business}:${task.title}`" class="todo-card" @click="router.push(task.path)"><span class="business-mini" :class="task.business.toLowerCase()">{{ task.business === 'DINING' ? '点餐' : '商城' }}</span><strong :class="{ urgent: task.count > 0 }">{{ task.count }}</strong><span>{{ task.title }}</span><el-icon><ArrowRight /></el-icon></button></div><el-empty v-else description="当前权限没有需要展示的营业待办" :image-size="65" /></section>
      <div v-if="data.metricsVisible" class="report-main-grid"><section class="insight-panel trend-panel"><div class="panel-heading"><div><h2>收款与退款趋势</h2><p>净收款可为负值，不代表利润或已到账金额</p></div><span class="subtle-tag">{{ modeLabels[mode] }}</span></div><FinanceTrendChart :data="chartData" /></section><section class="insight-panel channel-panel"><div class="panel-heading"><div><h2>支付方式</h2><p>订单实付的渠道分布</p></div></div><el-empty v-if="!channels.length" description="本期暂无成功收款" :image-size="65" /><button v-for="row in channels" :key="`${row.channel}:${row.mode}`" class="channel-row" :disabled="!canDrillAllMetrics" @click="openLedger({ channel: row.channel, kind: 'SALE' })"><div><span>{{ channelLabels[row.channel] || row.channel }}<small>{{ modeLabels[row.mode] }}</small></span><strong>¥ {{ currency(row.amount) }}</strong></div><div class="channel-track"><i :style="{ width: `${data.totals.paid ? Math.min(100, row.amount / Number(data.totals.paid) * 100) : 0}%` }" /></div><small>{{ row.events }} 笔支付</small></button></section></div>
      <div v-if="data.metricsVisible" class="business-breakdown"><article v-for="row in data.breakdown" :key="row.business" class="insight-panel business-summary"><div class="panel-heading"><h2><span class="business-icon" :class="row.business.toLowerCase()"><el-icon><component :is="row.business === 'DINING' ? Shop : ShoppingBag" /></el-icon></span>{{ businessLabels[row.business] }}</h2><el-button v-if="businessHome(row.business)" link type="primary" @click="router.push(businessHome(row.business))">进入业务 <el-icon><ArrowRight /></el-icon></el-button></div><div class="business-values"><div><span>订单实付</span><strong>¥ {{ currency(row.paid) }}</strong></div><div><span>成功退款</span><strong>¥ {{ currency(row.refund) }}</strong></div><div><span>净收款</span><strong>¥ {{ currency(row.net) }}</strong></div></div><footer><span>{{ row.paidOrders }} 笔付款订单</span><el-button v-if="user.hasPermission('finance:view', row.business)" link @click="openLedger({ business: row.business })">查看明细</el-button></footer></article></div>
      <section v-if="data.metricsVisible" class="insight-panel interpretation"><div class="interpretation-head"><h2>看懂这些数字</h2><span>充值单列 · 余额独立 · 不重复计入销售</span></div><div class="supporting-values"><div><span>余额消费（已包含在订单实付中）</span><strong>¥ {{ currency(data.totals.walletSpend) }}</strong></div><div v-if="financialBusinesses.includes('MALL')"><span>商城运费收取（已包含）</span><strong>¥ {{ currency(data.totals.shippingCollected) }}</strong></div><div v-if="financialBusinesses.includes('DINING')"><span>点餐充值本金（不计入销售）</span><strong>¥ {{ currency(data.recharges.dining) }}</strong></div><div v-if="financialBusinesses.includes('MALL')"><span>商城模拟充值（不计入销售）</span><strong>¥ {{ currency(data.recharges.mallMock) }}</strong></div></div><p v-for="note in data.notes" :key="note">{{ note }}</p></section>
      <section v-if="!data.metricsVisible" class="insight-panel"><h2>专注你负责的工作</h2><p class="muted">经营金额需要看板或财务权限。你可以从工作台待办或左侧菜单进入已授权功能。</p><div class="heading-actions"><el-button v-if="available.some(type => user.hasPermission('warehouse:view', type) || user.hasPermission('operations:view', type))" @click="router.push('/reports/shared')">会员与库存概览</el-button><el-button v-for="type in available.filter(t => businessHome(t))" :key="type" @click="router.push(businessHome(type))">进入{{ businessLabels[type] }}</el-button></div></section>
    </template>

    <section v-if="tab === 'ledger'" class="insight-panel ledger-panel"><div class="panel-heading"><div><h2>每笔业务都有来源</h2><p>只展示成功订单收款与成功退款；充值不混入此表</p></div><span class="subtle-tag">共 {{ data?.total ?? '—' }} 条</span></div><form class="ledger-filters" @submit.prevent="apply()"><label><span>类型</span><select v-model="kind" aria-label="流水类型"><option value="">全部类型</option><option value="SALE">订单收款</option><option value="REFUND">订单退款</option></select></label><label><span>渠道</span><select v-model="channel" aria-label="支付渠道"><option value="">全部渠道</option><option v-for="(label, value) in channelLabels" :key="value" :value="value">{{ label }}</option></select></label><label class="keyword-filter"><span>订单号</span><input v-model="keyword" placeholder="搜索原订单号" maxlength="64" aria-label="搜索原订单号" /></label><el-button native-type="submit">筛选</el-button></form><div class="report-table-wrap"><table class="report-table"><thead><tr><th>发生时间</th><th>业务 / 应用</th><th>原订单号</th><th>类型</th><th>渠道 / 模式</th><th class="align-right">金额</th><th>来源</th></tr></thead><tbody><tr v-for="row in data?.list || []" :key="`${row.business}:${row.kind}:${row.eventId}`"><td>{{ dayjs(row.occurredAt).format('MM-DD HH:mm:ss') }}<small>{{ dayjs(row.occurredAt).format('YYYY') }}</small></td><td><span class="business-mini" :class="row.business.toLowerCase()">{{ row.business === 'DINING' ? '点餐' : '商城' }}</span><small>{{ row.applicationId ? `应用 #${row.applicationId}` : '点餐业务' }}</small></td><td class="order-number">{{ row.orderNo }}</td><td><span class="flow-tag" :class="{ refund: row.kind === 'REFUND' }">{{ row.kind === 'SALE' ? '订单收款' : '成功退款' }}</span></td><td>{{ channelLabels[row.channel] || row.channel }}<small>{{ modeLabels[row.tradeMode] }}</small></td><td class="align-right amount-cell" :class="{ 'refund-amount': row.kind === 'REFUND' }">{{ row.kind === 'REFUND' ? '−' : '+' }} {{ currency(row.amount) }}</td><td><el-button v-if="row.canViewOrder !== false && user.hasPermission('order:view', row.business)" link type="primary" @click="openOrder(row)">查看订单</el-button><span v-else class="muted">流水 #{{ row.eventId }}</span></td></tr><tr v-if="!data?.list?.length"><td colspan="7" class="report-empty">{{ loading ? '正在查询…' : error ? '暂时无法获取数据，请重试' : '当前条件下没有成功收退款记录' }}</td></tr></tbody></table></div><div class="report-pagination"><span>第 {{ page }} 页 · 每页20条</span><el-button :disabled="loading || page <= 1" @click="changePage(page - 1)">上一页</el-button><el-button :disabled="loading || !data || page * 20 >= data.total" @click="changePage(page + 1)">下一页</el-button></div></section>

    <template v-if="tab === 'shared' && data">
      <section v-if="data.members" class="insight-panel">
        <div class="panel-heading"><div><h2><el-icon><User /></el-icon> 会员概览</h2><p>仅展示拥有会员查看权限的业务；钱包、积分和优惠券分别管理</p></div></div>
        <div class="shared-values">
          <article v-if="memberBusinesses.includes('DINING')"><span>点餐会员</span><strong>{{ data.members.dining }}</strong><el-button link type="primary" @click="router.push('/operations/members')">管理点餐会员</el-button></article>
          <article v-if="memberBusinesses.includes('MALL')"><span>商城会员</span><strong>{{ data.members.mall }}</strong><el-button link type="primary" @click="router.push('/mall/members')">管理商城会员</el-button></article>
          <article v-if="memberBusinesses.length > 1"><span>已确认关联</span><strong>{{ data.members.confirmedLinked }}</strong><small>仅计入两边都有会员资料的关联</small></article>
          <article><span>{{ memberBusinesses.length > 1 ? '会籍数（确认关联去重后）' : '有权查看的会籍数' }}</span><strong>{{ data.members.confirmedDeduplicatedMemberships }}</strong><small>未关联身份无法判断是否为同一人，不等于独立顾客数</small></article>
        </div>
      </section>
      <section v-if="data.inventory" class="insight-panel">
        <div class="panel-heading"><div><h2><el-icon><Box /></el-icon> 库存概览</h2><p>仅展示拥有库存查看权限的业务；共享实物在可见范围内计算一次</p></div></div>
        <div class="shared-values">
          <article v-if="inventoryBusinesses.includes('DINING')"><span>点餐实物数量</span><strong>{{ data.inventory.diningPhysical }}</strong><el-button link type="primary" @click="router.push('/warehouse')">查看点餐仓库</el-button></article>
          <article v-if="inventoryBusinesses.includes('MALL')"><span>{{ inventoryBusinesses.length > 1 ? '商城独立实物数量' : '商城可见实物数量' }}</span><strong>{{ data.inventory.mallIndependent }}</strong><el-button v-if="user.hasPermission('product:view', 'MALL')" link type="primary" @click="router.push('/mall/products')">查看商城商品</el-button></article>
          <article v-if="inventoryBusinesses.includes('MALL')"><span>已共享规格</span><strong>{{ data.inventory.sharedSkuCount ?? '—' }}</strong><small>共享规格不会重复累计库存</small></article>
          <article><span>可见业务实物总数</span><strong>{{ data.inventory.visiblePhysicalTotal }}</strong><small>{{ data.inventory.bindingScope }}</small></article>
        </div>
      </section>
    </template>
  </section>
</template>
