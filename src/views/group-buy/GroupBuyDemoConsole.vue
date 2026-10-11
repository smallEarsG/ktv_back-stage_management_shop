<script setup>
import { computed, onMounted, onBeforeUnmount, ref, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Refresh, Tickets } from '@element-plus/icons-vue'
import request from '@/lib/request'
import { useUserStore } from '@/stores/user'
import { demoPlatform, demoState, demoMoney, demoRequestKey, readDemoPending, saveDemoPending, clearDemoPending } from '@/lib/group-buy-demo'

// InputNumber keeps its mounted aria-disabled after native disabled changes; synchronize the accessible state too.
function syncNumberDisabled(element, binding) { element.querySelector('input')?.setAttribute('aria-disabled', String(binding.value)) }
const vNumberDisabled = { mounted: syncNumberDisabled, updated: syncNumberDisabled }
const user = useUserStore()
const identity = computed(() => `${user.currentStoreId}:${user.userInfo?.id}`)
const admin = computed(() => user.userInfo?.role === 'admin')
const capabilities = ref(null), data = ref(null), loading = ref(false), busy = ref(false), error = ref(''), pending = ref(null), recoveryError = ref('')
const voucherId = ref(''), roomId = ref(''), redeemVisible = ref(false), visitId = ref(''), minutes = ref(180), quote = ref(null), quoteLoading = ref(false)
const skuId = ref(''), qty = ref(1), cashReceived = ref(), cashConfirmed = ref(false)
const enabled = computed(() => capabilities.value?.enabled === true)
const vouchers = computed(() => data.value?.vouchers || [])
const visits = computed(() => data.value?.visits || [])
const rooms = computed(() => data.value?.rooms || [])
const extras = computed(() => data.value?.extras || [])
const activeVisit = computed(() => visits.value.find(visit => String(visit.id) === String(visitId.value)))
const selectedVoucher = computed(() => vouchers.value.find(voucher => String(voucher.id) === String(voucherId.value)))
const freeRooms = computed(() => rooms.value.filter(room => room.state === 'IDLE'))
const unlocked = computed(() => enabled.value && !busy.value && !pending.value && !recoveryError.value)
const canConsume = computed(() => unlocked.value && !loading.value && activeVisit.value?.state === 'OPEN')
const canSettle = computed(() => canConsume.value && !quoteLoading.value && !!quote.value && cashConfirmed.value && Number(cashReceived.value) >= Number(quote.value.amountDue))
const reconciliation = computed(() => data.value?.reconciliation)
const dateText = value => value ? String(value).replace('T', ' ').slice(0, 19) : '—'
let generation = 0, loadGeneration = 0, quoteGeneration = 0, disposed = false

