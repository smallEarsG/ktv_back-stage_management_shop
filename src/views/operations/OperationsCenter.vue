<script setup>
import { computed, onMounted, onBeforeUnmount, reactive, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Search, Plus, Refresh, User, OfficeBuilding } from '@element-plus/icons-vue'
import request from '@/lib/request'
import { useUserStore } from '@/stores/user'
import { amountText as money, newRequestKey, readOperation, retainOperation, clearOperation, rechargePreview, promotionState, skuLabel } from '@/lib/operations'
import OperationsPromotionForm from '@/components/OperationsPromotionForm.vue'

const route = useRoute(), user = useUserStore()
const tab = computed(() => route.meta.operationTab || 'overview')
const admin = computed(() => user.userInfo?.role === 'admin')
const loading = ref(false), saving = ref(false), error = ref(''), keyword = ref(''), page = ref(1), total = ref(0)
const rows = ref([]), stats = ref(null), plans = ref([]), records = ref([]), templates = ref([]), skuOptions = ref([])
const pending = ref(null), recoveryError = ref('')
try { pending.value = readOperation(localStorage, user.currentStoreId) } catch (e) { recoveryError.value = e.message }
const selected = ref(null), detailOpen = ref(false), detail = ref(null), detailTab = ref('wallet')
const kind = ref(''), dialogOpen = ref(false), form = reactive({}), memberOptions = ref([])
const walletTab = ref('plans'), couponTab = ref('templates')
const ledgerFilters = reactive({ keyword: '', type: '', dates: [] })
const ledgerQuery = reactive({ keyword: '', type: '', dates: [] })
const couponFilter = ref('all'), activityFilter = ref('all'), dialogLoading = ref(false), formError = ref('')
const operationMember = ref(null), memberLoading = ref(false), memberError = ref(''), posterUploading = ref(false)
const selectedPlan = computed(() => plans.value.find(p => String(p.id) === String(form.planId)))
const recharge = computed(() => rechargePreview(operationMember.value, selectedPlan.value?.amount ?? form.amount, selectedPlan.value?.bonus ?? form.bonus))
const visibleCoupons = computed(() => rows.value.filter(row => couponFilter.value === 'all' || promotionState(row, clock.value, true).value === couponFilter.value))
const visibleActivities = computed(() => rows.value.filter(row => activityFilter.value === 'all' || promotionState(row, clock.value).value === activityFilter.value))
const clock = ref(Date.now()), clockTimer = setInterval(() => { clock.value = Date.now() }, 30000)
const dateText = value => value ? String(value).replace('T', ' ').slice(0, 16) : '—'
const displayStatus = row => promotionState({ active: true, endsAt: row.expiresAt }, clock.value).value === 'ended' && row.status === 'AVAILABLE' ? 'EXPIRED' : row.status
const state = (row, coupon = false) => { const result = promotionState(row, clock.value, coupon); return { ...result, label: result.text, type: result.tone } }
const titles = { member: '会员资料', recharge: '现金充值', adjust: '调整钱包', issue: '发放优惠券', plan: '充值套餐', coupon: '优惠券模板', activity: '营销活动' }
const statusLabel = value => ({ ACTIVE: '正常', FROZEN: '已停用', AVAILABLE: '待使用', RESERVED: '订单占用', USED: '已使用', EXPIRED: '已过期', VOID: '已作废', PAID: '已到账', PENDING: '待付款', CLOSED: '已关闭' }[value] || value)
const walletType = value => ({ RECHARGE: '充值入账', PAYMENT: '钱包消费', REFUND: '退款入账', ADJUST: '人工调整' }[value] || value)
let generation = 0, dialogGeneration = 0, memberGeneration = 0, detailGeneration = 0, searchGeneration = 0
async function load() {
  const version = ++generation
  loading.value = true; error.value = ''
  try {
    if (tab.value === 'overview') { const result = await request.get('/operations/dashboard'); if (version === generation) stats.value = result }
    else if (tab.value === 'members') { const result = await request.get('/operations/members', { params: { keyword: keyword.value, page: page.value, size: 20 } }); if (version === generation) { rows.value = result.list; total.value = result.total } }
    else if (tab.value === 'wallet') {
      const [ledger, rechargePlans, rechargeRecords] = await Promise.all([request.get('/operations/wallet-ledger', { params: { page: page.value, size: 20, keyword: ledgerQuery.keyword, type: ledgerQuery.type, startDate: ledgerQuery.dates?.[0], endDate: ledgerQuery.dates?.[1] } }), request.get('/operations/recharge-plans'), request.get('/operations/recharges')])
      if (version === generation) { rows.value = ledger.list; total.value = ledger.total; plans.value = rechargePlans; records.value = rechargeRecords }
    } else if (tab.value === 'coupons') {
      const [list, issued] = await Promise.all([request.get('/operations/coupon-templates'), request.get('/operations/coupon-records')]); if (version === generation) { rows.value = list; records.value = issued; templates.value = list }
    } else { const result = await request.get('/operations/activities'); if (version === generation) rows.value = result }
  } catch (e) { if (version === generation) error.value = e.response?.data?.message || e.message }
  finally { if (version === generation) loading.value = false }
}
async function searchMembers(query = '') { const version = ++searchGeneration; try { const data = await request.get('/operations/members', { params: { keyword: query, size: 100 } }); if (version !== searchGeneration || !dialogOpen.value) return; memberOptions.value = data.list; if (operationMember.value && !memberOptions.value.some(m => m.id === operationMember.value.id)) memberOptions.value.push(operationMember.value) } catch (e) { if (version === searchGeneration) formError.value = e.message } }
async function loadSkus() {
  const first = await request.get('/products', { params: { page: 1, pageSize: 100 } })
  const products = [...(first.list || [])]
  for (let p = 2; p <= Math.ceil(Number(first.total || 0) / 100); p++) { const data = await request.get('/products', { params: { page: p, pageSize: 100 } }); products.push(...(data.list || [])) }
  return products.flatMap(p => (p.skus || []).map(s => ({ id: Number(s.id), label: skuLabel(s, p), price: s.price })))
}
async function inspect(member) { const version = ++detailGeneration; selected.value = member; detail.value = null; detailTab.value = 'wallet'; detailOpen.value = true; try { const [profile, coupons] = await Promise.all([request.get(`/operations/members/${member.id}`), request.get(`/operations/members/${member.id}/coupons`)]); if (version === detailGeneration) detail.value = { ...profile, coupons } } catch (e) { if (version === detailGeneration) { detailOpen.value = false; ElMessage.error(e.message) } } }
async function refreshOperationMember(id) {
  const version = ++memberGeneration; operationMember.value = null; memberError.value = ''; memberLoading.value = !!id
  if (!id) return
  try { const member = await request.get(`/operations/members/${id}`); if (version === memberGeneration) operationMember.value = member }
  catch (e) { if (version === memberGeneration) memberError.value = e.message }
  finally { if (version === memberGeneration) memberLoading.value = false }
}
async function open(type, row = null, target = null) {
  if ((type === 'recharge' || type === 'adjust') && (pending.value || recoveryError.value)) { ElMessage.warning('请先处理原资金操作'); return }
  const version = ++dialogGeneration; searchGeneration++
  kind.value = type; formError.value = ''; operationMember.value = null; memberError.value = ''; for (const key of Object.keys(form)) delete form[key]
  const now = new Date(), later = new Date(Date.now() + 30 * 86400000)
  const local = date => new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 19)
  const member = target || (detailOpen.value ? selected.value : null)
  Object.assign(form, { name: '', phone: '', remark: '', status: 'ACTIVE', amount: 100, bonus: 0, principal: 0, active: true, type: type === 'activity' ? 'REDUCE' : 'CASH', threshold: 100, giftQty: 1, validDays: 30, totalLimit: 1000, perMemberLimit: type === 'activity' ? 0 : 1, selfClaim: true, audience: 'ALL', channel: 'ALL', stackable: false, skuIds: [], rules: [{ threshold: 300, discount: 30, giftQty: 1 }], startsAt: local(now), endsAt: local(later), requestKey: newRequestKey(), memberId: member?.id, cashReceived: false, poster: { enabled: false, imageUrl: '', priority: 0, buttonText: '' } }, row || {})
  for (const key of ['active', 'selfClaim', 'stackable']) form[key] = !!form[key]
  if (row?.rules) form.rules = row.rules.map(r => ({ ...r }))
  form.poster = { enabled: false, imageUrl: '', priority: 0, buttonText: '', ...(row?.poster || {}) }; form.poster.enabled = !!form.poster.enabled
  dialogOpen.value = true; dialogLoading.value = true
  try {
    if (type === 'recharge' || type === 'issue') { const [members, rechargePlans, couponTemplates] = await Promise.all([request.get('/operations/members', { params: { size: 100 } }), request.get('/operations/recharge-plans'), request.get('/operations/coupon-templates')]); if (version !== dialogGeneration) return; memberOptions.value = members.list; if (member && !memberOptions.value.some(m => m.id === member.id)) memberOptions.value.push(member); plans.value = rechargePlans; templates.value = couponTemplates }
    if (type === 'coupon' || type === 'activity') { const options = await loadSkus(); if (version !== dialogGeneration) return; skuOptions.value = options }
    if (['recharge', 'issue', 'adjust'].includes(type) && form.memberId) await refreshOperationMember(form.memberId)
  } catch (e) { if (version === dialogGeneration) formError.value = e.message }
  finally { if (version === dialogGeneration) dialogLoading.value = false }
}
async function submitFinancial(url, body) {
  const intent = retainOperation(localStorage, user.currentStoreId, url, body); pending.value = intent
  try { await request.post(intent.url, intent.body); clearOperation(localStorage, user.currentStoreId); pending.value = null }
  catch (e) { if (e.definitive || [400, 401, 403, 409, 422].includes(e.response?.status)) { clearOperation(localStorage, user.currentStoreId); pending.value = null } throw e }
}
async function recover() { if (saving.value || !pending.value) return; saving.value = true; try { await submitFinancial(pending.value.url, pending.value.body); ElMessage.success('原操作已确认'); await load(); if (selected.value) await inspect(selected.value) } catch (e) { ElMessage.error(e.response?.data?.message || '结果暂未确认，请继续重试原操作') } finally { saving.value = false } }
async function save() {
  if (saving.value || dialogLoading.value || memberLoading.value || posterUploading.value) return
  formError.value = ''
  if (['recharge', 'issue', 'adjust'].includes(kind.value) && (!form.memberId || !operationMember.value || memberError.value)) { formError.value = '请先选择会员并确认会员资料'; return }
  if (kind.value === 'recharge' && (operationMember.value.status !== 'ACTIVE' || !form.cashReceived)) { formError.value = operationMember.value.status !== 'ACTIVE' ? '会员已停用，无法充值' : '请确认已收到本次充值现金'; return }
  saving.value = true
  try {
    const b = JSON.parse(JSON.stringify(form)); let path
    if (['activity', 'coupon'].includes(kind.value) && b.poster.enabled && !b.poster.imageUrl) throw new Error('开启海报弹窗前，请先上传图片')
    if (kind.value === 'activity' && b.audience === 'ALL') b.perMemberLimit = 0
    if (kind.value === 'member') path = `/operations/members${b.id ? `/${b.id}` : ''}`
    if (kind.value === 'plan') path = `/operations/recharge-plans${b.id ? `/${b.id}` : ''}`
    if (kind.value === 'coupon') path = `/operations/coupon-templates${b.id ? `/${b.id}` : ''}`
    if (kind.value === 'activity') path = `/operations/activities${b.id ? `/${b.id}` : ''}`
    if (kind.value === 'recharge') { b.expectedAmount = recharge.value.amount; b.expectedBonus = recharge.value.bonus; await submitFinancial(`/operations/members/${b.memberId}/recharge`, b) }
    else if (kind.value === 'adjust') await submitFinancial(`/operations/members/${b.memberId}/adjust`, b)
    else if (kind.value === 'issue') await request.post(`/operations/members/${b.memberId}/coupons`, b)
    else if (b.id) await request.put(path, b)
    else await request.post(path, b)
    dialogOpen.value = false; ElMessage.success('已保存'); await load(); if (detailOpen.value && selected.value) await inspect(selected.value)
  } catch (e) { formError.value = e.response?.data?.message || e.message || '保存结果暂未确认'; if (kind.value === 'recharge' && !pending.value) { try { plans.value = await request.get('/operations/recharge-plans') } catch { /* Keep the original error visible. */ } } }
  finally { saving.value = false }
}
async function voidCoupon(row) { await ElMessageBox.confirm('作废后会员无法使用这张券，是否继续？', '作废优惠券'); await request.post(`/operations/coupons/${row.id}/void`); await load(); if (selected.value) await inspect(selected.value) }
function filterLedger() { Object.assign(ledgerQuery, { keyword: ledgerFilters.keyword, type: ledgerFilters.type, dates: [...(ledgerFilters.dates || [])] }); page.value = 1; return load() }
function resetLedger() { Object.assign(ledgerFilters, { keyword: '', type: '', dates: [] }); filterLedger() }
watch(() => form.memberId, id => { if (dialogOpen.value && ['recharge', 'issue', 'adjust'].includes(kind.value)) refreshOperationMember(id) })
watch(() => [form.memberId, form.planId, recharge.value.amount, recharge.value.bonus], () => { if (kind.value === 'recharge') form.cashReceived = false })
watch(dialogOpen, value => { if (!value) { dialogGeneration++; memberGeneration++; searchGeneration++; dialogLoading.value = false; memberLoading.value = false; formError.value = '' } })
watch(detailOpen, value => { if (!value) detailGeneration++ })
watch(tab, () => { page.value = 1; selected.value = null; detailOpen.value = false; load() })
onMounted(load)
onBeforeUnmount(() => { generation++; dialogGeneration++; memberGeneration++; detailGeneration++; searchGeneration++; clearInterval(clockTimer) })
</script>

