<script setup>
import { createRecoveryStorage } from '@/lib/recovery-storage'
import MallSkuEditor from '@/components/MallSkuEditor.vue'
import { skuFields, skuPayload } from '@/lib/mall-product-editor'
import { computed, onBeforeUnmount, onMounted, reactive, ref } from 'vue'
import { useRoute } from 'vue-router'
import { ElMessage } from 'element-plus'
import { useUserStore } from '@/stores/user'
import request from '@/lib/request'
import { canReleaseMallIntent } from '@/lib/mall2'
import { newRequestKey } from '@/lib/operations'
import { mallText, mallMoney, mallDate, mallSpecs, mallProvinces, readMallPending, retainMallPending, clearMallPending, verifyMallResult, mallOperationPermission } from '@/lib/mall'

const route = useRoute(), user = useUserStore()
const recoveryStorage = createRecoveryStorage(localStorage, user.userInfo?.id)
const tab = route.meta.mallTab || 'orders'
const applicationId = user.product('MALL')?.application?.id
const storeId = user.currentStoreId, userId = user.userInfo?.id
const root = `/mall/apps/${applicationId}`
const canTrade = computed(() => user.canTradeProduct('MALL'))
const rows = ref([]), total = ref(0), page = ref(1), keyword = ref(route.query?.keyword || ''), status = ref(route.query?.status || ''), loading = ref(false), error = ref('')
const queue = ref(route.query?.queue || ''), queueCounts = ref({}), quickBusy = ref(false)
const orderQueues = [{ value: '', label: '全部订单', count: 'ALL' }, { value: 'WAIT_SHIP', label: '待发货', count: 'WAIT_SHIP' }, { value: 'WAIT_PICKUP', label: '待自提', count: 'WAIT_PICKUP' }, { value: 'PARTIAL', label: '部分发货', count: 'PARTIAL' }, { value: 'AFTERSALE', label: '售后处理中', count: 'AFTERSALE' }]
const capabilities = ref(null), capabilityError = ref(''), categories = ref([]), categoryError = ref(''), report = ref(null)
const settings = reactive({}), settingsLoaded = ref(false)
const busy = ref(false), pending = ref(null), recoveryError = ref(''), detail = ref(null), detailOpen = ref(false), detailLoading = ref(false), detailError = ref(''), detailTarget = ref(null)
const aftersale = ref(null), aftersaleOpen = ref(false), aftersaleLoading = ref(false), aftersaleError = ref(''), aftersaleTarget = ref(null)
const editor = ref(''), editorError = ref(''), editorUncertain = ref(false), form = reactive({})
let generation = 0, detailGeneration = 0, aftersaleGeneration = 0, disposed = false
try { pending.value = readMallPending(recoveryStorage, storeId, applicationId, userId) } catch (e) { recoveryError.value = e.message }
const blocked = computed(() => busy.value || !!pending.value || !!recoveryError.value)
const titles = { products: '商城商品', orders: '商城订单', aftersales: '退款退货', settings: '商城设置', report: '商城报表' }
const descriptions = { products: '商品单独定价与上下架；启用库存关联后，共享实物数量。', orders: '处理配送、自提和历史订单，订单金额以服务端记录为准。', aftersales: '按商品数量退款、退货与等价规格换货，收货、入库和退款分别留痕。', settings: '设置配送、自提和运费规则，修改不影响已生成订单。', report: '仅统计当前商城应用，点餐收入不在此处。' }
const aftersaleStates = ['REQUESTED', 'APPROVED', 'RETURNING', 'REFUNDING', 'REFUNDED', 'REJECTED', 'EXCHANGE_READY', 'EXCHANGED']
const orderStates = ['PENDING_PAYMENT', 'CANCELING', 'PAID', 'SHIPPED', 'COMPLETED', 'AFTERSALE', 'CANCELED', 'REFUNDED', 'PAYMENT_REVIEW', 'PARTIALLY_SHIPPED']

