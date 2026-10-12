<script setup>
import { computed, onMounted, onBeforeUnmount, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import request from '@/lib/request'
import { useUserStore } from '@/stores/user'
import { money } from '@/lib/group-buy'
import { readFulfillmentPending, saveFulfillmentPending, clearFulfillmentPending, validateFulfillmentResponse } from '@/lib/group-buy-fulfillment'
const props = defineProps({ records: { type: Array, default: () => [] }, demoEnabled: Boolean })
const emit = defineEmits(['refresh'])
const user = useUserStore(), admin = computed(() => user.userInfo?.role === 'admin')
const identity = computed(() => `${user.currentStoreId}:${user.userInfo?.id}`)
const options = ref({ packages: [], rooms: [], skus: [] }), reconciliation = ref(null)
const loading = ref(false), busy = ref(false), error = ref(''), pending = ref(null), recoveryError = ref('')
const freshMapping = () => ({ platform: 'MEITUAN', billingMode: 'DINING', platformSkuId: '', title: '', packageSkuId: null, overtimeSkuId: null, includedMinutes: 0, enabled: true })
const mappingVisible = ref(false), form = ref(freshMapping())
const selected = ref(null), dialogVisible = ref(false), roomId = ref(''), headcount = ref(1)
const bill = ref(null), cash = ref(null), cashConfirmed = ref(false), payoutVisible = ref(false)
const statement = ref({ statementNo: '', grossAmount: null, fee: 0, actualAmount: null }), demoPackage = ref('')
const allowed = computed(() => !busy.value && !pending.value && !recoveryError.value)
const candidates = computed(() => props.records.filter(row => row.state === 'VERIFIED'))
const idleRooms = computed(() => options.value.rooms.filter(room => room.isAvailable && (room.eligibleGroupBuy === true || !room.sessionId)))
const settleReady = computed(() => allowed.value && bill.value && !bill.value.requestKey && cashConfirmed.value && Number(cash.value) >= Number(bill.value.amountDue) && cash.value !== null)
let generation = 0, readGeneration = 0, billGeneration = 0
const message = e => e.response?.data?.message || e.message || '操作暂时失败，请恢复原记录'
function restore() {
  try { pending.value = readFulfillmentPending(localStorage, user.currentStoreId, user.userInfo?.id); recoveryError.value = '' }
  catch (e) { pending.value = null; recoveryError.value = e.message }
}
async function load() {
  const version = generation, reading = ++readGeneration; loading.value = true
  try {
    const results = await Promise.allSettled([request.get('/group-buy/fulfillment/options', { silent: true }), request.get('/group-buy/reconciliation', { silent: true })])
    if (version !== generation || reading !== readGeneration) return
    for (const result of results) if (result.status === 'rejected') throw result.reason
    options.value = results[0].value; reconciliation.value = results[1].value; error.value = ''
    if (!idleRooms.value.some(room => room.roomNumber === roomId.value)) roomId.value = idleRooms.value[0]?.roomNumber || ''
  } catch (e) { if (version === generation && reading === readGeneration) error.value = message(e) }
  finally { if (version === generation && reading === readGeneration) loading.value = false }
}
async function recover() {
  if (!pending.value || busy.value || recoveryError.value) return
  const version = generation, operation = pending.value; busy.value = true; error.value = ''
  try {
    const result = await request.post(operation.path, operation.body, { silent: true, timeout: 30000 })
    if (version !== generation) return
    if (!validateFulfillmentResponse(operation, result)) throw new Error('返回记录与原操作不符，请恢复原操作并核对账单')
    clearFulfillmentPending(localStorage, user.currentStoreId, user.userInfo?.id); pending.value = null
    ElMessage.success(operation.label); emit('refresh'); await load()
    dialogVisible.value = false; payoutVisible.value = false; bill.value = null; cashConfirmed.value = false
  } catch (e) {
    if (version !== generation) return
    if (e.response?.status === 400) { clearFulfillmentPending(localStorage, user.currentStoreId, user.userInfo?.id); pending.value = null }
    error.value = message(e)
  } finally { if (version === generation) busy.value = false }
}
async function perform(path, body, label) {
  if (!allowed.value) return
  try { const operation = { path, body, label }; saveFulfillmentPending(localStorage, user.currentStoreId, user.userInfo?.id, operation); pending.value = operation; await recover() }
  catch (e) { error.value = message(e) }
}
async function saveMapping() {
  if (!admin.value || !allowed.value) return
  const version = generation; busy.value = true
  try { await request.put('/group-buy/fulfillment/packages', form.value.billingMode === 'DINING' ? { ...form.value, overtimeSkuId: 0, includedMinutes: 0 } : form.value); if (version !== generation) return; mappingVisible.value = false; ElMessage.success('团购套餐映射已保存'); await load() }
  catch (e) { if (version === generation) error.value = message(e) }
  finally { if (version === generation) busy.value = false }
}
function editMapping(value) { form.value = value ? { ...value, billingMode: value.billingMode || 'TIMED' } : freshMapping(); mappingVisible.value = true }
function openRecord(row) { if (!allowed.value) return; selected.value = row; dialogVisible.value = true; bill.value = null; cash.value = null; cashConfirmed.value = false; if (row.fulfillment) loadBill() }
async function loadBill() {
  const version = generation, reading = ++billGeneration, id = selected.value?.id
  if (!id) return
  bill.value = null; cashConfirmed.value = false
  try { const result = await request.get(`/group-buy/records/${id}/bill`, { silent: true }); if (version === generation && reading === billGeneration && selected.value?.id === id) bill.value = result }
  catch (e) { if (version === generation && reading === billGeneration) error.value = message(e) }
}
function fulfill() { const room = idleRooms.value.find(item => item.roomNumber === roomId.value); if (selected.value && room) return perform(`/group-buy/records/${selected.value.id}/fulfill`, { roomId: room.roomNumber, headcount: headcount.value, ...(room.sessionId ? { sessionId: room.sessionId } : {}) }, room.sessionId ? '团购套餐已关联顾客当前场次' : '团购套餐已关联台位和订单') }
function settle() { if (settleReady.value) return perform(`/group-buy/records/${selected.value.id}/settle`, { requestKey: crypto.randomUUID(), revision: bill.value.revision, expectedAmount: bill.value.amountDue, cashReceived: cash.value }, '消费已结账，完成出餐后请结束消费并清台') }
function openPayout(row) { if (!admin.value || !allowed.value) return; selected.value = row; statement.value = { statementNo: '', grossAmount: row.payAmount, fee: 0, actualAmount: null }; payoutVisible.value = true }
function payout() { if (selected.value && admin.value) return perform(`/group-buy/records/${selected.value.id}/payout`, { ...statement.value }, '实际到账账单已登记，差额保留供核对') }
function issueDemo() {
  const pack = options.value.packages.find(pack => `${pack.platform}:${pack.platformSkuId}` === demoPackage.value)
  if (pack && props.demoEnabled && admin.value) return perform('/group-buy/linked-demo/vouchers', { platform: pack.platform, platformSkuId: pack.platformSkuId, requestKey: crypto.randomUUID() }, '本地模拟券已创建，可验证真实业务联动')
}
watch(cash, () => { cashConfirmed.value = false })
watch(identity, () => { generation++; billGeneration++; busy.value = false; selected.value = null; dialogVisible.value = false; mappingVisible.value = false; payoutVisible.value = false; bill.value = null; options.value = { packages: [], rooms: [], skus: [] }; reconciliation.value = null; restore(); load() })
onMounted(() => { restore(); load() })
onBeforeUnmount(() => { generation++; billGeneration++ })
</script>

<template>
  <section class="fulfillment-panel">
    <div class="panel-top"><h2>套餐交付与结账</h2><div><el-button :loading="loading" @click="load">刷新联动账单</el-button><el-button v-if="admin" :disabled="!allowed" @click="editMapping()">配置团购套餐</el-button></div></div>
    <p class="muted">套餐商品交付一次，追加商品另计；餐饮套餐不收计时费用，计时套餐按约定收超时费用。团购金额不重复收取，关联失败可恢复原记录。</p>
    <el-alert v-if="error || recoveryError" :title="error || recoveryError" type="error" :closable="false" />
    <div v-if="pending" class="pending"><strong>原联动操作尚待确认</strong><p>请恢复原操作，不要重新核销或换一张券。</p><el-button :loading="busy" @click="recover">恢复原操作</el-button></div>
    <div v-if="!options.packages.length" class="empty">请管理员先配置平台商品与门店套餐规格。含饮料、果盘等权益请在商品的“套餐组件”中设置。</div>
    <div v-if="admin && options.packages.length" class="mapping-list"><el-tag v-for="pack in options.packages" :key="`${pack.platform}:${pack.platformSkuId}`" class="mapping-tag" @click="editMapping(pack)">{{ pack.title }} · {{ pack.billingMode === 'DINING' ? '餐饮套餐' : `${pack.includedMinutes}分钟` }} · {{ pack.enabled ? '启用' : '停用' }}</el-tag></div>
    <div v-if="demoEnabled && admin" class="demo-box"><strong>本地模拟平台 · 验证真实业务表</strong><p>仅本机演练开放。模拟券会使用当前门店真实套餐、包厢、库存和订单，请选择演练数据。</p><el-select v-model="demoPackage" placeholder="选择演练套餐" aria-label="真实联动演练套餐"><el-option v-for="pack in options.packages.filter(pack => pack.enabled)" :key="`${pack.platform}:${pack.platformSkuId}`" :label="`${pack.platform} · ${pack.title}`" :value="`${pack.platform}:${pack.platformSkuId}`" /></el-select><el-button type="warning" :disabled="!allowed || !demoPackage" @click="issueDemo">创建模拟券</el-button></div>
    <article v-for="row in candidates" :key="row.id" class="linked-card"><div><strong>{{ row.title }}</strong><p class="muted">平台商品 {{ row.platformSkuId || '尚未返回商品编号，暂不可联动' }} · {{ row.amountLabel || '团购金额' }} ¥{{ money(row.payAmount) }}</p><p v-if="row.fulfillment" class="muted">{{ row.fulfillment.session?.roomId }} · 场次 #{{ row.fulfillment.sessionId }} · {{ row.fulfillment.state === 'SETTLED' ? '已结账' : '消费中' }}<span v-if="row.simulation"> · 本地演练</span></p></div><div><el-button :disabled="!allowed || !row.platformSkuId" type="primary" plain @click="openRecord(row)">{{ row.fulfillment ? '查看消费账单' : '关联台位 / 恢复关联' }}</el-button><el-button v-if="admin && row.fulfillment" :disabled="!allowed" @click="openPayout(row)">登记平台到账</el-button></div></article>
    <div v-if="reconciliation" class="reconciliation"><span>团购应收 ¥{{ money(reconciliation.platformGross) }}</span><span>账单手续费 ¥{{ money(reconciliation.fees) }}</span><span>实际到账 ¥{{ money(reconciliation.actual) }}</span><strong>待核对差额 ¥{{ money(reconciliation.difference) }}</strong><p v-for="row in reconciliation.list.filter(row => row.statementMismatch)" :key="row.redemptionId">{{ row.title }}：账单原金额与核销金额不同，请核对平台调整。</p></div>
    <el-dialog v-model="mappingVisible" title="团购套餐映射" width="min(560px,94vw)"><el-alert v-if="error" :title="error" type="error" :closable="false" /><el-form label-position="top"><el-form-item label="平台"><el-select v-model="form.platform"><el-option label="抖音" value="DOUYIN" /><el-option label="美团／大众点评（餐饮套餐）" value="MEITUAN" /><el-option label="大众点评（历史模拟映射）" value="DIANPING" /></el-select></el-form-item><el-form-item label="套餐类型"><el-radio-group v-model="form.billingMode"><el-radio label="DINING">餐饮套餐</el-radio><el-radio label="TIMED">含计时服务的套餐</el-radio></el-radio-group></el-form-item><el-form-item label="平台商品编号"><el-input v-model="form.platformSkuId" maxlength="128" /></el-form-item><el-form-item label="门店套餐名称"><el-input v-model="form.title" maxlength="100" /></el-form-item><el-form-item label="套餐商品规格（原价不低于平台核销金额，套餐组件一并交付）"><el-select v-model="form.packageSkuId" filterable><el-option v-for="sku in options.skus" :key="sku.id" :value="sku.id" :label="`${sku.name} #${sku.id} · ¥${money(sku.price)}`" /></el-select></el-form-item><el-form-item v-if="form.billingMode === 'TIMED'" label="超时计费规格（该规格单价为每小时价格）"><el-select v-model="form.overtimeSkuId" filterable><el-option v-for="sku in options.skus" :key="sku.id" :value="sku.id" :label="`${sku.name} #${sku.id} · ¥${money(sku.price)}`" /></el-select></el-form-item><el-form-item v-if="form.billingMode === 'TIMED'" label="套餐含计时服务时长（整小时）"><el-input-number v-model="form.includedMinutes" :min="0" :max="1440" :step="60" /><span>分钟</span></el-form-item><el-switch v-model="form.enabled" active-text="启用映射" /></el-form><template #footer><el-button :disabled="!allowed" type="primary" @click="saveMapping">保存映射</el-button></template></el-dialog>
    <el-dialog v-model="dialogVisible" :title="selected?.title || '套餐消费账单'" width="min(600px,94vw)"><el-alert v-if="error" :title="error" type="error" :closable="false" /><template v-if="selected && !selected.fulfillment"><p>核销已成功。可以关联空闲台位，也可以关联顾客已扫码但尚未下单的场次；套餐商品随真实订单交付。已有订单的场次请先处理原消费。</p><el-select v-model="roomId" placeholder="选择空闲台位或已扫码的空场次" aria-label="团购消费台位"><el-option v-for="room in idleRooms" :key="room.id" :value="room.roomNumber" :label="room.sessionId ? `${room.roomNumber} · 顾客已扫码，关联本次消费` : `${room.roomNumber} · 空闲`" /></el-select><el-input-number v-model="headcount" :min="1" :max="1000" aria-label="团购人数" /><el-button :disabled="!allowed || !roomId" :loading="busy" type="primary" @click="fulfill">确认关联 / 恢复原关联</el-button></template><template v-else><el-button @click="loadBill">刷新服务端账单</el-button><div v-if="bill" class="bill"><template v-if="bill.billingMode !== 'DINING'"><p>{{ bill.minutes }}分钟 · 含 {{ bill.includedMinutes }}分钟</p><p>计时原价 ¥{{ money(bill.roomGross) }} · 套餐抵扣 ¥{{ money(bill.roomDeduction) }}</p><p>超时 ¥{{ money(bill.roomDue) }}</p></template><p>未收追加消费 ¥{{ money(bill.itemsDue) }}</p><h3>本次现金应收 ¥{{ money(bill.amountDue) }}</h3><template v-if="!bill.requestKey"><el-input-number v-model="cash" :min="0" :precision="2" :controls="false" aria-label="团购追加实收现金" /><p>找零 ¥{{ money(Math.max(0, Number(cash || 0) - Number(bill.amountDue))) }}</p><el-checkbox v-model="cashConfirmed">已核对本次现金应收，团购金额不重复收取</el-checkbox><el-button :disabled="!settleReady" :loading="busy" type="primary" @click="settle">确认结账</el-button></template><p v-else>已结账 · 实收 ¥{{ money(bill.cashReceived) }} · 找零 ¥{{ money(bill.change) }}。完成出餐后请在台位管理结束消费并清台。</p></div></template></el-dialog>
    <el-dialog v-model="payoutVisible" title="登记实际平台到账" width="min(480px,94vw)"><el-alert v-if="error" :title="error" type="error" :closable="false" /><p>按平台实际账单填写。系统保留差额，不会把到账再次计作营业收入。</p><el-form label-position="top"><el-form-item label="平台账单编号"><el-input v-model="statement.statementNo" maxlength="100" /></el-form-item><el-form-item label="账单原金额"><el-input-number v-model="statement.grossAmount" :precision="2" :min="0" /></el-form-item><el-form-item label="实际手续费"><el-input-number v-model="statement.fee" :precision="2" :min="0" /></el-form-item><el-form-item label="实际到账"><el-input-number v-model="statement.actualAmount" :precision="2" :min="0" /></el-form-item></el-form><template #footer><el-button :disabled="!allowed || !statement.statementNo.trim() || statement.actualAmount === null || statement.grossAmount === null" type="primary" @click="payout">登记并保留差额</el-button></template></el-dialog>
  </section>
</template>

<style scoped>
.fulfillment-panel{padding:24px;background:#fff;border:1px solid #e3e9ef;border-radius:12px}.panel-top,.linked-card{display:flex;justify-content:space-between;gap:16px;align-items:center}.panel-top h2{font-size:17px}.muted,.demo-box p,.empty{font-size:13px;line-height:1.7;color:#6d7e8d}.mapping-list{display:flex;flex-wrap:wrap;gap:8px;margin:16px 0}.mapping-tag{cursor:pointer}.linked-card{padding:18px 0;border-bottom:1px solid #e3e9ef}.linked-card>div:last-child{display:flex;gap:8px;flex-wrap:wrap}.demo-box,.pending{padding:16px;background:#fff8e8;border:1px solid #efdaaa;border-radius:8px;margin:16px 0}.demo-box .el-select{width:240px;max-width:100%;margin:8px 8px 8px 0}.reconciliation{display:flex;gap:16px;flex-wrap:wrap;padding-top:18px;font-size:13px}.reconciliation p{width:100%;color:#b35025}.bill .el-button{display:block;margin-top:16px}.bill .el-checkbox{display:flex;white-space:normal}.el-form-item .el-select{width:100%}@media(max-width:700px){.fulfillment-panel{padding:18px}.panel-top,.linked-card{align-items:flex-start;flex-direction:column}.panel-top>div{display:flex;gap:8px;flex-wrap:wrap}.panel-top>div .el-button{margin-left:0}}
</style>