<template>
  <div class="operations" v-loading="loading">
    <div class="page-head">
      <div><span class="page-kicker">门店运营</span><h1>{{ { overview: '运营看板', members: '会员管理', wallet: '会员钱包', coupons: '优惠券', activities: '营销活动' }[tab] }}</h1><p>{{ { overview: '查看会员增长、充值收入与活动效果', members: '管理会员资料，为顾客充值和发放权益', wallet: '充值套餐、钱包流水与充值记录集中管理', coupons: '配置优惠权益，跟踪领取与使用情况', activities: '设置满减与满额送菜，按单笔订单计算优惠' }[tab] }}</p></div>
      <div class="head-actions"><span class="store-scope"><el-icon><OfficeBuilding /></el-icon>仅限本店</span><el-button :icon="Refresh" @click="load">刷新</el-button><el-button v-if="admin && tab !== 'overview'" type="primary" :icon="Plus" :disabled="tab === 'wallet' && !!(pending || recoveryError)" @click="open({ members: 'member', wallet: 'recharge', coupons: 'coupon', activities: 'activity' }[tab])">{{ { members: '新增会员', wallet: '现金充值', coupons: '创建优惠券', activities: '创建活动' }[tab] }}</el-button></div>
    </div>
    <el-alert v-if="error" :title="error" type="error" show-icon :closable="false" class="mb-4" />
    <el-alert v-if="recoveryError" :title="recoveryError" type="error" :closable="false" class="mb-4" />
    <div v-if="pending" class="pending"><div><strong>上次资金操作等待确认</strong><p>请重试原操作，确认结果后再登记新的资金变动。</p></div><el-button :loading="saving" @click="recover">重试原操作</el-button></div>
    <template v-if="tab === 'overview' && stats">
      <div class="metrics"><article><span>会员总数</span><strong>{{ stats.members }}</strong><small>今日新增 {{ stats.newMembers }} 人</small></article><article><span>累计充值收款</span><strong>¥ {{ money(stats.recharge.amount) }}</strong><small>赠送金额 ¥ {{ money(stats.recharge.bonus) }}</small></article><article><span>钱包总余额</span><strong>¥ {{ money(Number(stats.wallet.principal) + Number(stats.wallet.bonus)) }}</strong><small>本金 {{ money(stats.wallet.principal) }} · 赠金 {{ money(stats.wallet.bonus) }}</small></article><article><span>优惠券核销率</span><strong>{{ stats.coupons.issued ? Math.round(stats.coupons.used / stats.coupons.issued * 100) : 0 }}%</strong><small>已用 {{ stats.coupons.used }} / 已发 {{ stats.coupons.issued }}</small></article></div>
      <div class="metrics secondary"><article><span>活动订单</span><strong>{{ stats.promotion.orders }}</strong></article><article><span>金额优惠合计</span><strong>¥ {{ money(stats.promotion.discount) }}</strong></article><article><span>活动订单净销售</span><strong>¥ {{ money(stats.promotion.netSales) }}</strong></article><article><span>赠品零售价值</span><strong>¥ {{ money(stats.giftCost.retailValue) }}</strong></article></div>
      <section class="panel"><h2>近 30 天充值记录</h2><el-table :data="stats.trend" empty-text="还没有充值记录"><el-table-column prop="day" label="日期" /><el-table-column prop="count" label="充值笔数" /><el-table-column label="充值收款"><template #default="{ row }">¥ {{ money(row.amount) }}</template></el-table-column></el-table><p class="footnote">充值收款单独统计；钱包消费计入订单销售。赠品以零售价值展示。</p></section>
    </template>
    <section v-if="tab === 'members'" class="panel members-panel">
      <div class="toolbar"><el-input v-model="keyword" :prefix-icon="Search" aria-label="搜索会员" placeholder="搜索手机号、姓名、会员号" clearable @keyup.enter="page = 1; load()" /><el-button type="primary" plain @click="page = 1; load()">查询</el-button><span class="result-count">共 <strong>{{ total }}</strong> 位会员</span></div>
      <el-table :data="rows" class="member-table">
        <el-table-column label="会员" min-width="210"><template #default="{ row }"><div class="member-cell"><span class="member-avatar">{{ (row.name || '会').slice(0, 1) }}</span><div><strong>{{ row.name }}</strong><span class="table-subline">{{ row.phone || '未绑定手机号' }}</span></div></div></template></el-table-column>
        <el-table-column label="钱包余额" min-width="215"><template #default="{ row }"><strong class="amount-primary">¥{{ money(Number(row.principal) + Number(row.bonus)) }}</strong><span class="table-subline">本金 {{ money(row.principal) }} · 赠金 {{ money(row.bonus) }}</span></template></el-table-column>
        <el-table-column label="累计消费" width="140"><template #default="{ row }"><span class="amount-text">¥{{ money(row.consumption) }}</span><span class="table-subline">{{ row.orderCount }} 笔订单</span></template></el-table-column>
        <el-table-column label="状态" width="100"><template #default="{ row }"><el-tag :type="row.status === 'ACTIVE' ? 'success' : 'info'" effect="light">{{ statusLabel(row.status) }}</el-tag></template></el-table-column>
        <el-table-column label="加入时间" width="160"><template #default="{ row }">{{ dateText(row.createdAt) }}</template></el-table-column>
        <el-table-column label="操作" :width="admin ? 230 : 80" fixed="right"><template #default="{ row }"><div class="row-actions"><el-button v-if="admin" link type="primary" :disabled="row.status !== 'ACTIVE' || !!(pending || recoveryError)" @click="open('recharge', null, row)">充值</el-button><el-button v-if="admin" link type="primary" :disabled="row.status !== 'ACTIVE'" @click="open('issue', null, row)">发券</el-button><el-button link type="primary" @click="inspect(row)">详情</el-button><el-button v-if="admin" link @click="open('member', row)">编辑</el-button></div></template></el-table-column>
        <template #empty><div class="empty-state member-empty"><span class="empty-icon"><el-icon><component :is="keyword ? Search : User" /></el-icon></span><h3>{{ keyword ? '没有找到匹配的会员' : '迎接本店的第一位会员' }}</h3><p>{{ keyword ? '试试手机号、姓名或会员号。' : '顾客可在小程序加入会员，也可由门店手动登记。' }}</p><el-button v-if="admin && !keyword" type="primary" :icon="Plus" @click="open('member')">新增首位会员</el-button></div></template>
      </el-table>
      <el-pagination v-model:current-page="page" :total="total" :page-size="20" layout="total, prev, pager, next" @current-change="load" />
    </section>
    <section v-if="tab === 'wallet'" class="panel">
      <el-tabs v-model="walletTab" class="section-tabs">
        <el-tab-pane label="充值套餐" name="plans">
          <div class="panel-head"><div><h2>充值套餐</h2><p>设置常用充值档位，赠送金额进入会员赠金账户。</p></div><el-button v-if="admin" type="primary" plain @click="open('plan')">新增套餐</el-button></div>
          <div class="plan-grid"><article v-for="plan in plans" :key="plan.id" class="plan" :class="{ inactive: !plan.active }"><div class="plan-head"><h3>{{ plan.name }}</h3><el-tag :type="plan.active ? 'success' : 'info'" size="small">{{ plan.active ? '已启用' : '已停用' }}</el-tag></div><div class="plan-value"><span>充</span> ¥{{ money(plan.amount) }}</div><p class="plan-bonus">赠送 <strong>¥{{ money(plan.bonus) }}</strong><span>到账 ¥{{ money(Number(plan.amount) + Number(plan.bonus)) }}</span></p><div v-if="admin" class="plan-actions"><el-button type="primary" plain :disabled="!plan.active || !!(pending || recoveryError)" @click="open('recharge', { planId: plan.id })">为会员充值</el-button><el-button link type="primary" @click="open('plan', plan)">编辑</el-button></div></article></div>
          <div v-if="!plans.length" class="empty-state"><span class="empty-icon">¥</span><h3>还没有充值套餐</h3><p>新增“充 500 送 50”等常用档位，让收银登记更方便。</p><el-button v-if="admin" type="primary" plain @click="open('plan')">创建首个套餐</el-button></div>
        </el-tab-pane>
        <el-tab-pane label="钱包流水" name="ledger">
          <div class="panel-head"><div><h2>钱包流水</h2><p>查看本金、赠金的每笔变动与变动后余额。</p></div><span class="result-count">共 {{ total }} 条</span></div>
          <div class="filter-bar"><el-input v-model="ledgerFilters.keyword" clearable placeholder="会员姓名、手机号、会员号" @keyup.enter="filterLedger" /><el-select v-model="ledgerFilters.type" clearable placeholder="全部类型"><el-option v-for="type in ['RECHARGE', 'PAYMENT', 'REFUND', 'ADJUST']" :key="type" :value="type" :label="walletType(type)" /></el-select><el-date-picker v-model="ledgerFilters.dates" type="daterange" value-format="YYYY-MM-DD" start-placeholder="开始日期" end-placeholder="结束日期" range-separator="至" /><el-button type="primary" @click="filterLedger">查询</el-button><el-button @click="resetLedger">重置</el-button></div>
          <el-table :data="rows" empty-text="当前条件下没有钱包流水"><el-table-column label="会员" min-width="180"><template #default="{ row }"><strong>{{ row.name }}</strong><span class="table-subline">{{ row.phone }}</span></template></el-table-column><el-table-column label="类型" width="120"><template #default="{ row }"><el-tag :type="['RECHARGE', 'REFUND'].includes(row.type) ? 'success' : 'info'" effect="plain">{{ walletType(row.type) }}</el-tag></template></el-table-column><el-table-column label="金额变动" min-width="210"><template #default="{ row }"><strong :class="Number(row.principalDelta) + Number(row.bonusDelta) >= 0 ? 'amount-in' : 'amount-out'">{{ Number(row.principalDelta) + Number(row.bonusDelta) >= 0 ? '+' : '' }}{{ money(Number(row.principalDelta) + Number(row.bonusDelta)) }}</strong><span class="table-subline">本金 {{ money(row.principalDelta) }} · 赠金 {{ money(row.bonusDelta) }}</span></template></el-table-column><el-table-column label="变动后余额" width="135"><template #default="{ row }">¥{{ money(Number(row.principalAfter) + Number(row.bonusAfter)) }}</template></el-table-column><el-table-column prop="remark" label="说明" min-width="180" /><el-table-column label="时间" width="165"><template #default="{ row }">{{ dateText(row.createdAt) }}</template></el-table-column></el-table><el-pagination v-model:current-page="page" :total="total" :page-size="20" layout="total, prev, pager, next" @current-change="load" />
        </el-tab-pane>
        <el-tab-pane label="充值记录" name="records"><div class="panel-head"><div><h2>充值记录</h2><p>最近 200 笔充值单，区分实收本金与赠送金额。</p></div></div><el-table :data="records" empty-text="还没有充值记录"><el-table-column prop="rechargeNo" label="充值单号" min-width="230" /><el-table-column label="会员" min-width="160"><template #default="{ row }">{{ row.name }}<span class="table-subline">{{ row.phone }}</span></template></el-table-column><el-table-column label="实收本金" width="130"><template #default="{ row }">¥{{ money(row.amount) }}</template></el-table-column><el-table-column label="赠送金额" width="130"><template #default="{ row }">¥{{ money(row.bonus) }}</template></el-table-column><el-table-column label="渠道" width="90"><template #default="{ row }">{{ { cash: '现金', wechat: '微信', demo: '演示' }[row.channel] }}</template></el-table-column><el-table-column label="状态" width="100"><template #default="{ row }"><el-tag :type="row.status === 'PAID' ? 'success' : 'info'">{{ statusLabel(row.status) }}</el-tag></template></el-table-column><el-table-column label="创建时间" width="165"><template #default="{ row }">{{ dateText(row.createdAt) }}</template></el-table-column></el-table></el-tab-pane>
      </el-tabs>
    </section>
    <section v-if="tab === 'coupons'" class="panel">
      <el-tabs v-model="couponTab" class="section-tabs"><el-tab-pane label="优惠券模板" name="templates">
        <div class="panel-head"><div><h2>优惠券模板</h2><p>优惠金额、领取门槛与开放时间一目了然。</p></div><el-button v-if="admin" type="primary" plain @click="open('issue')">给会员发券</el-button></div>
        <el-radio-group v-model="couponFilter" class="status-filters"><el-radio-button label="all">全部</el-radio-button><el-radio-button label="active">可领取</el-radio-button><el-radio-button label="upcoming">未开始</el-radio-button><el-radio-button label="ended">已结束</el-radio-button><el-radio-button label="disabled">已停用</el-radio-button><el-radio-button label="manual">门店发放</el-radio-button><el-radio-button label="exhausted">已领完</el-radio-button></el-radio-group>
        <div class="coupon-grid"><article v-for="coupon in visibleCoupons" :key="coupon.id" class="coupon-card" :class="{ inactive: ['disabled', 'ended', 'exhausted'].includes(state(coupon, true).value) }"><div class="coupon-main"><div class="coupon-amount"><template v-if="coupon.type === 'CASH'"><span>¥</span>{{ money(coupon.amount) }}</template><template v-else><span class="exchange-label">兑换</span>{{ coupon.giftQty || 1 }}<span>份</span></template><small>{{ Number(coupon.threshold) ? `满 ${money(coupon.threshold)} 元可用` : '无消费门槛' }}</small></div><div class="coupon-info"><el-tag :type="state(coupon, true).type" size="small">{{ state(coupon, true).label }}</el-tag><h3>{{ coupon.name }}</h3><p>{{ coupon.type === 'CASH' ? '满减券' : '菜品兑换券' }} · 领取后 {{ coupon.validDays }} 天有效</p></div></div><div class="coupon-footer"><div><p>{{ dateText(coupon.startsAt) }} 至 {{ dateText(coupon.endsAt) }}</p><span>已发 {{ coupon.issued }} / {{ coupon.totalLimit }} 张 · 每人 {{ coupon.perMemberLimit }} 张</span></div><el-button v-if="admin" link type="primary" @click="open('coupon', coupon)">编辑</el-button></div></article></div>
        <div v-if="!visibleCoupons.length" class="empty-state"><span class="empty-icon">券</span><h3>{{ rows.length ? '该状态下暂无优惠券' : '创建第一张优惠券' }}</h3><p>用满减券或菜品兑换券吸引顾客再次到店。</p><el-button v-if="admin && !rows.length" type="primary" plain @click="open('coupon')">创建首张优惠券</el-button></div>
      </el-tab-pane><el-tab-pane label="发放与使用记录" name="records"><div class="panel-head"><div><h2>发放与使用记录</h2><p>最近 200 条记录，可查看核销订单与到期时间。</p></div></div><el-table :data="records" empty-text="还没有发券记录"><el-table-column prop="snapshot.name" label="优惠券" min-width="180" /><el-table-column label="会员" min-width="170"><template #default="{ row }">{{ row.memberName }}<span class="table-subline">{{ row.phone }}</span></template></el-table-column><el-table-column label="状态" width="110"><template #default="{ row }"><el-tag :type="displayStatus(row) === 'AVAILABLE' ? 'success' : 'info'">{{ statusLabel(displayStatus(row)) }}</el-tag></template></el-table-column><el-table-column prop="orderId" label="关联订单" width="110" /><el-table-column label="到期时间" width="165"><template #default="{ row }">{{ dateText(row.expiresAt) }}</template></el-table-column><el-table-column label="操作" width="80"><template #default="{ row }"><el-button v-if="admin && displayStatus(row) === 'AVAILABLE'" link type="danger" @click="voidCoupon(row)">作废</el-button></template></el-table-column></el-table></el-tab-pane></el-tabs>
    </section>
    <section v-if="tab === 'activities'" class="panel">
      <div class="panel-head"><div><h2>节日与日常活动</h2><p>按订单达到的最高档位计算，支持会员专享和渠道限制。</p></div><span class="result-count">共 {{ rows.length }} 个活动</span></div>
      <el-radio-group v-model="activityFilter" class="status-filters"><el-radio-button label="all">全部</el-radio-button><el-radio-button label="active">进行中</el-radio-button><el-radio-button label="upcoming">未开始</el-radio-button><el-radio-button label="ended">已结束</el-radio-button><el-radio-button label="disabled">已停用</el-radio-button></el-radio-group>
      <el-table :data="visibleActivities"><el-table-column label="活动名称" min-width="220"><template #default="{ row }"><div class="activity-name"><span :class="row.type === 'REDUCE' ? 'reduce-icon' : 'gift-icon'">{{ row.type === 'REDUCE' ? '减' : '赠' }}</span><div><strong>{{ row.name }}</strong><span class="table-subline">{{ row.type === 'REDUCE' ? '满减活动' : '满额送菜' }}</span></div></div></template></el-table-column><el-table-column label="优惠规则" min-width="260"><template #default="{ row }"><div class="rule-chips"><span v-for="(rule, i) in row.rules" :key="i">满 {{ money(rule.threshold) }} {{ row.type === 'REDUCE' ? `减 ${money(rule.discount)}` : `送 ${rule.giftQty || 1} 份` }}</span></div></template></el-table-column><el-table-column label="参与范围" width="125"><template #default="{ row }">{{ row.audience === 'MEMBER' ? '会员专享' : '全部顾客' }}<span class="table-subline">{{ { ALL: '全部渠道', CASHIER: '收银台', CUSTOMER: '顾客点单' }[row.channel] }}</span></template></el-table-column><el-table-column label="活动时间" width="175"><template #default="{ row }">{{ dateText(row.startsAt) }}<span class="table-subline">至 {{ dateText(row.endsAt) }}</span></template></el-table-column><el-table-column label="状态" width="110"><template #default="{ row }"><el-tag :type="state(row).type">{{ state(row).label }}</el-tag></template></el-table-column><el-table-column v-if="admin" label="操作" width="80" fixed="right"><template #default="{ row }"><el-button link type="primary" @click="open('activity', row)">编辑</el-button></template></el-table-column><template #empty><div class="empty-state"><span class="empty-icon">惠</span><h3>{{ rows.length ? '该状态下暂无活动' : '开始策划一场门店活动' }}</h3><p>例如：国庆满 300 减 30，或消费满额赠送菜品。</p><el-button v-if="admin && !rows.length" type="primary" plain @click="open('activity')">创建首个活动</el-button></div></template></el-table>
      <p class="footnote">满减活动与一张优惠券互斥；满赠可设置叠加。退款按实付金额计算，赠品无需退回。</p>
    </section>

    <el-drawer v-model="detailOpen" :title="detail?.name || selected?.name || '会员详情'" size="min(720px, 96vw)">
      <div v-if="!detail" v-loading="true" class="drawer-loading" />
      <template v-else><div class="member-summary"><div class="member-cell"><span class="member-avatar large">{{ (detail.name || '会').slice(0, 1) }}</span><div><strong>{{ detail.name }}</strong><p>{{ detail.phone || '未绑定手机号' }}</p><el-tag :type="detail.status === 'ACTIVE' ? 'success' : 'info'" size="small">{{ statusLabel(detail.status) }}</el-tag></div></div><div class="member-wallet"><small>可用余额</small><strong>¥{{ money(Number(detail.principal) + Number(detail.bonus)) }}</strong><p>本金 {{ money(detail.principal) }} · 赠金 {{ money(detail.bonus) }}</p></div></div><div v-if="admin" class="member-detail-actions"><el-button type="primary" :disabled="detail.status !== 'ACTIVE' || !!(pending || recoveryError)" @click="open('recharge')">现金充值</el-button><el-button :disabled="detail.status !== 'ACTIVE'" @click="open('issue')">发放优惠券</el-button><el-button :disabled="!!(pending || recoveryError)" @click="open('adjust')">调整余额</el-button></div><el-tabs v-model="detailTab"><el-tab-pane label="钱包流水" name="wallet"><el-table :data="detail.ledger" empty-text="暂无钱包流水"><el-table-column label="类型"><template #default="{ row }">{{ walletType(row.type) }}</template></el-table-column><el-table-column label="金额变动"><template #default="{ row }">{{ money(Number(row.principalDelta) + Number(row.bonusDelta)) }}</template></el-table-column><el-table-column prop="remark" label="说明" /><el-table-column label="时间" width="165"><template #default="{ row }">{{ dateText(row.createdAt) }}</template></el-table-column></el-table></el-tab-pane><el-tab-pane label="优惠券" name="coupons"><el-table :data="detail.coupons" empty-text="暂无优惠券"><el-table-column prop="snapshot.name" label="券名称" /><el-table-column label="状态"><template #default="{ row }">{{ statusLabel(displayStatus(row)) }}</template></el-table-column><el-table-column label="到期时间"><template #default="{ row }">{{ dateText(row.expiresAt) }}</template></el-table-column></el-table></el-tab-pane><el-tab-pane label="消费订单" name="orders"><el-table :data="detail.orders" empty-text="暂无消费订单"><el-table-column prop="orderNo" label="订单号" min-width="230" /><el-table-column label="实付"><template #default="{ row }">{{ money(row.amountPaid) }}</template></el-table-column><el-table-column label="退款"><template #default="{ row }">{{ money(row.amountRefunded) }}</template></el-table-column></el-table></el-tab-pane></el-tabs></template>
    </el-drawer>
    <el-dialog v-model="dialogOpen" :title="titles[kind]" :width="['coupon', 'activity'].includes(kind) ? 'min(1080px, 96vw)' : 'min(620px, 96vw)'" :close-on-click-modal="false" :close-on-press-escape="!saving && !posterUploading" :show-close="!saving && !posterUploading" class="operations-dialog">
      <el-alert v-if="formError" :title="formError" type="error" show-icon :closable="false" class="mb-4" />
      <el-form v-loading="dialogLoading" label-width="105px" :disabled="saving || dialogLoading || (!!pending && ['recharge', 'adjust'].includes(kind))">
        <OperationsPromotionForm v-if="['coupon', 'activity'].includes(kind)" :kind="kind" :form="form" :sku-options="skuOptions" @poster-uploading="posterUploading = $event" />
        <template v-else>
          <el-form-item v-if="['member', 'plan'].includes(kind)" label="名称" required><el-input v-model="form.name" maxlength="64" :placeholder="kind === 'plan' ? '例如：充500送50' : '输入会员姓名'" /></el-form-item>
          <template v-if="kind === 'member'"><el-form-item label="手机号" required><el-input v-model="form.phone" :disabled="!!form.id" maxlength="11" placeholder="输入手机号" /></el-form-item><el-form-item label="状态"><el-radio-group v-model="form.status"><el-radio label="ACTIVE">正常</el-radio><el-radio label="FROZEN">停用</el-radio></el-radio-group></el-form-item><el-form-item label="备注"><el-input v-model="form.remark" maxlength="255" type="textarea" placeholder="会员偏好或其他备注" /></el-form-item></template>
          <el-form-item v-if="kind === 'recharge' || kind === 'issue'" label="会员" required><el-select v-model="form.memberId" filterable remote :remote-method="searchMembers" placeholder="搜索会员姓名或手机号" class="w-full"><el-option v-for="m in memberOptions" :key="m.id" :value="m.id" :label="`${m.name} ${m.phone || ''}`" :disabled="m.status !== 'ACTIVE'" /></el-select></el-form-item>
          <el-alert v-if="memberError" :title="memberError" type="error" :closable="false" class="mb-4" />
          <template v-if="kind === 'recharge'"><div v-if="operationMember" class="recharge-member"><div><strong>{{ operationMember.name }}</strong><span>{{ operationMember.phone }}</span></div><span>当前余额 <strong>¥{{ money(Number(operationMember.principal) + Number(operationMember.bonus)) }}</strong></span></div><el-form-item label="充值档位"><div class="recharge-choices"><button v-for="p in plans.filter(p => p.active)" :key="p.id" type="button" class="recharge-choice" :class="{ chosen: form.planId === p.id }" :disabled="saving || dialogLoading || !!pending" @click="form.planId = p.id"><strong>充 ¥{{ money(p.amount) }}</strong><span>赠 ¥{{ money(p.bonus) }}</span></button><button type="button" class="recharge-choice" :class="{ chosen: !form.planId }" :disabled="saving || dialogLoading || !!pending" @click="form.planId = null"><strong>自定义</strong><span>填写充值金额</span></button></div></el-form-item></template>
          <template v-if="kind === 'plan' || (kind === 'recharge' && !form.planId)"><el-form-item label="实收本金" required><el-input-number v-model="form.amount" :min="0.01" :precision="2" /><span class="field-unit">元</span></el-form-item><el-form-item label="赠送金额"><el-input-number v-model="form.bonus" :min="0" :precision="2" /><span class="field-unit">元</span></el-form-item></template>
          <div v-if="kind === 'recharge' || kind === 'plan'" v-loading="memberLoading" class="recharge-preview"><span class="preview-title">到账预览</span><div class="credit-equation"><div><small>实收本金</small><strong>¥{{ money(recharge.amount) }}</strong></div><span>＋</span><div><small>赠送金额</small><strong>¥{{ money(recharge.bonus) }}</strong></div><span>＝</span><div class="credit-total"><small>钱包到账</small><strong>¥{{ money(recharge.credited) }}</strong></div></div><div v-if="kind === 'recharge'" class="balance-projection"><template v-if="operationMember"><div>充值后余额 <strong>¥{{ money(recharge.balanceAfter) }}</strong></div><span>本金 ¥{{ money(recharge.principalAfter) }} · 赠金 ¥{{ money(recharge.bonusAfter) }}</span></template><span v-else>选择会员后，将显示充值后的钱包余额。</span></div></div>
          <el-form-item v-if="kind === 'recharge'" label="收款确认" class="receipt-check"><el-checkbox v-model="form.cashReceived">已收到现金 ¥{{ money(recharge.amount) }}</el-checkbox><p class="footnote">请收到现金后登记；微信充值由会员在小程序发起。</p></el-form-item>
          <template v-if="kind === 'adjust'"><el-alert title="输入变动金额：正数增加，负数减少。此操作会记录操作人与原因。" type="info" :closable="false" class="mb-4" /><el-form-item label="本金变动"><el-input-number v-model="form.principal" :precision="2" /></el-form-item><el-form-item label="赠金变动"><el-input-number v-model="form.bonus" :precision="2" /></el-form-item><el-form-item label="调整原因" required><el-input v-model="form.reason" type="textarea" maxlength="255" /></el-form-item></template>
          <template v-if="kind === 'issue'"><el-form-item label="优惠券" required><el-select v-model="form.templateId" class="w-full" placeholder="选择要发放的优惠券"><el-option v-for="t in templates.filter(t => t.active)" :key="t.id" :value="t.id" :label="t.name" /></el-select></el-form-item><div v-if="operationMember && form.templateId" class="issue-preview">将向 <strong>{{ operationMember.name }}</strong> 发放 <strong>{{ templates.find(t => t.id === form.templateId)?.name }}</strong> 1 张</div></template>
          <el-form-item v-if="kind === 'plan'" label="启用状态"><el-switch v-model="form.active" active-text="保存后启用" /></el-form-item>
        </template>
      </el-form><template #footer><div class="dialog-footer"><span v-if="['coupon', 'activity'].includes(kind)">保存前请核对优惠规则</span><div><el-button :disabled="saving || posterUploading" @click="dialogOpen = false">关闭</el-button><el-button type="primary" :loading="saving" :disabled="dialogLoading || memberLoading || posterUploading || (['recharge', 'adjust'].includes(kind) && !!pending) || (['recharge', 'adjust', 'issue'].includes(kind) && !!memberError)" @click="save">{{ { recharge: '确认充值到账', issue: '确认发券' }[kind] || '保存' }}</el-button></div></div></template>
    </el-dialog>
  </div>