function restore() {
  recoveryError.value = ''
  try { pending.value = readDemoPending(localStorage, user.currentStoreId, user.userInfo?.id) }
  catch (e) { pending.value = null; recoveryError.value = e.message }
}
async function load() {
  const version = generation, readVersion = ++loadGeneration
  loading.value = true
  try {
    const result = await request.get('/group-buy/demo/capabilities', { silent: true })
    if (disposed || version !== generation || readVersion !== loadGeneration) return
    capabilities.value = result
    if (!enabled.value) { data.value = null; quote.value = null; return }
    const state = await request.get('/group-buy/demo/state', { silent: true })
    if (disposed || version !== generation || readVersion !== loadGeneration) return
    data.value = state; error.value = ''
    if (!activeVisit.value) visitId.value = visits.value.find(visit => visit.state === 'OPEN')?.id || visits.value[0]?.id || ''
    if (!freeRooms.value.some(room => String(room.id) === String(roomId.value))) roomId.value = freeRooms.value[0]?.id || ''
    if (!extras.value.some(extra => String(extra.id) === String(skuId.value))) skuId.value = extras.value[0]?.id || ''
    if (activeVisit.value?.state === 'OPEN') await loadQuote()
    else quote.value = null
  } catch (e) { if (!disposed && version === generation && readVersion === loadGeneration) error.value = e.response?.data?.message || e.message || '模拟记录读取失败，请刷新' }
  finally { if (!disposed && version === generation && readVersion === loadGeneration) loading.value = false }
}
async function loadQuote() {
  const id = visitId.value, version = generation, quoteVersion = ++quoteGeneration, quoteMinutes = minutes.value
  quote.value = null; cashConfirmed.value = false
  if (!id || activeVisit.value?.state !== 'OPEN') return
  quoteLoading.value = true
  try {
    const result = await request.get(`/group-buy/demo/visits/${encodeURIComponent(id)}/quote`, { params: { minutes: quoteMinutes }, silent: true })
    if (disposed || version !== generation || quoteVersion !== quoteGeneration || String(visitId.value) !== String(id) || minutes.value !== quoteMinutes) return
    quote.value = result
  } catch (e) { if (!disposed && version === generation && quoteVersion === quoteGeneration) error.value = e.response?.data?.message || e.message || '模拟账单读取失败' }
  finally { if (!disposed && version === generation && quoteVersion === quoteGeneration) quoteLoading.value = false }
}
async function recover() {
  if (!pending.value || busy.value || recoveryError.value || !enabled.value) return
  const operation = pending.value, version = generation, store = user.currentStoreId, operator = user.userInfo?.id
  busy.value = true; error.value = ''
  try {
    const result = await request.post(operation.path, operation.body, { silent: true, timeout: 30000 })
    if (disposed || version !== generation) return
    clearDemoPending(localStorage, store, operator); pending.value = null
    if (operation.path === '/group-buy/demo/redeem' && result?.id) { visitId.value = result.id; minutes.value = result.includedMinutes }
    redeemVisible.value = false; cashConfirmed.value = false; cashReceived.value = undefined
    ElMessage.success(`${operation.label}已完成（模拟）`); await load()
  } catch (e) {
    if (disposed || version !== generation) return
    if (e.definitive || [400, 403, 409, 422].includes(e.response?.status)) {
      clearDemoPending(localStorage, store, operator); pending.value = null
      const message = e.response?.data?.message || e.message || '模拟操作未通过校验，请刷新核对'
      await load(); error.value = message
    } else error.value = '原模拟操作的结果尚未确认，请先刷新核对，再恢复原请求。原标识已保留。'
  } finally { if (!disposed && version === generation) busy.value = false }
}
async function perform(path, body, label) {
  if (!unlocked.value) return
  try {
    const operation = { path, body: { ...body, requestKey: demoRequestKey() }, label }
    saveDemoPending(localStorage, user.currentStoreId, user.userInfo?.id, operation); pending.value = operation
    await recover()
  } catch (e) { error.value = e.message }
}
function openRedeem(voucher) {
  if (!unlocked.value) return
  voucherId.value = voucher.id; roomId.value = freeRooms.value[0]?.id || ''; redeemVisible.value = true
}
async function redeem() {
  if (!selectedVoucher.value || !freeRooms.value.some(room => String(room.id) === String(roomId.value))) return
  await perform('/group-buy/demo/redeem', { voucherId: voucherId.value, roomId: roomId.value }, '核销并自动开台')
}
async function addItem() {
  if (!canConsume.value || !skuId.value) return
  await perform(`/group-buy/demo/visits/${encodeURIComponent(visitId.value)}/items`, { skuId: skuId.value, qty: qty.value }, '添加消费商品')
}
async function settle() {
  if (!canSettle.value) return
  await perform(`/group-buy/demo/visits/${encodeURIComponent(visitId.value)}/settle`, { revision: quote.value.revision, minutes: quote.value.minutes, expectedAmount: quote.value.amountDue, cashReceived: cashReceived.value }, '抵扣结账')
}
async function cancelVoucher(voucher) {
  if (!admin.value || !unlocked.value || voucher.canCancel !== true) return
  const version = generation
  try {
    const { value } = await ElMessageBox.prompt('仅未产生消费的模拟核销可撤销，房间将恢复空闲。请填写原因。', '撤销模拟核销', { inputValidator: text => !!text?.trim() && text.length <= 200 || '请填写200字以内的原因', confirmButtonText: '确认撤销', cancelButtonText: '保留核销' })
    if (version !== generation || disposed) return
    await perform(`/group-buy/demo/vouchers/${encodeURIComponent(voucher.id)}/cancel`, { reason: value.trim() }, '撤销核销')
  } catch (e) { if (!['cancel', 'close'].includes(e)) error.value = e.message }
}
async function reconcile() {
  await perform('/group-buy/demo/reconcile', {}, '结算对账')
}
watch(visitId, () => { quoteGeneration++; quoteLoading.value = false; quote.value = null; cashConfirmed.value = false; cashReceived.value = undefined; minutes.value = activeVisit.value?.includedMinutes || 180 }, { flush: 'sync' })
watch(minutes, () => { quoteGeneration++; quoteLoading.value = false; quote.value = null; cashConfirmed.value = false }, { flush: 'sync' })
watch(cashReceived, () => { cashConfirmed.value = false }, { flush: 'sync' })
watch(identity, async () => {
  generation++; loadGeneration++; quoteGeneration++; busy.value = false; quoteLoading.value = false
  capabilities.value = null; data.value = null; quote.value = null; visitId.value = ''; voucherId.value = ''; roomId.value = ''; redeemVisible.value = false; cashReceived.value = undefined; cashConfirmed.value = false
  restore(); await load()
})
onMounted(async () => { restore(); await load() })
onBeforeUnmount(() => { disposed = true; generation++; loadGeneration++; quoteGeneration++ })
</script>

