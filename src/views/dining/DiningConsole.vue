<script setup>
import { computed, onMounted, onBeforeUnmount, reactive, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { useUserStore } from '@/stores/user'
import request from '@/lib/request'
import { sceneNames, sessionNames, fulfillmentNames, lineNames, serviceNames, nextLineState, money, attrsText, requestKey, receiptHtml, scenePreset } from '@/lib/dining'

const route = useRoute(), user = useUserStore()
const tab = computed(() => route.meta.diningTab || 'seats')
const titles = { seats: '台位营业', kitchen: '后厨出餐', services: '服务与售后', prints: '出餐小票', shifts: '收银交班', settings: '点餐场景' }
const descriptions = { seats: '开台、加菜、结账和清台，集中处理本次消费', kitchen: '按制作区域查看菜品，出餐后交给服务员送达', services: '及时回应顾客呼叫，审核取消与退款申请', prints: '查看分单小票，打印后确认结果，失败时可重新打印', shifts: '核对本班收款、退款和实点现金，完成交接', settings: '按门店经营方式设置点餐、付款和营业时间' }
const cfg = reactive({ industry: 'KTV', seatLabel: '包厢', paymentMode: 'PREPAY', enabled: true, accepting: true, kitchen: true, sharedCart: true, allowAdd: true, allowService: true, allowPickup: false, printing: false, openTime: '00:00', closeTime: '00:00', weekdays: [1, 2, 3, 4, 5, 6, 7] })
const rows = ref([]), services = ref([]), aftersales = ref([]), loading = ref(false), error = ref(''), busy = ref(false), keyword = ref(''), station = ref(''), lastUpdated = ref('')
const can = permission => user.hasPermission(permission)
let generation = 0, timer, disposed = false
const seats = computed(() => rows.value.filter(s => !keyword.value || String(s.roomNumber).includes(keyword.value)))
const stations = computed(() => [...new Set(rows.value.flatMap(o => (o.items || []).map(i => i.station)))])
const kitchenRows = computed(() => rows.value.map(o => ({ ...o, visibleItems: (o.items || []).filter(i => !station.value || i.station === station.value) })).filter(o => o.visibleItems.length))
const counts = computed(() => ({ free: rows.value.filter(s => !s.sessionId && s.isAvailable).length, active: rows.value.filter(s => ['OPEN', 'CHECKOUT'].includes(s.state)).length, cleaning: rows.value.filter(s => s.state === 'CLEANING').length }))
async function load(silent = false) {
  const version = ++generation
  if (!silent) loading.value = true
  try {
    let result
    if (tab.value === 'services') {
      const data = await Promise.all([can('service:operate') ? request.get('/dining/services') : [], can('refund:view') || can('refund:approve') ? request.get('/dining/aftersales') : []])
      if (version !== generation || disposed) return
      services.value = data[0]; aftersales.value = data[1]
    } else if (tab.value === 'settings') {
      result = await request.get('/dining/config')
      if (version !== generation || disposed) return
      for (const key of Object.keys(cfg)) if (key in result) cfg[key] = result[key]
    } else {
      result = await request.get(`/dining/${tab.value === 'seats' ? 'seats' : tab.value}`)
      if (version !== generation || disposed) return
      rows.value = result || []
    }
    error.value = ''; lastUpdated.value = new Date().toLocaleTimeString('zh-CN', { hour12: false })
  } catch (e) { if (version === generation && !disposed) error.value = e.message || '加载失败，请重试' }
  finally { if (version === generation && !disposed) loading.value = false }
}
async function act(fn, message = '已更新') {
  if (busy.value) return false
  busy.value = true
  try { await fn(); ElMessage.success(message); await load(true); if (billVisible.value) await loadBill(); return true }
  catch (e) { ElMessage.error(e.message || '操作未完成，请重试'); return false }
  finally { busy.value = false }
}
const openVisible = ref(false), openForm = reactive({ roomId: '', headcount: 1 })
function openSeat(seat) { if (!can('dining:manage')) return; Object.assign(openForm, { roomId: seat.roomNumber, headcount: 1 }); openVisible.value = true }
async function confirmOpen() { if (await act(() => request.post('/dining/sessions', { ...openForm }), '已开台')) openVisible.value = false }
const billVisible = ref(false), billLoading = ref(false), billError = ref(''), currentSession = ref(null), orders = ref([]), selectedOrders = ref([]), tender = ref(), cashConfirmed = ref(false), transferVisible = ref(false), targetRoom = ref('')
let billGeneration = 0
const selectedDue = computed(() => orders.value.filter(o => selectedOrders.value.includes(o.id)).reduce((sum, o) => sum + Math.round(Number(o.amountTotal) * 100), 0) / 100)
const unpaid = computed(() => orders.value.filter(o => o.status !== 90 && o.payStatus !== 2))
const cashReady = computed(() => cashConfirmed.value && selectedOrders.value.length && Number(tender.value) >= selectedDue.value)
const recoveryStorageKey = () => `dining-recovery:${user.currentStoreId}:${user.userInfo?.id}`
const pending = ref(null)
try { pending.value = JSON.parse(localStorage.getItem(recoveryStorageKey()) || 'null') } catch { error.value = '交易恢复记录无法读取，请联系店长核对' }
async function inspect(seat) { currentSession.value = { id: seat.sessionId, roomId: seat.roomNumber }; billVisible.value = true; selectedOrders.value = []; tender.value = undefined; cashConfirmed.value = false; await loadBill() }
async function loadBill() {
  const sid = currentSession.value?.id, version = ++billGeneration
  if (!sid) return
  billLoading.value = true
  try {
    const data = await request.get(`/dining/sessions/${sid}`)
    if (version !== billGeneration || currentSession.value?.id !== sid) return
    currentSession.value = data.session; orders.value = data.orders; billError.value = ''
    selectedOrders.value = selectedOrders.value.filter(id => orders.value.some(o => o.id === id && o.payStatus === 0 && o.payMethod === 3))
  } catch (e) { if (version === billGeneration) billError.value = e.message }
  finally { if (version === billGeneration) billLoading.value = false }
}
async function seatAction(action) {
  if (action === 'close' || action === 'clean') { try { await ElMessageBox.confirm(action === 'close' ? '确认本次账款与送餐均已处理，结束消费？' : '确认台位已清理，可以接待下一批顾客？', action === 'close' ? '结束本次消费' : '完成清台') } catch { return } }
  await act(() => request.post(`/dining/sessions/${currentSession.value.id}/action`, { action, ...(action === 'transfer' ? { roomId: targetRoom.value } : {}) }))
  transferVisible.value = false
}
function retain(operation) { localStorage.setItem(recoveryStorageKey(), JSON.stringify(operation)); pending.value = operation }
function clearRecovery() { localStorage.removeItem(recoveryStorageKey()); pending.value = null }
async function collectCash() {
  if (!cashReady.value || pending.value) return
  const operation = { kind: 'settle', sessionId: currentSession.value.id, body: { requestKey: requestKey(), orderIds: [...selectedOrders.value], expectedAmount: money(selectedDue.value), cashReceived: money(tender.value) } }
  try { retain(operation) } catch { ElMessage.error('无法保存交易恢复记录，暂不能收款'); return }
  await recover()
}
async function recover() {
  if (!pending.value || busy.value) return
  const operation = pending.value
  busy.value = true
  try {
    const result = await request.post(`/dining/sessions/${operation.sessionId}/${operation.kind === 'settle' ? 'settle' : 'orders'}`, operation.body)
    clearRecovery(); orderVisible.value = false; selectedOrders.value = []; cashConfirmed.value = false
    ElMessage.success(operation.kind === 'settle' ? `收款已登记，找零 ¥${money(result.change ?? Number(result.tender) - Number(result.amount))}` : '订单已提交，请到后厨查看出餐进度')
    await load(true); if (billVisible.value) await loadBill()
  } catch (e) { if (e.definitive) clearRecovery(); ElMessage.error(e.message || '结果尚未确认，请重试原交易') }
  finally { busy.value = false }
}
watch([selectedDue, tender], () => { cashConfirmed.value = false })

const orderVisible = ref(false), products = ref([]), orderItems = ref([]), productId = ref(''), skuId = ref(''), attrs = reactive({}), lineNote = ref(''), orderNote = ref(''), qty = ref(1), productRule = ref({ extras: [], bundle: [] }), extras = ref([]), orderQuote = ref(null), quoteBusy = ref(false), orderMethod = ref(3), orderTender = ref()
const selectedProduct = computed(() => products.value.find(p => String(p.id) === String(productId.value)))
const selectedSku = computed(() => selectedProduct.value?.skus?.find(s => String(s.id) === String(skuId.value)))
const attributeGroups = computed(() => { const s = selectedSku.value; if (!s) return []; if (Array.isArray(s.attrConfig)) return s.attrConfig; try { return JSON.parse(s.attrConfigJson || '[]') } catch { return [] } })
async function openOrder() {
  if (pending.value) { ElMessage.warning('请先恢复未确认交易'); return }
  orderItems.value = []; orderQuote.value = null; orderVisible.value = true; orderNote.value = ''; orderMethod.value = 3
  try { const all = []; let page = 1; while (page <= 100) { const data = await request.get('/products', { params: { page, pageSize: 100 } }); const list = data.list || data.records || []; all.push(...list); if (!list.length || all.length >= Number(data.total || all.length)) break; page++ } products.value = all.filter(p => p.status !== false) } catch (e) { ElMessage.error(e.message) }
}
watch(productId, async () => { skuId.value = ''; extras.value = []; productRule.value = { extras: [], bundle: [] }; if (!productId.value) return; const id = productId.value; try { const rule = await request.get(`/dining/products/${id}`); if (productId.value === id) productRule.value = rule } catch (e) { ElMessage.error(e.message) } })
watch(skuId, () => { for (const key of Object.keys(attrs)) delete attrs[key]; for (const group of attributeGroups.value) attrs[group.name] = group.type === 'multi' ? [] : '' })
function addLine() {
  if (!selectedSku.value) { ElMessage.warning('请选择商品规格'); return }
  for (const g of attributeGroups.value) if (g.required && (!attrs[g.name] || (Array.isArray(attrs[g.name]) && !attrs[g.name].length))) { ElMessage.warning(`请选择${g.name}`); return }
  orderItems.value.push({ skuId: Number(skuId.value), qty: qty.value, selectedAttrs: JSON.parse(JSON.stringify(attrs)), note: lineNote.value, extras: extras.value.map(id => ({ skuId: id, qty: 1 })), name: selectedProduct.value.name }); orderQuote.value = null; lineNote.value = ''; qty.value = 1
}
async function quoteOrder() {
  if (!orderItems.value.length || quoteBusy.value) return
  quoteBusy.value = true
  try { orderQuote.value = await request.post(`/dining/sessions/${currentSession.value.id}/quote`, { items: orderItems.value, payMethod: orderMethod.value }) }
  catch (e) { orderQuote.value = null; ElMessage.error(e.message) } finally { quoteBusy.value = false }
}
watch(orderMethod, () => { orderQuote.value = null })
async function submitOrder() {
  if (!orderQuote.value || pending.value) return
  const body = { clientOrderNo: requestKey(), items: orderItems.value, payMethod: orderMethod.value, expectedAmount: orderQuote.value.amountTotal, note: orderNote.value }
  if (orderMethod.value === 2) { if (Number(orderTender.value) < Number(orderQuote.value.amountTotal)) { ElMessage.warning('请填写足额实收现金'); return }; body.cashReceived = money(orderTender.value) }
  try { retain({ kind: 'order', sessionId: currentSession.value.id, body }) } catch { ElMessage.error('无法保存交易记录，暂不能提交'); return }
  await recover()
}
async function processLine(order, item) { await act(() => request.post(`/dining/kitchen/${order.id}`, { itemId: item.id, state: nextLineState(item.state) })) }
async function processService(row) { await act(() => request.post(`/dining/services/${row.id}/done`), '已处理顾客请求') }
const approvalVisible = ref(false), approval = reactive({ id: null, action: 'approve', resolution: '' })
function review(row, action) { Object.assign(approval, { id: row.id, action, resolution: '' }); approvalVisible.value = true }
async function resolve() { if (!approval.resolution.trim()) { ElMessage.warning('请填写处理说明'); return }; if (await act(() => request.post(`/dining/aftersales/${approval.id}`, { action: approval.action, resolution: approval.resolution }), approval.action === 'approve' ? '申请已审核；退款请到退款售后继续处理' : '已回复顾客')) approvalVisible.value = false }
function printTicket(row) { const win = window.open('', '_blank', 'width=420,height=650'); if (!win) { ElMessage.warning('请允许打开小票窗口'); return }; win.document.write(receiptHtml(row.payload)); win.document.close() }
async function markPrint(row, action) { await act(() => request.post(`/dining/prints/${row.id}`, { action })) }
const shiftVisible = ref(false), shiftForm = reactive({ action: 'open', openingCash: 0, actualCash: 0, note: '', id: null })
function openShift(row) { Object.assign(shiftForm, { action: row ? 'close' : 'open', id: row?.id, openingCash: 0, actualCash: 0, note: '' }); shiftVisible.value = true }
async function confirmShift() { if (await act(() => request.post('/dining/shifts', { ...shiftForm }), shiftForm.action === 'open' ? '本班已开始' : '交班已登记')) shiftVisible.value = false }
function preset() { Object.assign(cfg, scenePreset(cfg.industry)) }
async function saveConfig() { await act(() => request.put('/dining/config', { ...cfg }), '场景设置已保存') }
watch(tab, () => { generation++; rows.value = []; services.value = []; aftersales.value = []; keyword.value = ''; station.value = ''; error.value = ''; load() })
onMounted(async () => { await load(); timer = setInterval(() => { if (!disposed && !busy.value && !loading.value && !document.hidden && !['settings', 'shifts'].includes(tab.value)) { load(true); if (billVisible.value && !billLoading.value) loadBill() } }, 5000) })
onBeforeUnmount(() => { disposed = true; generation++; billGeneration++; clearInterval(timer) })
</script>

<template>
  <div class="dining-console">
    <header class="dining-heading"><div><span class="eyebrow">门店营业</span><h1>{{ titles[tab] }}</h1><p>{{ descriptions[tab] }}</p></div><div class="heading-actions"><span v-if="lastUpdated" class="sync-time">{{ lastUpdated }} 更新</span><el-button :loading="loading" @click="load()">刷新</el-button></div></header>
    <el-alert v-if="error" :title="error" type="error" :closable="false" show-icon class="notice" />
    <el-alert v-if="pending" title="有一笔交易结果待确认。请恢复原交易，再提交新的订单或收款。" type="warning" :closable="false" class="notice"><el-button :loading="busy" @click="recover">确认原交易结果</el-button></el-alert>
    <template v-if="tab === 'seats'">
      <div class="metric-row"><article><span>空闲台位</span><strong>{{ counts.free }}</strong></article><article><span>正在消费</span><strong>{{ counts.active }}</strong></article><article><span>等待清台</span><strong>{{ counts.cleaning }}</strong></article></div>
      <div class="toolbar"><el-input v-model="keyword" placeholder="搜索桌号或包厢号" clearable /><span>点击台位查看本次消费</span></div>
      <div v-if="!rows.length && !loading && !error" class="empty"><h3>先添加门店台位</h3><p>在门店设置中添加餐桌或包厢，并生成点餐二维码。</p><el-button @click="$router.push('/settings')">去门店设置</el-button></div>
      <div class="seat-grid"><button v-for="seat in seats" :key="seat.id" class="seat-card" :class="{ occupied: seat.sessionId, cleaning: seat.state === 'CLEANING', disabled: !seat.isAvailable }" :disabled="!seat.isAvailable || busy" @click="seat.sessionId ? inspect(seat) : openSeat(seat)"><div class="card-top"><span>{{ seat.roomType }}</span><span class="status-pill">{{ !seat.isAvailable ? '已停用' : sessionNames[seat.state] || '空闲' }}</span></div><strong>{{ seat.roomNumber }}</strong><p>{{ seat.sessionId ? `${seat.headcount} 人 · 本次消费` : `可容纳 ${seat.capacity} 人` }}</p><span class="card-link">{{ seat.sessionId ? '查看账单 →' : can('dining:manage') ? '开台点餐 →' : '等待顾客扫码' }}</span></button></div>
    </template>
    <template v-if="tab === 'kitchen'">
      <div class="toolbar"><el-radio-group v-model="station"><el-radio-button label="">全部区域</el-radio-button><el-radio-button v-for="name in stations" :key="name" :label="name">{{ name }}</el-radio-button></el-radio-group></div>
      <div v-if="!rows.length && !loading && !error" class="empty"><h3>暂时没有待出餐订单</h3><p>顾客下单后，已付款或允许餐后结账的订单会出现在这里。</p></div>
      <div class="kitchen-grid"><article v-for="order in kitchenRows" :key="order.id" class="kitchen-card"><div class="card-top"><h2>{{ order.roomId === '__PICKUP__' ? '顾客自取' : order.roomId }}</h2><el-tag>{{ fulfillmentNames[order.fulfillment] }}</el-tag></div><div class="muted">{{ order.orderNo }} · {{ order.createdAt?.replace('T', ' ') }}</div><p v-if="order.note" class="order-note">整单备注：{{ order.note }}</p><div v-for="item in order.visibleItems" :key="item.id" class="dish-row"><div><strong>{{ item.name }} × {{ item.qty }}</strong><p>{{ item.station }} · {{ lineNames[item.state] }}</p><p v-if="item.note" class="order-note">{{ item.note }}</p><p v-if="item.selectedAttrsJson && item.selectedAttrsJson !== '{}'" class="muted">{{ attrsText(item.selectedAttrsJson) }}</p></div><el-button v-if="nextLineState(item.state) && can('kitchen:operate')" type="primary" :loading="busy" @click="processLine(order, item)">{{ item.state === 'PENDING' ? '开始制作' : item.state === 'PREPARING' ? '确认出餐' : '确认送达' }}</el-button></div></article></div>
    </template>
    <template v-if="tab === 'services'">
      <section v-if="can('service:operate')" class="panel"><h2>顾客服务</h2><div v-if="!services.length" class="empty small">暂无服务请求</div><div v-for="row in services" :key="row.id" class="service-row"><div><strong>{{ row.roomId }} · {{ serviceNames[row.type] }}</strong><p>{{ row.note || '顾客需要门店协助' }}</p><span class="muted">{{ row.createdAt?.replace('T', ' ') }}</span></div><el-button v-if="row.state === 'PENDING' && can('service:operate')" type="primary" :loading="busy" @click="processService(row)">已处理</el-button><el-tag v-else>{{ row.state === 'PENDING' ? '待处理' : '已处理' }}</el-tag></div></section>
      <section v-if="can('refund:view') || can('refund:approve')" class="panel"><h2>在线售后申请</h2><div v-if="!aftersales.length" class="empty small">暂无售后申请</div><div v-for="row in aftersales" :key="row.id" class="service-row"><div><strong>{{ row.roomId }} · {{ row.kind === 'CANCEL' ? '取消 / 退菜' : '退款申请' }}</strong><p>{{ row.reason }}</p><p v-for="item in row.items" :key="item.id">{{ item.name }} × {{ item.qty }}</p><p v-if="row.refundId">退款金额 ¥{{ money(row.refundAmount) }} · {{ { 0: '等待执行', 1: '退款中', 2: '退款完成', 3: '未退款', 4: '已关闭' }[row.refundStatus] }}</p><span class="muted">{{ row.orderNo }} · {{ row.state === 'PENDING' ? '待审核' : row.state === 'APPROVED' ? '已通过' : '未通过' }}</span><p v-if="row.resolution">处理说明：{{ row.resolution }}</p></div><div v-if="row.state === 'PENDING' && can('refund:approve')" class="row-actions"><el-button :disabled="busy" @click="review(row, 'reject')">不通过</el-button><el-button type="primary" :disabled="busy" @click="review(row, 'approve')">审核通过</el-button></div></div></section>
    </template>
    <template v-if="tab === 'prints'"><section class="panel"><div v-if="!rows.length && !loading" class="empty">暂无待打印小票</div><div v-for="row in rows" :key="row.id" class="service-row"><div><strong>{{ row.payload.roomId === '__PICKUP__' ? '顾客自取' : row.payload.roomId }} · {{ row.station }}</strong><p>{{ row.payload.orderNo }}</p><el-tag :type="row.state === 'FAILED' ? 'danger' : row.state === 'PRINTED' ? 'success' : 'warning'">{{ { PENDING: '待打印', PRINTED: '已确认打印', FAILED: '打印失败' }[row.state] }}</el-tag></div><div class="row-actions"><el-button @click="printTicket(row)">打开小票</el-button><el-button v-if="can('kitchen:operate')" :disabled="busy" @click="markPrint(row, 'printed')">确认已打印</el-button><el-button v-if="can('kitchen:operate') && row.state !== 'PENDING'" :disabled="busy" @click="markPrint(row, 'retry')">重新排队</el-button><el-button v-if="can('kitchen:operate') && row.state === 'PENDING'" :disabled="busy" @click="markPrint(row, 'failed')">记录失败</el-button></div></div><p class="footnote">使用浏览器连接的打印机打印。打开小票不会自动标记打印成功。</p></section></template>
    <template v-if="tab === 'shifts'"><el-button v-if="can('pos:view') && !rows.some(r => r.state === 'OPEN')" type="primary" @click="openShift()">开始本班</el-button><div v-if="!rows.length && !loading" class="empty">登记备用金，开始第一班收银</div><section v-for="row in rows" :key="row.id" class="panel shift-panel"><div class="card-top"><h2>{{ row.state === 'OPEN' ? '正在营业' : '已交班' }}</h2><el-button v-if="row.state === 'OPEN' && can('pos:view')" type="primary" @click="openShift(row)">核对并交班</el-button></div><p class="muted">{{ row.openedAt?.replace('T', ' ') }} — {{ row.closedAt?.replace('T', ' ') || '现在' }}</p><div class="metric-row"><article><span>本班收款</span><strong>¥{{ money(row.summary.revenue) }}</strong></article><article><span>退款</span><strong>¥{{ money(row.summary.refunds) }}</strong></article><article><span>应有现金</span><strong>¥{{ money(row.summary.expectedCash) }}</strong></article></div><p v-if="row.state === 'CLOSED'">实点现金 ¥{{ money(row.actualCash) }} · 差额 ¥{{ money(row.summary.difference) }} · {{ row.note || '无补充说明' }}</p></section></template>
    <template v-if="tab === 'settings'"><el-form class="panel scene-form" label-position="top" :disabled="!can('settings:edit') && user.userInfo?.role !== 'admin'"><h2>门店点餐方式</h2><div class="form-grid"><el-form-item label="门店类型"><el-select v-model="cfg.industry" @change="preset"><el-option v-for="(label, id) in sceneNames" :key="id" :label="label" :value="id" /></el-select></el-form-item><el-form-item label="台位名称"><el-input v-model="cfg.seatLabel" maxlength="8" placeholder="例如 桌台、包厢" /></el-form-item><el-form-item label="结账方式"><el-radio-group v-model="cfg.paymentMode"><el-radio label="PREPAY">下单付款后备餐</el-radio><el-radio label="POSTPAY">点餐后到收银台结账</el-radio></el-radio-group></el-form-item><el-form-item label="营业状态"><el-switch v-model="cfg.accepting" active-text="正常接单" inactive-text="暂停接单" /></el-form-item></div><h2>营业时间</h2><div class="form-grid"><el-form-item label="开始营业"><el-time-select v-model="cfg.openTime" start="00:00" step="00:30" end="23:30" /></el-form-item><el-form-item label="结束营业"><el-time-select v-model="cfg.closeTime" start="00:00" step="00:30" end="23:30" /></el-form-item></div><p class="footnote">开始与结束时间相同表示全天营业；结束时间早于开始时间表示跨夜营业。</p><el-form-item label="营业日期"><el-checkbox-group v-model="cfg.weekdays"><el-checkbox v-for="(day, i) in ['周一','周二','周三','周四','周五','周六','周日']" :key="i" :label="i + 1">{{ day }}</el-checkbox></el-checkbox-group></el-form-item><h2>顾客与出餐功能</h2><div class="switch-list"><el-switch v-model="cfg.enabled" active-text="启用多场景点餐" /><el-switch v-model="cfg.kitchen" active-text="需要后厨制作" /><el-switch v-model="cfg.sharedCart" active-text="支持多人共同点餐" /><el-switch v-model="cfg.allowAdd" active-text="支持本次消费追加点单" /><el-switch v-model="cfg.allowService" active-text="支持催菜和服务呼叫" /><el-switch v-model="cfg.allowPickup" active-text="支持顾客自取" /></div><el-button type="primary" :loading="busy" @click="saveConfig">保存点餐设置</el-button></el-form></template>

    <el-dialog v-model="openVisible" :title="`${openForm.roomId} · 开台`" width="min(420px,94vw)"><el-form label-position="top"><el-form-item label="就餐 / 消费人数"><el-input-number v-model="openForm.headcount" :min="1" :max="1000" /></el-form-item></el-form><template #footer><el-button @click="openVisible = false">取消</el-button><el-button type="primary" :loading="busy" @click="confirmOpen">确认开台</el-button></template></el-dialog>
    <el-drawer v-model="billVisible" :title="`${currentSession?.roomId || ''} · 本次消费`" size="min(720px,100vw)"><el-alert v-if="billError" :title="billError" type="error" :closable="false" /><template v-if="currentSession"><div class="bill-toolbar"><el-tag>{{ sessionNames[currentSession.state] }}</el-tag><el-input-number v-if="currentSession.state === 'OPEN' && can('dining:manage')" :model-value="currentSession.headcount" :min="1" :max="1000" :disabled="busy" aria-label="消费人数" @change="value => act(() => request.post(`/dining/sessions/${currentSession.id}/action`, { action: 'headcount', headcount: value }), '人数已更新')" /><span v-else>{{ currentSession.headcount }} 人</span><el-button :loading="billLoading" @click="loadBill">刷新账单</el-button></div><div v-if="can('dining:manage')" class="bill-toolbar"><el-button v-if="currentSession.state === 'OPEN'" :disabled="busy" @click="seatAction('checkout')">进入结账</el-button><el-button v-if="currentSession.state === 'CHECKOUT'" :disabled="busy" @click="seatAction('resume')">继续加菜</el-button><el-button v-if="currentSession.state === 'OPEN'" :disabled="busy" @click="transferVisible = true">转台</el-button><el-button v-if="['OPEN','CHECKOUT'].includes(currentSession.state)" :disabled="busy" @click="seatAction('close')">结束消费</el-button><el-button v-if="currentSession.state === 'CLEANING'" type="primary" :disabled="busy" @click="seatAction('clean')">完成清台</el-button></div><el-button v-if="currentSession.state === 'OPEN' && can('pos:view')" type="primary" :disabled="busy || !!pending" @click="openOrder">为本台加菜</el-button><div v-if="!orders.length" class="empty small">本次消费还没有订单</div><article v-for="order in orders" :key="order.id" class="bill-order"><div class="card-top"><el-checkbox v-if="order.payMethod === 3 && order.payStatus === 0 && order.status !== 90 && can('pos:view')" v-model="selectedOrders" :label="order.id">选择结账</el-checkbox><strong>¥{{ money(order.amountTotal) }}</strong><el-tag>{{ order.status === 90 ? '已取消' : order.payStatus === 2 ? '已付款' : '未付款' }}</el-tag></div><p class="muted">{{ order.orderNo }} · {{ fulfillmentNames[order.fulfillment] }}</p><div v-for="item in order.items" :key="item.id" class="bill-item"><span>{{ item.name }} × {{ item.qty }}<small v-if="item.note"> · {{ item.note }}</small></span><span>¥{{ money(item.payableAmount) }}</span></div><p v-if="order.note" class="order-note">备注：{{ order.note }}</p></article><section v-if="unpaid.length && can('pos:view')" class="cash-panel"><h3>本次现金收款</h3><p>支持选择部分订单分次结账。选中应收 <strong>¥{{ money(selectedDue) }}</strong></p><el-input-number v-model="tender" :min="0" :precision="2" :controls="false" placeholder="填写实收现金" /><p>找零 ¥{{ money(Math.max(0, Number(tender || 0) - selectedDue)) }}</p><el-checkbox v-model="cashConfirmed" :disabled="!selectedOrders.length">已收到本次现金，并核对所选订单</el-checkbox><el-button type="primary" :loading="busy" :disabled="!cashReady || !!pending || !!billError" @click="collectCash">确认收款</el-button></section></template></el-drawer>
    <el-dialog v-model="transferVisible" title="转到空闲台位" width="min(420px,94vw)"><el-select v-model="targetRoom" placeholder="请选择目标台位"><el-option v-for="seat in rows.filter(s => !s.sessionId && s.isAvailable)" :key="seat.id" :label="seat.roomNumber" :value="seat.roomNumber" /></el-select><template #footer><el-button @click="transferVisible = false">取消</el-button><el-button type="primary" :disabled="!targetRoom" :loading="busy" @click="seatAction('transfer')">确认转台</el-button></template></el-dialog>
    <el-dialog v-model="orderVisible" title="为本台加菜" width="min(780px,96vw)" :close-on-click-modal="false"><el-alert v-if="pending" title="原订单结果待确认，请先恢复交易" type="warning" :closable="false" /><div class="form-grid"><el-form-item label="商品"><el-select v-model="productId" filterable placeholder="搜索商品"><el-option v-for="p in products" :key="p.id" :label="p.name" :value="String(p.id)" /></el-select></el-form-item><el-form-item label="规格"><el-select v-model="skuId" placeholder="选择规格"><el-option v-for="s in selectedProduct?.skus || []" :key="s.id" :label="`${attrsText(s.specs || s.skuSpecs) || '默认规格'} · ¥${money(s.price)}`" :value="String(s.id)" /></el-select></el-form-item></div><el-form-item v-for="g in attributeGroups" :key="g.name" :label="g.name"><el-checkbox-group v-if="g.type === 'multi'" v-model="attrs[g.name]"><el-checkbox v-for="o in g.options" :key="o" :label="o">{{ o }}</el-checkbox></el-checkbox-group><el-radio-group v-else v-model="attrs[g.name]"><el-radio v-for="o in g.options" :key="o" :label="o">{{ o }}</el-radio></el-radio-group></el-form-item><el-form-item v-if="productRule.extras?.length" label="加配料（按配料商品价格计费）"><el-checkbox-group v-model="extras"><el-checkbox v-for="e in productRule.extras" :key="e.skuId" :label="e.skuId">{{ e.label }} +¥{{ money(e.price) }}</el-checkbox></el-checkbox-group></el-form-item><div class="bill-toolbar"><el-input-number v-model="qty" :min="1" :max="999" /><el-input v-model="lineNote" placeholder="单品备注，例如少辣、不放葱" maxlength="255" /><el-button :disabled="!selectedSku || !!pending" @click="addLine">加入本单</el-button></div><div v-for="(item, i) in orderItems" :key="i" class="bill-item"><span>{{ item.name }} × {{ item.qty }} · {{ item.note }}</span><el-button text :disabled="!!pending" @click="orderItems.splice(i, 1); orderQuote = null">移除</el-button></div><el-input v-model="orderNote" placeholder="整单备注" maxlength="255" /><el-radio-group v-model="orderMethod" class="bill-toolbar"><el-radio :label="3">记入本台账单</el-radio><el-radio :label="2">现金已收款</el-radio></el-radio-group><el-input-number v-if="orderMethod === 2" v-model="orderTender" :min="0" :precision="2" placeholder="实收现金" /><p v-if="orderQuote">商品 ¥{{ money(orderQuote.originalAmount) }} · 优惠 ¥{{ money(orderQuote.discountAmount) }} · 应收 <strong>¥{{ money(orderQuote.amountTotal) }}</strong></p><template #footer><el-button :loading="quoteBusy" :disabled="!orderItems.length || !!pending" @click="quoteOrder">核算本单金额</el-button><el-button type="primary" :loading="busy" :disabled="!orderQuote || !!pending" @click="submitOrder">确认提交</el-button></template></el-dialog>
    <el-dialog v-model="approvalVisible" :title="approval.action === 'approve' ? '审核通过' : '回复顾客'" width="min(480px,94vw)"><el-input v-model="approval.resolution" type="textarea" :rows="3" maxlength="255" show-word-limit placeholder="填写处理说明，顾客可查看" /><template #footer><el-button @click="approvalVisible = false">取消</el-button><el-button type="primary" :loading="busy" @click="resolve">确认处理</el-button></template></el-dialog>
    <el-dialog v-model="shiftVisible" :title="shiftForm.action === 'open' ? '开始本班收银' : '核对现金并交班'" width="min(480px,94vw)"><el-form label-position="top"><el-form-item v-if="shiftForm.action === 'open'" label="开班备用金"><el-input-number v-model="shiftForm.openingCash" :min="0" :precision="2" /></el-form-item><el-form-item v-else label="实点现金"><el-input-number v-model="shiftForm.actualCash" :min="0" :precision="2" /></el-form-item><el-form-item label="交接说明"><el-input v-model="shiftForm.note" type="textarea" maxlength="255" /></el-form-item></el-form><template #footer><el-button @click="shiftVisible = false">取消</el-button><el-button type="primary" :loading="busy" @click="confirmShift">确认{{ shiftForm.action === 'open' ? '开班' : '交班' }}</el-button></template></el-dialog>
  </div>
</template>

<style scoped>
.dining-console{max-width:1440px;margin:auto;color:#1e293b}.dining-heading,.card-top,.heading-actions,.bill-toolbar,.service-row,.dish-row,.bill-item{display:flex;align-items:center;justify-content:space-between;gap:12px}.dining-heading{margin-bottom:24px;flex-wrap:wrap}.eyebrow{font-size:12px;color:#64748b;letter-spacing:1px}h1{font-size:28px;font-weight:650;margin:6px 0 8px}h2{font-size:19px;font-weight:650;margin:0 0 16px}p{margin:8px 0;font-size:14px;line-height:1.6;color:#64748b}.sync-time,.muted,.footnote{font-size:12px;color:#64748b;overflow-wrap:anywhere}.notice{margin-bottom:16px}.metric-row{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:16px;margin:20px 0}.metric-row article{padding:20px;background:white;border:1px solid #e2e8f0;border-radius:14px}.metric-row span{display:block;font-size:13px;color:#64748b}.metric-row strong{display:block;font-size:28px;margin-top:8px;font-variant-numeric:tabular-nums}.toolbar{display:flex;align-items:center;justify-content:space-between;gap:16px;flex-wrap:wrap;margin-bottom:20px}.toolbar>.el-input{max-width:300px}.toolbar>span{font-size:13px;color:#64748b}.seat-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(210px,1fr));gap:16px}.seat-card{background:white;border:1px solid #e2e8f0;border-radius:16px;min-height:180px;padding:20px;text-align:left;cursor:pointer;transition:border-color .15s,box-shadow .15s}.seat-card:hover{border-color:#409eff;box-shadow:0 4px 18px #0f172a0b}.seat-card:focus-visible{outline:3px solid #93c5fd;outline-offset:3px}.seat-card>strong{display:block;font-size:27px;margin:22px 0 4px}.seat-card .card-top{font-size:12px;color:#64748b}.status-pill{border-radius:20px;padding:4px 9px;background:#f1f5f9;color:#475569}.occupied .status-pill{background:#e8f2ff;color:#2563eb}.cleaning .status-pill{background:#fff7ed;color:#c2410c}.disabled{opacity:.55;cursor:default}.card-link{display:block;margin-top:20px;color:#2563eb;font-size:13px}.panel,.kitchen-card,.cash-panel{background:#fff;border:1px solid #e2e8f0;border-radius:16px;padding:24px;margin-bottom:20px}.kitchen-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(340px,1fr));gap:20px}.kitchen-card{margin:0}.kitchen-card h2{margin:0}.dish-row{padding:16px 0;border-bottom:1px solid #f1f5f9;align-items:flex-start}.dish-row:last-child{border:0}.dish-row strong{font-size:16px}.dish-row p{font-size:12px;margin:6px 0}.order-note{color:#92400e;background:#fffbeb;padding:8px 10px;border-radius:8px}.service-row{padding:18px 0;border-bottom:1px solid #f1f5f9;align-items:flex-start}.row-actions,.bill-toolbar{display:flex;flex-wrap:wrap;gap:8px}.row-actions .el-button+.el-button{margin:0}.empty{text-align:center;padding:64px 20px;color:#64748b}.empty.small{padding:30px 10px}.bill-toolbar{justify-content:flex-start;margin-bottom:20px}.bill-order{border:1px solid #e2e8f0;border-radius:12px;padding:16px;margin:16px 0}.bill-item{padding:10px 0;align-items:flex-start;border-bottom:1px solid #f1f5f9;font-size:14px}.bill-item small{color:#92400e}.cash-panel .el-checkbox{display:block;height:auto;white-space:normal;margin:16px 0}.cash-panel .el-button{width:100%;min-height:44px}.form-grid{display:grid;grid-template-columns:1fr 1fr;gap:16px}.form-grid .el-select,.form-grid .el-time-select{width:100%}.scene-form{max-width:900px}.scene-form h2{margin-top:16px}.switch-list{display:grid;grid-template-columns:1fr 1fr;gap:16px;margin:20px 0 28px}.el-button{min-height:36px}.scene-form>.el-button{min-height:44px;min-width:180px}.shift-panel{margin-top:20px}.bill-toolbar>.el-input{min-width:180px;flex:1}
@media(max-width:750px){h1{font-size:24px}.metric-row{gap:8px}.metric-row article{padding:12px}.metric-row strong{font-size:23px}.seat-grid{grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}.seat-card{padding:14px;min-height:170px}.kitchen-grid,.form-grid,.switch-list{grid-template-columns:1fr}.panel,.kitchen-card{padding:16px}.service-row{flex-wrap:wrap}.service-row>.row-actions{width:100%}.row-actions .el-button{flex:1}.sync-time{display:none}.bill-toolbar{gap:8px}.metric-row .metric-row{grid-template-columns:1fr}.heading-actions{margin-left:auto}}
</style>