</template>

<style scoped>
.operations{max-width:1600px;margin:auto;color:#334155}.page-head{display:flex;justify-content:space-between;align-items:center;gap:20px;margin-bottom:26px}.page-kicker{font-size:12px;letter-spacing:1px;color:#64748b}.page-head h1{font-size:26px;font-weight:700;line-height:1.4;color:#0f172a;margin-top:5px}.page-head p,.footnote{color:#64748b;font-size:13px;line-height:1.8;margin-top:8px}.head-actions{display:flex;align-items:center;gap:12px}.head-actions .el-button+.el-button{margin-left:0}.panel{background:white;border:1px solid #e2e8f0;border-radius:14px;padding:24px;margin-bottom:22px;box-shadow:0 2px 6px #0f172a03}.panel h2{font-size:16px;font-weight:650;margin-bottom:16px;color:#0f172a}.panel-head{display:flex;justify-content:space-between;align-items:center;gap:16px;margin-bottom:22px}.panel-head h2{margin-bottom:5px}.panel-head p{font-size:12px;color:#64748b;line-height:1.8}.toolbar{display:flex;align-items:center;gap:12px;margin-bottom:20px}.toolbar .el-input{max-width:320px}.result-count{font-size:12px;color:#94a3b8;white-space:nowrap}.toolbar .result-count{margin-left:auto}.member-cell,.activity-name{display:flex;align-items:center;gap:12px}.member-cell strong,.activity-name strong{font-weight:600;color:#0f172a}.member-avatar{width:36px;height:36px;flex-shrink:0;border-radius:11px;background:#eff6ff;color:#2563eb;display:grid;place-items:center;font-weight:600}.member-avatar.large{width:48px;height:48px;border-radius:14px;font-size:20px}.table-subline{display:block;font-size:12px;color:#64748b;line-height:1.7;margin-top:4px}.amount-primary{font-size:17px;font-weight:650;color:#0f172a;font-variant-numeric:tabular-nums}.amount-text,.amount-in,.amount-out{font-variant-numeric:tabular-nums}.amount-in{color:#059669;font-size:15px}.amount-out{color:#334155;font-size:15px}.row-actions{display:flex;align-items:center;gap:14px}.row-actions .el-button+.el-button{margin-left:0}.empty-state{padding:48px 20px;text-align:center;line-height:1.8}.empty-icon{width:48px;height:48px;margin:0 auto 16px;display:grid;place-items:center;border-radius:14px;background:#f1f5f9;color:#94a3b8;font-size:22px}.empty-state h3{font-size:15px;color:#475569;font-weight:600;margin-bottom:6px}.empty-state p{font-size:12px;color:#94a3b8}.empty-state .el-button{margin-top:18px}.metrics{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:18px;margin-bottom:22px}.metrics article{background:white;border:1px solid #e2e8f0;border-radius:14px;padding:22px;display:flex;flex-direction:column;gap:10px}.metrics span{color:#64748b;font-size:13px}.metrics strong{font-size:28px;color:#0f172a;letter-spacing:-.5px}.metrics small{color:#64748b;font-size:12px}.secondary strong{font-size:23px}.section-tabs:deep(.el-tabs__header){margin-bottom:24px}.section-tabs:deep(.el-tabs__item){font-size:14px;padding-right:28px;padding-left:28px}.plan-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:18px}.plan{border:1px solid #dbeafe;border-radius:12px;padding:22px;background:linear-gradient(145deg,#eff6ff99,#fff 70%)}.plan-head{display:flex;justify-content:space-between;gap:12px;align-items:center}.plan h3{font-size:14px;font-weight:650;color:#1e293b}.plan-value{font-size:29px;font-weight:700;color:#2563eb;margin:22px 0 12px;font-variant-numeric:tabular-nums;letter-spacing:-.5px}.plan-value>span{font-size:13px;font-weight:400}.plan-bonus{font-size:12px;color:#64748b}.plan-bonus strong{color:#2563eb}.plan-bonus>span{display:block;margin-top:8px;font-size:11px;color:#94a3b8}.plan-actions{display:flex;justify-content:space-between;align-items:center;margin-top:22px;padding-top:16px;border-top:1px dashed #dbeafe}.inactive{background:#f8fafc;border-color:#e2e8f0}.inactive .plan-value,.inactive .coupon-amount{color:#94a3b8}.filter-bar{display:flex;flex-wrap:wrap;gap:10px;padding:16px;background:#f8fafc;border-radius:10px;margin-bottom:20px}.filter-bar .el-input{width:240px}.filter-bar .el-select{width:145px}.filter-bar .el-date-editor{max-width:320px;flex:0 1 320px}.filter-bar .el-button+.el-button{margin-left:0}.status-filters{display:flex;flex-wrap:wrap;margin-bottom:24px;gap:0}.status-filters:deep(.el-radio-button__inner){font-size:12px;padding:9px 15px}.coupon-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:18px}.coupon-card{border:1px solid #dbeafe;border-radius:12px;overflow:hidden;background:#fff}.coupon-main{display:flex;align-items:center;min-height:130px}.coupon-amount{width:155px;flex-shrink:0;align-self:stretch;display:flex;flex-wrap:wrap;justify-content:center;align-content:center;align-items:baseline;background:#eff6ff70;color:#2563eb;font-size:33px;font-weight:750;letter-spacing:-1px;padding:14px 10px;border-right:1px dashed #bfdbfe;font-variant-numeric:tabular-nums}.coupon-amount>span{font-size:15px;letter-spacing:0;margin:0 3px}.coupon-amount .exchange-label{font-size:12px}.coupon-amount small{width:100%;text-align:center;font-size:11px;font-weight:400;letter-spacing:0;margin-top:8px}.coupon-info{padding:20px;min-width:0}.coupon-info h3{font-size:15px;font-weight:650;color:#0f172a;margin-top:12px;overflow-wrap:anywhere}.coupon-info p{font-size:11px;color:#94a3b8;margin-top:7px}.coupon-footer{border-top:1px dashed #e2e8f0;padding:14px 18px;display:flex;justify-content:space-between;align-items:center;gap:10px}.coupon-footer p{font-size:11px;color:#64748b;line-height:1.6}.coupon-footer span{font-size:11px;color:#94a3b8;display:block;margin-top:4px}.coupon-card.inactive .coupon-amount{background:#f8fafc;border-color:#e2e8f0}.reduce-icon,.gift-icon{width:36px;height:36px;display:grid;place-items:center;border-radius:10px;background:#eff6ff;color:#2563eb;flex-shrink:0;font-weight:600}.gift-icon{background:#f5f3ff;color:#7c3aed}.rule-chips{display:flex;flex-wrap:wrap;gap:6px}.rule-chips>span{background:#f8fafc;border:1px solid #e2e8f0;border-radius:5px;padding:3px 8px;color:#475569;font-size:12px;white-space:nowrap}.pending{display:flex;align-items:center;justify-content:space-between;gap:16px;padding:16px;background:#fff7ed;border:1px solid #fed7aa;border-radius:10px;margin-bottom:16px}.pending strong{font-size:13px;color:#9a3412}.pending p{font-size:12px;color:#c2410c;margin-top:4px}.member-summary{background:#eff6ff;border:1px solid #dbeafe;border-radius:12px;padding:22px;display:flex;justify-content:space-between;gap:18px;margin-bottom:20px}.member-summary p{color:#64748b;font-size:12px;margin:6px 0}.member-wallet{text-align:right}.member-wallet small{font-size:11px;color:#64748b}.member-wallet strong{display:block;font-size:26px;font-weight:700;color:#0f172a;margin-top:8px}.member-detail-actions{display:flex;gap:10px;margin-bottom:22px}.member-detail-actions .el-button+.el-button{margin-left:0}.drawer-loading{min-height:220px}.field-unit{font-size:12px;color:#64748b;margin-left:10px}.recharge-member{padding:14px 16px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:9px;margin-bottom:20px;display:flex;justify-content:space-between;gap:12px;font-size:12px}.recharge-member>div{display:flex;gap:10px;align-items:center}.recharge-member strong{color:#1e293b}.recharge-member span{color:#64748b}.recharge-choices{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;width:100%;max-height:230px;overflow:auto}.recharge-choice{border:1px solid #e2e8f0;border-radius:8px;cursor:pointer;text-align:left;padding:10px 12px;background:white;line-height:1.6;color:#475569;transition:background .15s,border-color .15s}.recharge-choice strong{font-size:12px;display:block}.recharge-choice>span{font-size:11px;color:#94a3b8}.recharge-choice.chosen{background:#eff6ff;border-color:#3b82f6;color:#2563eb}.recharge-choice.chosen>span{color:#60a5fa}.recharge-choice:disabled{cursor:default;opacity:.65}.recharge-preview{border:1px solid #dbeafe;background:#eff6ff80;border-radius:12px;padding:18px;margin:18px 0 22px}.preview-title{font-size:11px;color:#64748b}.credit-equation{display:flex;justify-content:space-between;align-items:center;gap:8px;margin-top:14px}.credit-equation>div{display:flex;flex-direction:column;gap:8px}.credit-equation small{font-size:11px;color:#64748b}.credit-equation strong{font-size:20px;color:#1e293b;font-weight:650;font-variant-numeric:tabular-nums}.credit-equation>span{color:#94a3b8;font-size:18px}.credit-equation .credit-total strong{color:#2563eb}.balance-projection{margin-top:18px;border-top:1px dashed #bfdbfe;padding-top:14px;font-size:12px;color:#64748b;line-height:1.8}.balance-projection>div{display:flex;align-items:center;justify-content:space-between;color:#334155}.balance-projection strong{color:#2563eb;font-size:19px;font-weight:700}.balance-projection>span{font-size:11px}.receipt-check .footnote{width:100%;font-size:11px}.issue-preview{font-size:13px;line-height:1.8;background:#eff6ff;border:1px solid #dbeafe;color:#475569;padding:16px;border-radius:10px}.issue-preview strong{color:#2563eb}.dialog-footer{display:flex;justify-content:space-between;align-items:center;gap:12px}.dialog-footer>span{font-size:11px;color:#94a3b8}.dialog-footer>div{margin-left:auto}:deep(.operations-dialog .el-dialog__body){max-height:calc(90vh - 150px);overflow-y:auto;padding-top:12px}:deep(.operations-dialog .el-dialog__header){padding-bottom:20px}:deep(.el-table){font-size:13px}:deep(.el-table th.el-table__cell){background:#f8fafc;color:#64748b;font-size:12px;font-weight:500}:deep(.el-table .el-table__cell){padding:15px 0}:deep(.el-table .cell){line-height:1.5}:deep(.el-pagination){margin-top:22px;justify-content:flex-end}@media(min-width:1450px){.coupon-grid{grid-template-columns:repeat(3,minmax(0,1fr))}.coupon-amount{width:135px}.coupon-info{padding:16px}}@media(max-width:1000px){.metrics{grid-template-columns:repeat(2,minmax(0,1fr))}.plan-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.coupon-grid{grid-template-columns:1fr}}@media(max-width:750px){.page-head{align-items:flex-start;flex-direction:column}.head-actions{width:100%;justify-content:flex-end}.head-actions .store-scope{margin-right:auto}.panel{padding:16px}.toolbar{flex-wrap:wrap}.toolbar .el-input{max-width:none;flex:1;min-width:180px}.metrics{gap:12px}.metrics article{padding:16px}.metrics strong{font-size:22px}.plan-grid{grid-template-columns:1fr}.filter-bar .el-input,.filter-bar .el-select{width:100%}.filter-bar .el-date-editor{width:100%;max-width:none;flex-basis:100%}.member-summary{flex-direction:column}.member-wallet{text-align:left}.member-detail-actions{flex-wrap:wrap}.status-filters:deep(.el-radio-button__inner){padding:8px 10px}.recharge-choices{grid-template-columns:repeat(2,minmax(0,1fr))}.recharge-member{flex-direction:column}.credit-equation strong{font-size:17px}.dialog-footer>span{display:none}.coupon-amount{width:130px}.coupon-info{padding:14px}.coupon-footer{padding:12px}.panel-head{align-items:flex-start}.pending{flex-direction:column;align-items:flex-start}}
.store-scope {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 10px;
  color: #64748b;
  background: #eef2f7;
  border-radius: 6px;
  font-size: 12px;
  white-space: nowrap;
}
.head-actions .el-button,
.members-panel .toolbar .el-button,
.member-empty .el-button {
  height: 38px;
  padding: 0 16px;
  font-weight: 500;
}
.head-actions .el-button--primary,
.member-empty .el-button--primary {
  box-shadow: 0 3px 8px #2563eb14;
}
.members-panel {
  padding: 24px;
  border-radius: 12px;
  box-shadow: 0 4px 20px #0f172a03;
}
.members-panel .toolbar {
  gap: 10px;
  margin-bottom: 22px;
}
.members-panel .toolbar .el-input {
  max-width: 360px;
}
.members-panel .toolbar :deep(.el-input__wrapper) {
  min-height: 38px;
  padding-right: 12px;
  padding-left: 12px;
}
.members-panel .toolbar :deep(.el-input__prefix) {
  color: #94a3b8;
}
.members-panel .result-count {
  color: #64748b;
  font-size: 13px;
}
.members-panel .result-count strong {
  margin: 0 3px;
  color: #334155;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}
.member-table :deep(th.el-table__cell) {
  color: #475569;
  font-weight: 600;
}
.member-table :deep(.el-table__empty-block) {
  min-height: 320px;
}
.member-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 56px 20px;
}
.member-empty .empty-icon {
  width: 64px;
  height: 64px;
  margin-bottom: 20px;
  border: 1px solid #dbeafe;
  border-radius: 20px;
  background: linear-gradient(145deg, #eff6ff, #f8fafc);
  color: #3b82f6;
  font-size: 28px;
}
.member-empty h3 {
  margin-bottom: 8px;
  color: #334155;
  font-size: 16px;
}
.member-empty p {
  max-width: 360px;
  color: #64748b;
  font-size: 13px;
}
.member-empty .el-button {
  margin-top: 24px;
}
.members-panel :deep(.el-pagination) {
  min-height: 34px;
  margin-top: 18px;
  flex-wrap: wrap;
  row-gap: 8px;
}
@media (max-width: 750px) {
  .members-panel { padding: 16px; }
  .members-panel .toolbar .el-input { flex: 1; max-width: none; }
  .members-panel .toolbar .result-count { width: 100%; margin-left: 0; }
  .member-empty { padding: 44px 16px; }
  .member-table :deep(.el-table-fixed-column--right) { position: static !important; }
  .member-table :deep(.el-table-fixed-column--right::before) { box-shadow: none; }
}
</style>