<template>
  <div class="demo-page">
    <div class="heading"><div><span class="eyebrow">团购 · 联动演练</span><h1><el-icon><Tickets /></el-icon> 模拟核销与结账</h1><p>小程序领券 → 商户核销开台 → 套餐抵扣 → 结账对账</p></div><div class="heading-actions"><router-link to="/group-buy"><el-button>返回真实核销</el-button></router-link><el-button :icon="Refresh" :loading="loading" :disabled="busy" data-testid="demo-refresh" @click="load">刷新模拟记录</el-button></div></div>
    <el-alert title="模拟演练 · 团购券、房间和资金均为模拟数据，不会核销真实券或产生真实收款。" type="warning" :closable="false" show-icon />
    <el-alert v-if="error" :title="error" type="error" :closable="false" show-icon />
    <el-alert v-if="recoveryError" :title="recoveryError" type="error" :closable="false" show-icon />
    <div v-if="pending" class="pending-box"><strong>{{ pending.label }} · 需要确认原结果</strong><p>先核对记录，再恢复原请求；恢复会使用同一个标识，不会另建消费或重复收款。</p><small>原操作标识：{{ pending.body.requestKey }}</small><el-button :loading="busy" :disabled="!enabled" @click="recover">恢复原模拟请求</el-button></div>
    <section v-if="capabilities && !enabled" class="panel disabled"><h2>此环境未开放模拟演练</h2><p>模拟通道由服务端明确启用后才可使用。真实核销仍在团购核销页面处理。</p></section>
    <template v-if="enabled && data">
      <section class="panel"><div class="panel-title"><h2>顾客领取的模拟券</h2><span>先在小程序“团购演练”领取，再刷新此列表</span></div><div v-if="!vouchers.length" class="empty">还没有顾客领取模拟券</div><div class="voucher-grid"><article v-for="voucher in vouchers" :key="voucher.id" class="voucher" :data-voucher-id="voucher.id" data-testid="demo-voucher-row"><div class="card-title"><strong>{{ voucher.packageTitle || voucher.title }}</strong><el-tag :type="voucher.state === 'AVAILABLE' ? 'success' : 'info'">{{ demoState(voucher.state) }}</el-tag></div><p>{{ demoPlatform(voucher.platform) }} · {{ voucher.id }}</p><p>模拟实付 ¥{{ demoMoney(voucher.price) }} · {{ voucher.customerName || `顾客 #${voucher.customerId}` }}</p><div class="card-actions"><el-button v-if="['AVAILABLE','ISSUED'].includes(voucher.state)" type="primary" :disabled="!unlocked || !freeRooms.length" @click="openRedeem(voucher)">核销并自动开台</el-button><el-button v-if="admin && voucher.canCancel" type="danger" plain :disabled="!unlocked" @click="cancelVoucher(voucher)">撤销模拟核销</el-button><span v-if="voucher.visitId" class="muted">消费记录 {{ voucher.visitId }}</span></div></article></div></section>
      <section class="panel"><div class="panel-title"><h2>模拟房间</h2><span>与真实营业房间隔离</span></div><div class="room-grid"><article v-for="room in rooms" :key="room.id" class="room" :class="{ occupied: room.state !== 'IDLE' }"><div class="card-title"><strong>{{ room.name || room.id }}</strong><el-tag :type="room.state === 'IDLE' ? 'success' : 'warning'">{{ room.state === 'IDLE' ? '空闲' : '消费中' }}</el-tag></div><p>{{ room.visitId ? `消费记录 ${room.visitId}` : '核销券后自动开台' }}</p></article></div></section>
      <section class="panel"><div class="panel-title"><h2>套餐消费与抵扣</h2><el-select v-model="visitId" aria-label="选择模拟消费" data-testid="demo-visit-select" @change="loadQuote" placeholder="选择模拟消费" :disabled="busy || !!pending"><el-option v-for="visit in visits" :key="visit.id" :data-visit-id="visit.id" :label="`${visit.roomName || visit.roomId} · ${demoState(visit.state)} · ${visit.packageTitle || visit.title || visit.id}`" :value="visit.id" /></el-select></div><div v-if="!activeVisit" class="empty">核销后，这里会显示自动开台的消费记录</div><template v-else><div class="visit-heading"><div><strong>{{ activeVisit.roomName || activeVisit.roomId }} · {{ activeVisit.packageTitle || activeVisit.title }}</strong><p class="muted">{{ demoPlatform(activeVisit.platform) }} · {{ demoState(activeVisit.state) }} · {{ dateText(activeVisit.openedAt) }}</p></div><el-tag>{{ demoState(activeVisit.state) }}</el-tag></div><p class="entitlement">套餐权益：{{ `欢唱 ${activeVisit.includedMinutes} 分钟 + 饮料 ${activeVisit.includedDrinks} 份；超时与额外商品按模拟价补差` }}</p><template v-if="activeVisit.state === 'OPEN'"><div class="form-row"><label for="demo-minutes">本次消费分钟</label><el-input-number v-number-disabled="!canConsume" id="demo-minutes" data-testid="demo-minutes" v-model="minutes" :min="1" :max="1440" :step="30" :disabled="!canConsume" /><el-button :loading="quoteLoading" :disabled="!canConsume" @click="loadQuote">更新模拟账单</el-button></div><div class="form-row"><el-select v-model="skuId" aria-label="模拟加购商品" placeholder="选择加购商品" :disabled="!canConsume"><el-option v-for="extra in extras" :key="extra.id" :label="`${extra.title} · ¥${demoMoney(extra.price)}`" :value="extra.id" /></el-select><el-input-number v-number-disabled="!canConsume" v-model="qty" aria-label="模拟加购数量" :min="1" :max="20" :disabled="!canConsume" /><el-button :disabled="!canConsume || !skuId" :loading="busy" @click="addItem">添加模拟商品</el-button></div><div v-if="quote" class="bill" data-testid="demo-quote"><p class="bill-total">消费合计 <strong>¥{{ demoMoney(quote.grossAmount) }}</strong> · {{ quote.minutes }} 分钟</p><div class="bill-grid"><div><span>房费</span><strong>¥{{ demoMoney(quote.roomGross) }}</strong></div><div><span>商品</span><strong>¥{{ demoMoney(quote.itemGross) }}</strong></div><div><span>套餐抵扣</span><strong class="deduction">−¥{{ demoMoney(quote.packageDeduction) }}</strong></div><div><span>补差应收</span><strong class="due">¥{{ demoMoney(quote.amountDue) }}</strong></div></div><div v-for="(item, index) in quote.items || []" :key="item.skuId || item.id || index" class="bill-item"><span>{{ item.title }} × {{ item.qty }}<small v-if="item.deduction"> · 套餐抵扣 ¥{{ demoMoney(item.deduction) }}</small></span><span>¥{{ demoMoney(item.subtotal) }}</span></div><p class="muted">团购模拟实付 ¥{{ demoMoney(quote.platformPaid) }} · 模拟平台服务费 ¥{{ demoMoney(quote.platformFee) }} · 预计净结算 ¥{{ demoMoney(quote.platformNet) }}</p><div class="form-row"><label for="demo-cash">模拟现金实收</label><el-input-number v-number-disabled="!canConsume" id="demo-cash" data-testid="demo-cash" v-model="cashReceived" :min="0" :precision="2" :disabled="!canConsume" :controls="false" placeholder="填写模拟实收" /></div><el-checkbox v-model="cashConfirmed" :disabled="!canConsume">已核对模拟应收与实收，本次仅演练结账</el-checkbox><div class="card-actions"><el-button type="primary" :disabled="!canSettle" :loading="busy" data-testid="demo-settle" @click="settle">套餐抵扣并模拟结账</el-button></div></div><div v-else class="empty small">消费时长改变后，请更新账单再确认结账</div></template><div v-else-if="activeVisit.receipt" class="receipt"><h3>模拟结账回执</h3><p>套餐抵扣 ¥{{ demoMoney(activeVisit.receipt.packageDeduction) }} · 补差收款 ¥{{ demoMoney(activeVisit.receipt.amountDue) }} · 找零 ¥{{ demoMoney(activeVisit.receipt.change) }}</p><p class="muted">{{ activeVisit.receipt.id }} · {{ dateText(activeVisit.receipt.settledAt) }}</p></div></template></section>
      <section class="panel"><div class="panel-title"><h2>模拟结算对账</h2><el-button type="primary" plain :loading="busy" :disabled="!unlocked" data-testid="demo-reconcile" @click="reconcile">执行模拟对账</el-button></div><p class="muted">核对模拟平台净结算与补差收款，套餐抵扣不重复记为现金收入。</p><div v-if="!reconciliation" class="empty small">完成结账后，执行模拟对账查看结果</div><template v-else><div class="bill-grid"><div><span>模拟平台净结算</span><strong>¥{{ demoMoney(reconciliation.platformNet) }}</strong></div><div><span>模拟补差收款</span><strong>¥{{ demoMoney(reconciliation.supplementalCash) }}</strong></div><div><span>模拟净收入合计</span><strong>¥{{ demoMoney(reconciliation.receivable) }}</strong></div><div><span>对账差额</span><strong>¥{{ demoMoney(reconciliation.difference) }}</strong></div></div><p class="muted">已结账 {{ reconciliation.settledCount }} 场 · 待平台模拟到账 ¥{{ demoMoney(reconciliation.pendingPlatform) }} · 仍在消费 {{ reconciliation.openCount }} 场</p><p class="muted">团购实付 ¥{{ demoMoney(reconciliation.platformGross) }} − 平台服务费 ¥{{ demoMoney(reconciliation.platformFee) }} + 补差收款 ¥{{ demoMoney(reconciliation.supplementalCash) }} = 净收入 ¥{{ demoMoney(reconciliation.receivable) }}；已到账 ¥{{ demoMoney(reconciliation.settled) }}</p></template></section>
    </template>
    <el-dialog v-model="redeemVisible" title="模拟核销并自动开台" width="min(480px,94vw)" :close-on-click-modal="false"><template v-if="selectedVoucher"><p>{{ selectedVoucher.packageTitle || selectedVoucher.title }} · {{ demoPlatform(selectedVoucher.platform) }}</p><p class="muted">请核对顾客与券码：{{ selectedVoucher.id }}</p><el-select v-model="roomId" aria-label="选择空闲模拟房间" data-testid="demo-room-select" placeholder="选择空闲模拟房间" :disabled="!unlocked"><el-option v-for="room in freeRooms" :key="room.id" :label="room.name || room.id" :value="room.id" /></el-select><p class="muted">确认后，券转为已核销，所选模拟房间自动进入消费中。</p></template><template #footer><el-button :disabled="busy" @click="redeemVisible = false">返回核对</el-button><el-button type="primary" :disabled="!unlocked || !roomId" :loading="busy" data-testid="demo-redeem" @click="redeem">确认模拟核销开台</el-button></template></el-dialog>
  </div>