async function loadCapabilities() {
  capabilityError.value = ''
  try { const value = await request.get(`${root}/capabilities`, { silent: true }); if (!disposed) capabilities.value = value }
  catch (e) { if (!disposed) { capabilities.value = null; capabilityError.value = e.message || '支付与交付状态暂时无法查询' } }
}
async function loadCategories() {
  categoryError.value = ''
  try { const value = await request.get(`${root}/categories`, { silent: true }); if (!disposed) categories.value = value.list || [] }
  catch (e) { if (!disposed) { categories.value = []; categoryError.value = e.message || '分类加载失败' } }
}
async function load() {
  const version = ++generation
  loading.value = true; error.value = ''; rows.value = []; total.value = 0
  if (tab === 'settings') settingsLoaded.value = false
  if (tab === 'report') report.value = null
  try {
    const value = await request.get(`${root}/${tab}`, { params: { keyword: keyword.value || undefined, status: status.value || undefined, ...(tab === 'orders' ? { queue: queue.value || undefined } : {}), page: page.value, size: 20 }, silent: true })
    if (disposed || version !== generation) return
    if (tab === 'settings') { Object.assign(settings, value, { blockedProvinces: value.blockedProvinces || [] }); settingsLoaded.value = true }
    else if (tab === 'report') report.value = value
    else { rows.value = value.list || []; total.value = Number(value.total || 0); if (tab === 'orders') queueCounts.value = value.queueCounts || {} }
  } catch (e) { if (!disposed && version === generation) error.value = e.message || '加载失败，请重试' }
  finally { if (!disposed && version === generation) loading.value = false }
}
function search() { page.value = 1; load() }
function selectQueue(value) { queue.value = value; status.value = ''; search() }
function orderAction(row) {
  if (row.payStatus !== 'PAID' || !['PAID', 'PARTIALLY_SHIPPED'].includes(row.status)) return ''
  if (row.fulfillmentType === 'PICKUP') return row.status === 'PAID' && user.hasPermission('order:pickup', 'MALL') ? '核验自提码' : ''
  return ['EXPRESS', 'LOCAL'].includes(row.fulfillmentType) && user.hasPermission('order:ship', 'MALL') ? '填写发货' : ''
}
async function quickFulfill(row) {
  if (blocked.value || quickBusy.value || !(user.hasPermission('order:ship', 'MALL') || user.hasPermission('order:pickup', 'MALL'))) return
  quickBusy.value = true; error.value = ''
  try {
    const fresh = await request.get(`${root}/orders/${row.id}`, { silent: true })
    if (disposed) return
    if (!orderAction(fresh)) { await load(); error.value = '订单状态已变化，列表已刷新，请核对后再操作'; return }
    open(fresh.fulfillmentType === 'PICKUP' ? 'pickup' : 'ship', fresh)
  } catch (e) { error.value = e.message || '订单加载失败，请重试' }
  finally { quickBusy.value = false }
}
async function inspect(row) {
  const version = ++detailGeneration
  detailOpen.value = true; detailLoading.value = true; detail.value = null; detailError.value = ''; detailTarget.value = row.orderId || row.id
  try { const value = await request.get(`${root}/orders/${row.orderId || row.id}`, { silent: true }); if (!disposed && version === detailGeneration) detail.value = value }
  catch (e) { if (!disposed && version === detailGeneration) detailError.value = e.message || '订单详情加载失败' }
  finally { if (!disposed && version === detailGeneration) detailLoading.value = false }
}
async function inspectAftersale(row) {
  const version = ++aftersaleGeneration
  aftersaleTarget.value = row.id; aftersaleOpen.value = true; aftersaleLoading.value = true; aftersale.value = null; aftersaleError.value = ''
  try { const value = await request.get(`${root}/aftersales/${row.id}`, { silent: true }); if (!disposed && version === aftersaleGeneration) aftersale.value = value }
  catch (e) { if (!disposed && version === aftersaleGeneration) aftersaleError.value = e.message || '售后详情加载失败' }
  finally { if (!disposed && version === aftersaleGeneration) aftersaleLoading.value = false }
}
function editorPermission(type, row = {}) {
  return type === 'product' ? (row.id ? 'product:edit' : 'product:create') : type === 'category' ? (row.id ? 'product:edit' : 'product:create') : type === 'stock' ? 'warehouse:adjust' : type === 'ship' ? 'order:ship' : type === 'pickup' ? 'order:pickup' : 'refund:approve'
}
function canEdit(type, row = {}) { return user.hasPermission(editorPermission(type, row), 'MALL', type === 'category' && !row.id ? 'product:edit' : undefined) }
function manageCategories() {
  if (canEdit('category')) open('category')
  else if (categories.value.length) open('category', categories.value[0])
  else ElMessage.warning('当前账号只能编辑已有分类，请联系管理员新增分类')
}
function open(type, row = {}) {
  if (!canEdit(type, row)) return
  if (blocked.value) { ElMessage.warning('请先处理原商城操作'); return }
  editorError.value = ''; editorUncertain.value = false
  const defaults = type === 'product' ? { name: '', categoryId: null, imageUrl: '', detail: '', status: 'DRAFT', skus: [{ skuCode: '', specsText: '', price: 0.01, stock: 0, weightGrams: 0 }] } : type === 'category' ? { name: '', sortOrder: 0, active: true } : { reason: '', delta: 1, carrier: '', trackingNo: '', pickupCode: '', action: 'APPROVE', restock: false }
  for (const key of Object.keys(form)) delete form[key]
  Object.assign(form, defaults, JSON.parse(JSON.stringify(row)))
  if (['stock', 'decision', 'receive', 'withdraw'].includes(type)) { form.originalReason = row.reason || ''; form.reason = '' }
  if (type === 'pickup') form.pickupCode = ''
  if (type === 'ship' && row.marketing) form.shipItems = row.items.map(item => ({ itemId: item.id, name: item.name, max: Math.max(0, Number(item.qty) - Number(item.shippedQty || 0) - Number(item.unshippedAftersaleQty || 0)), qty: 0 })).filter(item => item.max > 0)
  if (type === 'receive') form.restock = false
  if (type === 'product') form.skus = (row.skus || defaults.skus).map(skuFields)
  editor.value = type
}
function canSubmitEditor() { return canEdit(editor.value, form) }
function closeEditor() { if (!busy.value) editor.value = '' }
function operation(path, body, label, targetId) {
  return { path, body: { ...body, requestKey: newRequestKey() }, label, targetId, createdAt: new Date().toISOString() }
}
async function perform(value) {
  if (busy.value || recoveryError.value || !user.hasPermission(mallOperationPermission(value.path))) return
  try { pending.value = retainMallPending(recoveryStorage, storeId, applicationId, userId, value) }
  catch (e) { recoveryError.value = e.message; return }
  await recover()
}
async function recover() {
  const value = pending.value
  if (!value || busy.value || recoveryError.value) return
  if (!user.hasPermission(mallOperationPermission(value.path))) { error.value = '当前账号无权重试原操作，请联系店长核对'; return }
  busy.value = true; error.value = ''
  try {
    const result = await request.post(`${root}${value.path}`, JSON.parse(JSON.stringify(value.body)), { silent: true })
    if (!verifyMallResult(value, result)) throw new Error('返回结果未能确认原操作，请保留原请求号并核对')
    clearMallPending(recoveryStorage, storeId, applicationId, userId); pending.value = null
    editor.value = ''; ElMessage.success(value.path.endsWith('/refund-retry') ? '已重试原退款，实际退款结果请查询核对' : `${value.label}已完成`)
    await load()
    if (detailOpen.value && detail.value) await inspect({ id: detail.value.id })
    if (aftersaleOpen.value && aftersale.value) await inspectAftersale(aftersale.value)
  } catch (e) {
    if (canReleaseMallIntent(e)) { clearMallPending(recoveryStorage, storeId, applicationId, userId); pending.value = null }
    error.value = e.definitive ? e.message : `${e.message || '连接中断'}。结果未确认，请查询原订单或使用原请求重试。`
  } finally { busy.value = false }
}
async function submit() {
  if (blocked.value || editorUncertain.value || !canSubmitEditor()) return
  const type = editor.value
  editorError.value = ''
  if (['stock', 'decision', 'receive', 'withdraw'].includes(type) && !String(form.reason || '').trim()) { editorError.value = '请填写操作原因'; return }
  if (['ship', 'exchange'].includes(type) && (!form.carrier.trim() || (!form.mockWaybill && !form.trackingNo.trim()))) { editorError.value = '请填写快递公司和物流单号'; return }
  if (type === 'pickup' && !String(form.pickupCode).trim()) { editorError.value = '请输入顾客出示的自提码'; return }
  if (type === 'stock' && (!Number.isInteger(Number(form.delta)) || Number(form.delta) === 0)) { editorError.value = '库存增减必须是非零整数'; return }
  const target = form.id, expectedVersion = form.version
  if (type === 'stock') return perform(operation(`/skus/${target}/stock`, { expectedVersion, delta: Number(form.delta), reason: form.reason }, '库存调整', target))
  if (type === 'withdraw') return perform(operation(`/v2/aftersales/${target}/withdraw`, { expectedVersion, reason: form.reason }, '关闭售后', target))
  if (type === 'exchange') return perform(operation(`/v2/aftersales/${target}/exchange-ship`, { expectedVersion, carrier: form.carrier.trim(), trackingNo: form.trackingNo.trim() }, '换货寄出', target))
  if (type === 'ship' && form.shipItems && !form.shipItems.some(item => item.qty > 0)) { editorError.value = '请选择本次发货商品数量'; return }
  if (type === 'ship') return perform(operation(`/orders/${target}/ship`, { expectedVersion, carrier: form.carrier.trim(), trackingNo: form.trackingNo.trim(), ...(form.shipItems ? { items: form.shipItems.filter(item => item.qty > 0).map(({ itemId, qty }) => ({ itemId, qty })), mockWaybill: !!form.mockWaybill } : {}) }, '订单发货', target))
  if (type === 'pickup') return perform(operation(`/orders/${target}/pickup`, { expectedVersion, pickupCode: String(form.pickupCode).trim() }, '自提核销', target))
  if (type === 'decision') return perform(operation(`/aftersales/${target}/decision`, { expectedVersion, action: form.action, reason: form.reason }, '售后审核', target))
  if (type === 'receive') return perform(operation(`/aftersales/${target}/receive`, { expectedVersion, restock: !!form.restock, reason: form.reason }, '退货验收', target))
  let body
  try {
    body = type === 'product' ? { expectedVersion, name: form.name, categoryId: form.categoryId || null, imageUrl: form.imageUrl, detail: form.detail, status: form.status, skus: skuPayload(form.skus, `SP-${newRequestKey().replace(/[^a-zA-Z0-9]/g, '').slice(0, 20)}`) } : { expectedVersion, name: form.name, sortOrder: form.sortOrder, active: form.active }
  } catch (e) { editorError.value = e.message; return }
  if (!String(form.name || '').trim() || (type === 'product' && !body.skus.length)) { editorError.value = '请填写名称，商品至少需要一个规格'; return }
  busy.value = true
  try {
    const path = `${root}/${type === 'product' ? 'products' : 'categories'}${target ? `/${target}` : ''}`
    const value = target ? await request.put(path, body, { silent: true }) : await request.post(path, body, { silent: true })
    if (!value?.id) throw new Error('保存结果未确认')
    editor.value = ''; ElMessage.success('已保存'); await load(); if (tab === 'products') await loadCategories()
  } catch (e) { editorError.value = e.message || '保存失败'; if (!e.definitive) { editorUncertain.value = true; editorError.value += '。请关闭窗口并刷新列表核对，避免重复创建。' } }
  finally { busy.value = false }
}
async function saveSettings() {
  if (blocked.value || !settingsLoaded.value || !user.hasPermission('settings:edit')) return
  busy.value = true; error.value = ''
  try {
    const value = await request.put(`${root}/settings`, { expectedVersion: settings.version, name: settings.name, notice: settings.notice, contactPhone: settings.contactPhone, pickupAddress: settings.pickupAddress, returnAddress: settings.returnAddress, returnContact: settings.returnContact, returnPhone: settings.returnPhone, expressEnabled: settings.expressEnabled, pickupEnabled: settings.pickupEnabled, shippingFee: settings.shippingFee, freeShippingThreshold: settings.freeShippingThreshold, paymentMinutes: settings.paymentMinutes, blockedProvinces: settings.blockedProvinces }, { silent: true })
    if (value?.version == null) throw new Error('设置保存结果未确认')
    Object.assign(settings, value); ElMessage.success('商城设置已保存')
  } catch (e) { error.value = `${e.message || '保存结果未确认'}。请刷新读取最新设置后再调整。`; settingsLoaded.value = false }
  finally { busy.value = false }
}
async function refundQuery(row) {
  if (busy.value || !user.hasPermission('refund:view', 'MALL')) return
  busy.value = true; error.value = ''
  try { await request.post(`${root}/aftersales/${row.id}/refund-query`, {}, { silent: true }); await load(); if (aftersaleOpen.value) await inspectAftersale(row) }
  catch (e) { error.value = e.message || '退款状态暂未查询成功，请稍后重新核对' }
  finally { busy.value = false }
}
function refundRetry(row) { if (!blocked.value) perform(operation(`/aftersales/${row.id}/refund-retry`, { expectedVersion: row.version }, '原退款重试', row.id)) }
async function upload(options) {
  if (!user.hasPermission(editorPermission('product', form), 'MALL')) return
  if (busy.value || options.file.size > 2 * 1024 * 1024 || !['image/jpeg', 'image/png', 'image/webp'].includes(options.file.type)) { editorError.value = '请选择不超过 2MB 的 JPG、PNG 或 WebP 图片'; return }
  const body = new FormData(); body.append('file', options.file)
  busy.value = true; editorError.value = ''
  try { const result = await request.post('/common/upload', body, { silent: true }); const url = result?.url || result?.path || result?.image || result; if (typeof url !== 'string' || !url) throw new Error('上传未返回图片地址'); form.imageUrl = url; options.onSuccess?.(result) }
  catch (e) { editorError.value = e.message || '图片上传失败'; options.onError?.(e) }
  finally { busy.value = false }
}
onMounted(() => { load(); loadCapabilities(); if (tab === 'products') loadCategories(); if (tab === 'orders' && /^\d+$/.test(String(route.query?.orderId || ''))) inspect({ id: Number(route.query.orderId) }) })
onBeforeUnmount(() => { disposed = true; generation++; detailGeneration++; aftersaleGeneration++ })
</script>