</template>

<style scoped>
.demo-page{display:flex;flex-direction:column;gap:20px;padding:24px;color:#26384a}.heading,.heading-actions,.panel-title,.card-title,.visit-heading,.form-row,.card-actions,.bill-item{display:flex;align-items:center;justify-content:space-between;gap:14px}.heading h1{display:flex;align-items:center;gap:8px;font-size:26px;margin:6px 0 10px}.heading p{margin:0;color:#6d7e8d;font-size:14px}.heading-actions,.card-actions,.form-row{justify-content:flex-start;flex-wrap:wrap}.eyebrow,.muted,.panel-title>span{color:#6d7e8d;font-size:12px;line-height:1.7}.panel{padding:24px;background:#fff;border:1px solid #e3e9ef;border-radius:12px;min-width:0}.panel-title{margin-bottom:20px}.panel h2{font-size:18px;margin:0}.panel-title .el-select{width:min(100%,360px)}.voucher-grid,.room-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px}.voucher,.room{padding:18px;border:1px solid #e3e9ef;border-radius:10px;background:#f8fafc;min-width:0}.voucher p,.room p{font-size:13px;color:#60758a;overflow-wrap:anywhere}.room.occupied{background:#fff9ee;border-color:#eadcb8}.voucher .card-actions{margin-top:16px}.card-title strong{font-size:15px;overflow-wrap:anywhere}.visit-heading strong{font-size:18px}.entitlement{padding:12px 16px;background:#eef7fa;border-radius:8px;color:#386f83;font-size:14px;line-height:1.7}.form-row{margin:18px 0}.form-row label{font-size:14px}.form-row .el-select{width:250px}.bill{padding:20px;background:#f8fafc;border-radius:10px;margin-top:24px}.bill-total{font-size:14px;margin:0 0 16px}.bill-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:16px}.bill-grid>div{display:flex;flex-direction:column;gap:8px;padding:14px;background:#f8fafc;border-radius:8px;min-width:0}.bill .bill-grid>div{background:#fff}.bill-grid span{font-size:12px;color:#6d7e8d}.bill-grid strong{font-size:22px;overflow-wrap:anywhere}.bill-grid .deduction{color:#287f69}.bill-grid .due{color:#ce6730}.bill-item{padding:12px 0;font-size:14px;border-bottom:1px solid #e5ebf1}.bill-item small{color:#287f69}.bill>.card-actions{margin-top:16px}.bill .el-checkbox{white-space:normal;height:auto;line-height:1.7}.bill :deep(.el-checkbox__label){white-space:normal;line-height:1.7}.empty{padding:30px;text-align:center;color:#8293a4;background:#f8fafc;border-radius:8px;font-size:14px}.empty.small{padding:20px}.pending-box{padding:20px;background:#fff8e8;border:1px solid #efdaaa;border-radius:12px}.pending-box p{font-size:14px;line-height:1.7}.pending-box small{display:block;margin-bottom:14px;color:#8a7343;overflow-wrap:anywhere}.receipt{background:#eff8f2;padding:20px;border-radius:8px;margin-top:18px}.receipt h3{font-size:16px;margin:0 0 12px}.receipt p{font-size:14px;line-height:1.7}.reconcile-table{margin-top:18px;overflow:auto}.disabled p{color:#6d7e8d;font-size:14px}
@media(max-width:900px){.demo-page{padding:16px}.heading{align-items:stretch;flex-direction:column}.heading h1{font-size:23px}.heading-actions{justify-content:flex-end}.panel{padding:18px}.panel-title,.visit-heading{align-items:flex-start;flex-direction:column}.voucher-grid,.room-grid{grid-template-columns:1fr}.bill-grid{grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}.bill-grid strong{font-size:19px}.bill{padding:14px}.form-row{align-items:flex-start}.form-row .el-select{width:100%}.card-title{align-items:flex-start}.form-row label{width:100%}.card-actions .muted{width:100%;overflow-wrap:anywhere}}
</style>