<template>
  <section class="mall-page">
    <header class="page-heading"><div><span class="eyebrow">商城经营</span><h1>{{ titles[tab] }}</h1><p>{{ descriptions[tab] }}</p></div><div class="actions"><el-button :loading="loading" @click="load">刷新</el-button><el-button v-if="tab === 'orders' && user.hasPermission('order:ship', 'MALL')" @click="$router.push('/mall/batch?mode=ship')">批量发货</el-button><template v-if="tab === 'products'"><el-button v-if="user.hasPermission('product:create', 'MALL')" @click="$router.push('/mall/batch?mode=import')">批量导入</el-button><el-button v-if="user.hasPermission('product:edit', 'MALL') || canEdit('category')" :disabled="blocked || !canTrade" @click="manageCategories">管理分类</el-button><el-button v-if="user.hasPermission('product:create', 'MALL')" type="primary" :disabled="blocked || !canTrade" @click="open('product')">新增商品</el-button></template></div></header>
    <el-alert v-if="!canTrade" title="商城新增交易已暂停，已有订单仍可查询、履约和售后。" type="warning" :closable="false" show-icon />
    <el-alert v-if="capabilityError" :title="capabilityError" type="warning" :closable="false"><el-button link @click="loadCapabilities">重新查询交付状态</el-button></el-alert>
    <div v-else-if="capabilities" class="delivery-note"><span>支付：{{ ['REAL','WECHAT'].includes(capabilities.paymentMode) ? '真实模式' : capabilities.paymentMode === 'DEMO' ? '模拟模式' : '未启用' }}</span><span>真实交易：{{ capabilities.realPaymentVerified ? '已验收' : '待验收' }}</span><span>微信发货管理：{{ capabilities.shippingSyncVerified ? '已验收' : capabilities.shippingSyncStatus ? mallText(capabilities.shippingSyncStatus) : '待验收' }}</span></div>
    <el-alert v-if="error" :title="error" type="error" :closable="false" show-icon />
    <el-alert v-if="recoveryError" :title="recoveryError" type="error" :closable="false" />
    <div v-if="pending" class="pending-panel" role="alert"><div><strong>{{ pending.label }}的结果待确认</strong><p>原请求号：{{ pending.body.requestKey }} · {{ mallDate(pending.createdAt) }}</p><p>请先核对原订单或使用原请求重试，确认前暂停提交其他操作。</p></div><div class="actions"><el-button v-if="pending.path.startsWith('/orders/')" :disabled="busy" @click="inspect({ id: pending.targetId })">查询原订单</el-button><el-button type="warning" :loading="busy" @click="recover">原请求重试</el-button></div></div>

    <section v-if="['products', 'orders', 'aftersales'].includes(tab)" class="panel">
      <nav v-if="tab === 'orders'" class="order-queues" aria-label="商城订单快捷分类"><button v-for="item in orderQueues" :key="item.count" :class="{ active: queue === item.value }" :aria-pressed="queue === item.value" :disabled="loading" @click="selectQueue(item.value)">{{ item.label }} <span>{{ queueCounts[item.count] ?? '—' }}</span></button></nav>
      <p v-if="tab === 'orders'" class="queue-note">分类数量覆盖当前商城全部匹配订单，不受分页影响；输入订单号后按搜索结果统计。</p>
      <form class="list-toolbar" @submit.prevent="search"><el-input v-if="tab !== 'aftersales'" v-model="keyword" :placeholder="tab === 'products' ? '搜索商品名称' : '搜索订单号'" clearable maxlength="100" aria-label="搜索内容" /><el-select v-model="status" placeholder="全部状态" clearable aria-label="筛选状态"><el-option v-for="value in tab === 'products' ? ['DRAFT', 'ACTIVE'] : tab === 'aftersales' ? aftersaleStates : orderStates" :key="value" :value="value" :label="mallText(value)" /></el-select><el-button type="primary" native-type="submit" :loading="loading">查询</el-button></form>
      <p v-if="tab === 'products' && categoryError" class="inline-error">{{ categoryError }} <el-button link @click="loadCategories">重新加载分类</el-button></p>
      <el-table v-loading="loading" :data="rows" :empty-text="error ? '列表未能加载，请刷新重试' : '暂无记录'" class="desktop-table">
        <template v-if="tab === 'products'">
          <el-table-column label="商品" min-width="210"><template #default="{ row }"><div class="product-cell"><img v-if="row.imageUrl" :src="row.imageUrl" alt="商品图片"><div><strong>{{ row.name }}</strong><p>{{ categories.find(item => item.id === row.categoryId)?.name || '未分类' }}</p></div></div></template></el-table-column>
          <el-table-column label="规格 / 库存" min-width="260"><template #default="{ row }"><div v-for="sku in row.skus" :key="sku.id" class="sku-line"><span>{{ mallSpecs(sku.specs) }} · ¥{{ mallMoney(sku.price) }}<small>可售 {{ sku.availableStock }} · 锁定 {{ sku.reserved }}</small></span><el-button v-if="user.hasPermission('warehouse:adjust', 'MALL')" link type="primary" :disabled="blocked || !canTrade" @click="open('stock', sku)">调库存</el-button></div></template></el-table-column>
          <el-table-column label="状态" width="100"><template #default="{ row }"><el-tag :type="row.status === 'ACTIVE' ? 'success' : 'info'">{{ mallText(row.status) }}</el-tag></template></el-table-column>
          <el-table-column label="操作" width="90" fixed="right"><template #default="{ row }"><el-button v-if="user.hasPermission('product:edit', 'MALL')" link type="primary" :disabled="blocked || !canTrade" @click="open('product', row)">编辑</el-button></template></el-table-column>
        </template>
        <template v-else-if="tab === 'orders'">
          <el-table-column prop="orderNo" label="订单号" min-width="220" /><el-table-column label="金额" min-width="150"><template #default="{ row }"><strong>¥{{ mallMoney(row.amountTotal) }}</strong><small class="block">已付 {{ mallMoney(row.amountPaid) }} · 已退 {{ mallMoney(row.amountRefunded) }}</small></template></el-table-column><el-table-column label="订单状态" width="130"><template #default="{ row }"><el-tag>{{ mallText(row.status) }}</el-tag></template></el-table-column><el-table-column label="履约方式" width="115"><template #default="{ row }">{{ mallText(row.fulfillmentType) }}</template></el-table-column><el-table-column label="下单时间" width="165"><template #default="{ row }">{{ mallDate(row.createdAt) }}</template></el-table-column><el-table-column label="操作" width="185" fixed="right"><template #default="{ row }"><div class="order-row-actions"><el-button v-if="orderAction(row)" link type="primary" :disabled="blocked || quickBusy" @click="quickFulfill(row)">{{ orderAction(row) }}</el-button><el-button link @click="inspect(row)">详情</el-button></div></template></el-table-column>
        </template>
        <template v-else>
          <el-table-column label="售后单" min-width="170"><template #default="{ row }"><strong>#{{ row.id }}</strong><small class="block">{{ row.orderNo || `订单 #${row.orderId}` }}</small></template></el-table-column><el-table-column label="类型 / 金额" min-width="150"><template #default="{ row }">{{ mallText(row.type) }}<small class="block">¥{{ mallMoney(row.amount) }}</small></template></el-table-column><el-table-column prop="reason" label="申请原因" min-width="160" show-overflow-tooltip /><el-table-column label="状态" width="130"><template #default="{ row }">{{ mallText(row.status) }}</template></el-table-column><el-table-column label="操作" min-width="230"><template #default="{ row }"><div class="actions"><el-button link type="primary" @click="inspectAftersale(row)">详情</el-button><el-button v-if="user.hasPermission('order:view')" link @click="inspect(row)">订单</el-button><el-button v-if="row.status === 'REQUESTED' && user.hasPermission('refund:approve')" link type="primary" :disabled="blocked" @click="open('decision', row)">审核</el-button><el-button v-if="['RETURN', 'EXCHANGE'].includes(row.type) && ['APPROVED','RETURNING'].includes(row.status) && user.hasPermission('refund:approve')" link type="primary" :disabled="blocked" @click="open('receive', row)">退货验收</el-button><el-button v-if="['REFUNDING', 'RECEIVED'].includes(row.status)" link :disabled="busy" @click="refundQuery(row)">查询退款</el-button><el-button v-if="['REFUNDING', 'RECEIVED'].includes(row.status) && user.hasPermission('refund:approve')" link type="warning" :disabled="blocked" @click="refundRetry(row)">重试原退款</el-button></div></template></el-table-column>
        </template>
      </el-table>
      <div v-if="rows.length" class="mobile-list"><article v-for="row in rows" :key="row.id"><div class="card-heading"><strong>{{ tab === 'products' ? row.name : row.orderNo || `售后 #${row.id}` }}</strong><el-tag size="small">{{ mallText(row.status) }}</el-tag></div><template v-if="tab === 'products'"><div v-for="sku in row.skus" :key="sku.id" class="sku-line"><span>{{ mallSpecs(sku.specs) }} · ¥{{ mallMoney(sku.price) }}<small>可售 {{ sku.availableStock }} · 锁定 {{ sku.reserved }}</small></span><el-button v-if="user.hasPermission('warehouse:adjust', 'MALL')" link type="primary" :disabled="blocked || !canTrade" @click="open('stock', sku)">调库存</el-button></div><el-button v-if="user.hasPermission('product:edit', 'MALL')" type="primary" plain :disabled="blocked || !canTrade" @click="open('product', row)">编辑商品</el-button></template><template v-else-if="tab === 'orders'"><p>¥{{ mallMoney(row.amountTotal) }} · {{ mallText(row.fulfillmentType) }}</p><p>{{ mallDate(row.createdAt) }}</p><div class="actions"><el-button v-if="orderAction(row)" type="primary" :disabled="blocked || quickBusy" @click="quickFulfill(row)">{{ orderAction(row) }}</el-button><el-button @click="inspect(row)">查看详情</el-button></div></template><template v-else><p>{{ mallText(row.type) }} · ¥{{ mallMoney(row.amount) }}</p><p>{{ row.reason }}</p><div class="actions"><el-button @click="inspectAftersale(row)">详情</el-button><el-button v-if="user.hasPermission('order:view')" @click="inspect(row)">订单</el-button><el-button v-if="row.status === 'REQUESTED' && user.hasPermission('refund:approve')" type="primary" :disabled="blocked" @click="open('decision', row)">审核</el-button><el-button v-if="['RETURN', 'EXCHANGE'].includes(row.type) && ['APPROVED','RETURNING'].includes(row.status) && user.hasPermission('refund:approve')" :disabled="blocked" @click="open('receive', row)">退货验收</el-button><el-button v-if="['REFUNDING', 'RECEIVED'].includes(row.status)" :disabled="busy" @click="refundQuery(row)">查退款</el-button><el-button v-if="['REFUNDING', 'RECEIVED'].includes(row.status) && user.hasPermission('refund:approve')" :disabled="blocked" @click="refundRetry(row)">重试原退款</el-button></div></template></article></div>
      <el-empty v-else-if="!loading" class="mobile-empty" :description="error ? '列表未能加载，请刷新重试' : '暂无记录'" />
      <footer class="pagination"><span>共 {{ total }} 条</span><el-pagination v-model:current-page="page" :page-size="20" :total="total" layout="prev, pager, next" :pager-count="5" :disabled="loading" @current-change="load" /></footer>
    </section>

    <section v-else-if="tab === 'settings'" v-loading="loading" class="panel settings-panel"><p class="settings-delivery-link">配送方式、运费、自提地址统一在配送页面管理。<el-button link type="primary" @click="$router.push('/mall/shipping')">前往配送与运费 →</el-button></p><el-form label-position="top" @submit.prevent="saveSettings"><fieldset :disabled="busy || !settingsLoaded || !user.hasPermission('settings:edit')"><h2>店铺信息</h2><div class="form-grid"><el-form-item label="商城名称"><el-input v-model="settings.name" maxlength="80" /></el-form-item><el-form-item label="联系电话"><el-input v-model="settings.contactPhone" maxlength="32" /></el-form-item></div><el-form-item label="商城公告"><el-input v-model="settings.notice" type="textarea" :rows="3" maxlength="500" show-word-limit /></el-form-item><h2>配送与自提</h2><div class="actions"></div><el-form-item v-if="settings.pickupEnabled" label="自提地址"><el-input v-model="settings.pickupAddress" maxlength="255" /></el-form-item><div v-if="settings.expressEnabled" class="form-grid"></div><el-form-item v-if="settings.expressEnabled" label="不配送地区"><el-select v-model="settings.blockedProvinces" multiple filterable collapse-tags collapse-tags-tooltip placeholder="不选择表示不限省份"><el-option v-for="province in mallProvinces" :key="province" :label="province" :value="province" /></el-select></el-form-item><h2>退货联系方式</h2><el-form-item label="退货收件地址"><el-input v-model="settings.returnAddress" maxlength="255" /></el-form-item><div class="form-grid"><el-form-item label="退货联系人"><el-input v-model="settings.returnContact" maxlength="80" /></el-form-item><el-form-item label="退货联系电话"><el-input v-model="settings.returnPhone" maxlength="32" /></el-form-item></div><el-form-item label="订单付款时限（分钟）"><el-input-number v-model="settings.paymentMinutes" :min="5" :max="60" :precision="0" /></el-form-item><p class="muted">运费和配送范围由服务端再次校验。微信官方订单发货管理需要单独接入和验收，手填单号不代表已同步。</p><el-button type="primary" native-type="submit" :loading="busy" :disabled="!settingsLoaded || !user.hasPermission('settings:edit')">保存商城设置</el-button></fieldset></el-form></section>
    <section v-else v-loading="loading"><div v-if="report" class="report-grid"><article v-for="[key, label] in [['orders','订单总数'],['pendingPayment','待付款'],['pendingFulfillment','待履约'],['aftersales','售后单数'],['paidAmount','累计收款'],['refundAmount','累计退款'],['netAmount','净收款']]" :key="key"><span>{{ label }}</span><strong>{{ key.endsWith('Amount') ? `¥${mallMoney(report[key])}` : report[key] ?? '—' }}</strong></article></div><el-empty v-else-if="!loading" description="报表未能加载，请刷新重试" /><p class="muted">净收款是系统收款减退款，不代表微信结算到账金额。</p></section>

    <el-drawer v-model="detailOpen" title="商城订单详情" size="min(800px, 100%)" @closed="detailGeneration++"><div v-loading="detailLoading" class="order-detail"><el-alert v-if="detailError" :title="detailError" type="error" :closable="false"><el-button @click="inspect({ id: detailTarget })">重新加载详情</el-button></el-alert><template v-if="detail"><header class="card-heading"><strong>{{ detail.orderNo }}</strong><el-tag>{{ mallText(detail.status) }}</el-tag></header><el-alert v-if="!detail.marketing" title="一期历史订单继续按原整单履约和售后规则处理。" type="info" :closable="false" /><div class="detail-grid"><p>订单金额<strong>¥{{ mallMoney(detail.amountTotal) }}</strong></p><p>已付 / 已退<strong>{{ mallMoney(detail.amountPaid) }} / {{ mallMoney(detail.amountRefunded) }}</strong></p><p>配送方式<strong>{{ mallText(detail.fulfillmentType) }}</strong></p><p>下单时间<strong>{{ mallDate(detail.createdAt) }}</strong></p></div><div v-if="detail.address && Object.keys(detail.address).length" class="address-box"><template v-if="detail.fulfillmentType === 'PICKUP'"><strong>到店自提</strong><p>{{ detail.address.pickupAddress || '请到店出示自提码' }}</p><p v-if="detail.address.contactPhone">门店电话：{{ detail.address.contactPhone }}</p></template><template v-else><strong>{{ [detail.address.name, detail.address.phone].filter(Boolean).join(' · ') }}</strong><p>{{ [detail.address.province, detail.address.city, detail.address.district, detail.address.address].filter(Boolean).join(' ') }}</p></template></div><p v-if="detail.remark" class="muted">顾客备注：{{ detail.remark }}</p><h3>商品明细</h3><article v-for="item in detail.items" :key="item.id" class="order-item"><div><strong>{{ item.name }}</strong><small>{{ mallSpecs(item.specs) }}</small></div><span>¥{{ mallMoney(item.unitPrice) }} × {{ item.qty }}</span></article><p v-if="Number(detail.marketing?.discountAmount || 0) > 0" class="muted">会员优惠合计 ¥{{ mallMoney(detail.marketing.discountAmount) }}，售后按原实付分摊计算。</p><p class="muted">商品金额 ¥{{ mallMoney(detail.goodsAmount) }} ＋ 运费 ¥{{ mallMoney(detail.shippingAmount) }}</p><div v-if="['PAID', 'PARTIALLY_SHIPPED'].includes(detail.status)" class="actions"><el-button v-if="['EXPRESS', 'LOCAL'].includes(detail.fulfillmentType) && user.hasPermission('order:ship', 'MALL')" type="primary" :disabled="blocked" @click="open('ship', detail)">填写物流并发货</el-button><el-button v-if="detail.fulfillmentType === 'PICKUP' && user.hasPermission('order:pickup', 'MALL')" type="primary" :disabled="blocked" @click="open('pickup', detail)">核验自提码</el-button></div><h3>履约记录</h3><p class="muted">{{ detail.fulfillment?.carrier || '—' }} {{ detail.fulfillment?.trackingNo || '' }}</p><p class="muted">发货 {{ mallDate(detail.fulfillment?.fulfilledAt) }} · 收货 {{ mallDate(detail.fulfillment?.completedAt) }}</p><p v-if="detail.fulfillment?.shippingSyncStatus" class="muted">微信发货管理：{{ mallText(detail.fulfillment.shippingSyncStatus) }} {{ detail.fulfillment.shippingSyncError || '' }}</p><template v-if="detail.shipments?.length"><h3>包裹</h3><article v-for="parcel in detail.shipments" :key="parcel.id" class="address-box"><strong>{{ parcel.mode === 'MOCK' ? '模拟包裹' : '包裹' }} #{{ parcel.id }}</strong><p>{{ parcel.carrier }} {{ parcel.trackingNo }}</p><p v-for="item in parcel.items" :key="item.itemId">{{ item.name }} ×{{ item.qty }}</p><p v-for="(event, index) in parcel.tracking || []" :key="index" class="muted">{{ mallDate(event.time) }} {{ event.message }}</p><p class="muted">微信发货管理：{{ mallText(parcel.officialShippingStatus) }}</p><el-button v-if="user.hasPermission('order:ship', 'MALL') && parcel.mode === 'MOCK' && parcel.status === 'SHIPPED' && parcel.stage !== 'DELIVERED'" :disabled="blocked" @click="perform(operation(`/v2/shipments/${parcel.id}/mock-track`, { expectedVersion: parcel.version, stage: !parcel.stage || parcel.stage === 'CREATED' ? 'PICKED_UP' : parcel.stage === 'PICKED_UP' ? 'IN_TRANSIT' : 'DELIVERED' }, '模拟物流推进', parcel.id))">模拟下一步物流</el-button></article></template><h3>支付与退款</h3><article v-for="payment in detail.payments" :key="payment.id" class="record-line"><span>{{ payment.channel === 'demo' ? '模拟付款' : payment.channel === 'wechat' ? '微信支付' : payment.channel }} · {{ payment.status === 'PAID' ? '已支付' : mallText(payment.status) }}</span><strong>¥{{ mallMoney(payment.amount) }}</strong><small v-if="payment.lastError">{{ payment.lastError }}</small></article><article v-for="refund in detail.refunds" :key="`refund-${refund.id}`" class="record-line"><span>{{ refund.refundNo }} · {{ mallText(refund.status) }}</span><strong>¥{{ mallMoney(refund.amount) }}</strong><small v-if="refund.lastError">{{ refund.lastError }}</small></article><el-button :loading="detailLoading" @click="inspect(detail)">刷新详情</el-button></template></div></el-drawer>

    <el-drawer v-model="aftersaleOpen" title="商城售后详情" size="min(680px, 100%)" @closed="aftersaleGeneration++"><div v-loading="aftersaleLoading" class="order-detail"><el-alert v-if="aftersaleError" :title="aftersaleError" type="error" :closable="false"><el-button @click="inspectAftersale({ id: aftersaleTarget })">重新加载</el-button></el-alert><template v-if="aftersale"><header class="card-heading"><strong>售后 #{{ aftersale.id }}</strong><el-tag>{{ mallText(aftersale.status) }}</el-tag></header><div class="detail-grid"><p>原订单<strong>{{ aftersale.orderNo || aftersale.orderId }}</strong></p><p>申请金额<strong>¥{{ mallMoney(aftersale.amount) }}</strong></p><p>售后类型<strong>{{ mallText(aftersale.type) }}</strong></p><p>申请时间<strong>{{ mallDate(aftersale.createdAt) }}</strong></p></div><article v-for="item in aftersale.items || []" :key="item.itemId" class="order-item"><span>{{ item.name }} ×{{ item.qty }}</span><strong>实付分摊 ¥{{ mallMoney(item.netAmount) }}</strong></article><p class="muted">申请原因：{{ aftersale.reason }}</p><p v-if="aftersale.resolution" class="muted">审核说明：{{ aftersale.resolution }}</p><div v-if="aftersale.returnAddress" class="address-box"><strong>退货收件信息</strong><p>{{ aftersale.returnAddress.contact || aftersale.returnAddress.name }} {{ aftersale.returnAddress.phone }}</p><p>{{ aftersale.returnAddress.address }}</p></div><p v-if="aftersale.returnTrackingNo" class="muted">退货运单：{{ aftersale.returnCarrier }} {{ aftersale.returnTrackingNo }}</p><div v-if="aftersale.receipt" class="address-box"><strong>退货验收</strong><p>{{ aftersale.receipt.restock ? '已确认所选商品入库' : '未重新入库' }} · {{ aftersale.receipt.reason }}</p></div><div v-if="aftersale.refund" class="address-box"><strong>退款 {{ mallText(aftersale.refund.status) }}</strong><p>{{ aftersale.refund.refundNo }} · ¥{{ mallMoney(aftersale.refund.amount) }}</p><p v-if="aftersale.refund.lastError">{{ aftersale.refund.lastError }}</p></div><div class="actions"><el-button v-if="aftersale.status === 'REQUESTED' && user.hasPermission('refund:approve')" type="primary" :disabled="blocked" @click="open('decision', aftersale)">审核申请</el-button><el-button v-if="['RETURN', 'EXCHANGE'].includes(aftersale.type) && ['APPROVED','RETURNING'].includes(aftersale.status) && user.hasPermission('refund:approve')" type="primary" :disabled="blocked" @click="open('receive', aftersale)">退货验收</el-button><el-button v-if="aftersale.items &amp;&amp; ['REQUESTED', 'APPROVED'].includes(aftersale.status) &amp;&amp; user.hasPermission('refund:approve')" :disabled="blocked" @click="open('withdraw', aftersale)">关闭未寄回售后</el-button><el-button v-if="aftersale.status === 'EXCHANGE_READY' && user.hasPermission('refund:approve')" type="primary" :disabled="blocked" @click="open('exchange', aftersale)">寄出换货商品</el-button><el-button v-if="aftersale.refund" :disabled="busy" @click="refundQuery(aftersale)">查询原退款</el-button><el-button v-if="aftersale.refund && aftersale.refund.status !== 'SUCCESS' && user.hasPermission('refund:approve')" :disabled="blocked" @click="refundRetry(aftersale)">重试原退款</el-button><el-button :loading="aftersaleLoading" @click="inspectAftersale(aftersale)">刷新详情</el-button></div></template></div></el-drawer>
    <el-dialog :model-value="!!editor" :title="{ product: form.id ? '编辑商城商品' : '新增商城商品', category: '商品分类', stock: '调整商城库存', ship: '订单发货', pickup: '到店自提核销', decision: '审核售后', receive: '退货验收', exchange: '寄出换货商品', withdraw: '关闭未寄回售后' }[editor] || '商城操作'" width="min(760px, 94vw)" :close-on-click-modal="!busy" :close-on-press-escape="!busy" :show-close="!busy" @close="closeEditor"><el-alert v-if="editorError" :title="editorError" type="error" :closable="false" class="mb-4" /><el-form label-position="top" @submit.prevent="submit"><fieldset :disabled="busy || !!pending || editorUncertain">
      <template v-if="editor === 'product'"><div class="form-grid"><el-form-item label="商品名称"><el-input v-model="form.name" maxlength="120" /></el-form-item><el-form-item label="分类"><el-select v-model="form.categoryId" clearable placeholder="未分类"><el-option v-for="category in categories" :key="category.id" :label="category.name" :value="category.id" /></el-select></el-form-item></div><el-form-item label="商品图片"><div class="image-editor"><img v-if="form.imageUrl" :src="form.imageUrl" alt="商品预览"><el-upload :show-file-list="false" :http-request="upload" accept="image/jpeg,image/png,image/webp" :disabled="busy"><el-button :disabled="busy">上传图片</el-button></el-upload><el-input v-model="form.imageUrl" placeholder="或填写图片地址" /></div></el-form-item><el-form-item label="商品详情"><el-input v-model="form.detail" type="textarea" :rows="4" maxlength="10000" /></el-form-item><el-form-item label="销售状态"><el-radio-group v-model="form.status"><el-radio value="DRAFT" label="DRAFT">未上架</el-radio><el-radio value="ACTIVE" label="ACTIVE">上架销售</el-radio></el-radio-group></el-form-item><MallSkuEditor v-if="editor === 'product'" :key="`product-${form.id || 'new'}`" v-model="form.skus" /></template>
      <template v-else-if="editor === 'category'"><div v-if="categories.length" class="category-list"><button v-for="category in categories" :key="category.id" type="button" :disabled="busy || !user.hasPermission('product:edit', 'MALL')" @click="open('category', category)">{{ category.name }}{{ category.active ? '' : '（停用）' }} · 编辑</button><button type="button" :disabled="busy || !canEdit('category')" @click="open('category')">＋ 新分类</button></div><el-form-item label="分类名称"><el-input v-model="form.name" maxlength="80" /></el-form-item><el-form-item label="排序"><el-input-number v-model="form.sortOrder" :min="0" :max="99999" :precision="0" /></el-form-item><el-checkbox v-model="form.active">启用分类</el-checkbox></template>
      <template v-else-if="editor === 'stock'"><p class="muted">规格 {{ form.skuCode }}：当前库存 {{ form.stock }}，订单锁定 {{ form.reserved }}。填写正数入库，负数出库。</p><el-form-item label="库存增减数量"><el-input-number v-model="form.delta" :precision="0" :min="-9999999" :max="9999999" /></el-form-item><el-form-item label="调整原因"><el-input v-model="form.reason" maxlength="255" /></el-form-item></template>
      <template v-else-if="['ship', 'exchange'].includes(editor)"><el-alert title="按本次商品数量登记包裹。模拟面单不代表真实交运；微信官方发货管理尚未接通。" type="info" :closable="false" class="mb-4" /><div v-if="form.shipItems" class="shipment-items"><article v-for="item in form.shipItems" :key="item.itemId" class="sku-line"><span>{{ item.name }} · 剩余 {{ item.max }}</span><el-input-number v-model="item.qty" :min="0" :max="item.max" :precision="0" /></article><el-checkbox v-model="form.mockWaybill">生成模拟面单（不会呼叫快递）</el-checkbox></div><el-form-item label="快递公司"><el-input v-model="form.carrier" maxlength="80" /></el-form-item><el-form-item label="物流单号"><el-input v-model="form.trackingNo" maxlength="100" /></el-form-item></template>
      <template v-else-if="editor === 'pickup'"><p class="muted">请核验顾客出示的自提码。核销成功后订单完成。</p><el-form-item label="顾客自提码"><el-input v-model="form.pickupCode" maxlength="32" autocomplete="off" /></el-form-item></template>
      <template v-else-if="editor === 'decision'"><p class="muted">{{ mallText(form.type) }} · 申请金额 ¥{{ mallMoney(form.amount) }}。申请原因：{{ form.originalReason }}。仅退款申请同意后将进入退款处理，请核对后操作。</p><el-form-item label="审核结果"><el-radio-group v-model="form.action"><el-radio value="APPROVE" label="APPROVE">同意申请</el-radio><el-radio value="REJECT" label="REJECT">拒绝申请</el-radio></el-radio-group></el-form-item><el-form-item label="审核说明"><el-input v-model="form.reason" type="textarea" maxlength="255" /></el-form-item></template>
      <template v-else-if="editor === 'withdraw'"><p class="muted">关闭后恢复原订单状态，换货预留库存会释放。已寄回或退款中的申请不能关闭。</p><el-form-item label="关闭原因"><el-input v-model="form.reason" type="textarea" maxlength="200" /></el-form-item></template><template v-else-if="editor === 'receive'"><el-alert title="请实际收到并验收退货后操作。验收与库存处理留痕，退款仍需查询实际结果。" type="warning" :closable="false" class="mb-4" /><el-checkbox v-model="form.restock">验收合格，本售后所选商品重新入库</el-checkbox><el-form-item label="验收说明"><el-input v-model="form.reason" type="textarea" maxlength="255" /></el-form-item></template>
    </fieldset><div class="dialog-footer"><el-button :disabled="busy" @click="closeEditor">{{ editorUncertain ? '关闭并核对列表' : '取消' }}</el-button><el-button type="primary" native-type="submit" :loading="busy" :disabled="blocked || editorUncertain || !canSubmitEditor()">确认{{ { stock:'调整库存',ship:'发货',pickup:'核销',decision:'审核',receive:'退货验收' }[editor] || '保存' }}</el-button></div></el-form></el-dialog>
  </section>
</template>

<style scoped>
.mall-page{max-width:1440px;margin:auto;display:grid;gap:18px;color:#334155}.page-heading,.actions,.list-toolbar,.card-heading,.pagination{display:flex;align-items:center;justify-content:space-between;gap:12px}.page-heading{align-items:flex-start}.page-heading h1{font-size:25px;font-weight:650;color:#0f172a;margin:5px 0 7px}.page-heading p,.muted{font-size:13px;color:#64748b;line-height:1.8}.eyebrow{font-size:12px;color:#64748b}.actions{justify-content:flex-start;flex-wrap:wrap}.actions :deep(.el-button+.el-button){margin-left:0}.panel{background:#fff;border:1px solid #e2e8f0;border-radius:12px;padding:22px;min-width:0}.list-toolbar{justify-content:flex-start;margin-bottom:20px}.list-toolbar>.el-input{max-width:300px}.list-toolbar>.el-select{width:160px}.pagination{justify-content:flex-end;margin-top:20px;font-size:12px;color:#64748b}.product-cell{display:flex;gap:12px;align-items:center}.product-cell img,.image-editor img{width:54px;height:54px;object-fit:cover;border:1px solid #e2e8f0;border-radius:8px}.product-cell p{font-size:12px;color:#64748b;margin:4px 0}.sku-line{display:flex;justify-content:space-between;gap:12px;padding:7px 0;font-size:13px}.sku-line small,.block{display:block;color:#64748b;font-size:12px;margin-top:3px}.delivery-note{display:flex;gap:18px;flex-wrap:wrap;font-size:12px;color:#64748b}.pending-panel{border:1px solid #f59e0b;border-radius:10px;padding:18px;background:#fffbeb;display:grid;gap:12px}.pending-panel p{font-size:12px;margin-top:6px;overflow-wrap:anywhere}.inline-error{font-size:13px;color:#b91c1c}.form-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:0 18px}.settings-panel{max-width:900px}.settings-panel h2{font-size:16px;font-weight:650;margin:10px 0 22px}.settings-panel :deep(.el-select){width:100%}.settings-panel .muted{margin-bottom:22px}.report-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:18px}.report-grid article{padding:24px;background:white;border:1px solid #e2e8f0;border-radius:12px}.report-grid span{display:block;font-size:13px;color:#64748b}.report-grid strong{display:block;font-size:26px;font-weight:650;margin-top:12px;color:#0f172a;overflow-wrap:anywhere}.order-detail{display:grid;gap:18px}.order-detail h3{font-size:15px;font-weight:650;padding-top:14px;border-top:1px solid #e2e8f0}.detail-grid{display:grid;grid-template-columns:1fr 1fr;gap:16px;padding:18px;background:#f8fafc;border-radius:10px}.detail-grid p{font-size:12px;color:#64748b}.detail-grid strong{display:block;color:#334155;font-size:14px;margin-top:7px}.address-box{font-size:13px;line-height:1.8;padding:16px;border:1px solid #e2e8f0;border-radius:10px}.address-box p{color:#64748b}.order-item{display:flex;justify-content:space-between;gap:14px;font-size:13px}.order-item small{display:block;font-size:12px;color:#64748b;margin-top:5px}.record-line{display:flex;flex-wrap:wrap;justify-content:space-between;gap:10px;font-size:12px;overflow-wrap:anywhere}.record-line small{width:100%;color:#b91c1c}.dialog-footer{display:flex;justify-content:flex-end;gap:12px;padding-top:20px;margin-top:20px;border-top:1px solid #e2e8f0}.sku-editor{padding:18px;border:1px solid #e2e8f0;border-radius:10px;margin-top:12px}.image-editor{display:flex;gap:12px;align-items:center;flex-wrap:wrap;width:100%}.category-list{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:20px}.category-list button{padding:6px 10px;border:1px solid #cbd5e1;border-radius:6px;font-size:12px;background:#f8fafc}.mobile-list,.mobile-empty{display:none}.mall-page fieldset{border:0;padding:0;min-width:0}.mall-page fieldset:disabled{opacity:.7;pointer-events:none}@media(max-width:1050px){.report-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.page-heading{flex-direction:column}}@media(max-width:750px){.panel{padding:16px}.page-heading h1{font-size:22px}.list-toolbar{flex-wrap:wrap;gap:10px}.list-toolbar>.el-input{max-width:none;flex-basis:100%}.list-toolbar>.el-select{flex:1;width:auto}.desktop-table{display:none}.mobile-list{display:grid;gap:14px}.mobile-list article{border:1px solid #e2e8f0;border-radius:10px;padding:16px;min-width:0}.mobile-list p{font-size:12px;color:#64748b;margin:10px 0;overflow-wrap:anywhere}.mobile-list .card-heading strong{overflow-wrap:anywhere;min-width:0;font-size:14px}.mobile-empty{display:flex}.form-grid{grid-template-columns:1fr}.report-grid{gap:12px}.report-grid article{padding:16px}.report-grid strong{font-size:22px}.pagination{justify-content:space-between;gap:0}.pagination :deep(.el-pagination button),.pagination :deep(.el-pager li){min-width:24px}.detail-grid{grid-template-columns:1fr}.delivery-note{gap:7px 14px}.sku-editor{padding:12px}}
.order-queues{display:flex;gap:6px;overflow:auto;border-bottom:1px solid #e2e8f0;padding-bottom:12px;margin-bottom:10px;scrollbar-width:thin}.order-queues button{display:flex;gap:8px;align-items:center;white-space:nowrap;padding:9px 12px;border:0;border-radius:7px;background:transparent;color:#526178;font-size:14px;cursor:pointer}.order-queues button.active{background:#eef2ff;color:#3458cc;font-weight:600}.order-queues button span{font-size:12px;border-radius:5px;padding:1px 6px;background:#f1f5f9;color:#64748b}.order-queues button.active span{background:#dfe7ff;color:#3458cc}.queue-note{font-size:12px;color:#64748b;margin:0 0 16px}.order-row-actions{display:flex;gap:12px;align-items:center}.order-row-actions .el-button+.el-button{margin:0}.dialog-footer{position:sticky;bottom:-20px;z-index:4;background:#fff;padding-bottom:8px}.page-heading h1{font-size:24px}.list-toolbar{flex-wrap:wrap}.delivery-note{font-size:12px}
</style>
