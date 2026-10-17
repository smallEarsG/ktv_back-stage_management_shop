<script setup>
import { computed, onMounted, onBeforeUnmount, reactive, ref } from 'vue'
import request from '@/lib/request'
import { mallText } from '@/lib/mall'

const props = defineProps({ app: { type: Number, required: true }, disabled: Boolean })
const emit = defineEmits(['submit'])
const rows = ref([]), total = ref(0), page = ref(1), status = ref('PAID'), loading = ref(false), error = ref(''), carrier = ref(''), selected = reactive(new Map())
const eligible = computed(() => rows.value.filter(row => row.fulfillmentType !== 'PICKUP'))
const allSelected = computed(() => eligible.value.length > 0 && eligible.value.every(row => selected.has(row.id)))
let sequence = 0, disposed = false
async function load() {
  const version = ++sequence
  loading.value = true; error.value = ''; rows.value = []
  try { const result = await request.get(`/mall/apps/${props.app}/orders`, { params: { status: status.value, page: page.value, size: 20 }, silent: true }); if (!disposed && version === sequence) { rows.value = result.list; total.value = result.total } }
  catch (e) { if (!disposed && version === sequence) error.value = e.message || '待发货订单暂不可用' }
  finally { if (!disposed && version === sequence) loading.value = false }
}
function choose(row, checked) {
  if (props.disabled || row.fulfillmentType === 'PICKUP') return
  if (!checked) { selected.delete(row.id); return }
  if (selected.size >= 50 && !selected.has(row.id)) { error.value = '每批最多选择50笔订单'; return }
  const previous = selected.get(row.id)
  selected.set(row.id, { orderId: row.id, expectedVersion: row.version, orderNo: row.orderNo, carrier: previous?.carrier || carrier.value, trackingNo: previous?.trackingNo || '' })
}
function choosePage(checked) { for (const row of eligible.value) choose(row, checked) }
function applyCarrier() { for (const draft of selected.values()) draft.carrier = carrier.value }
function submit() {
  error.value = ''
  if (!selected.size) { error.value = '请先选择待发货订单'; return }
  const drafts = [...selected.values()]
  if (drafts.some(row => !row.carrier.trim() || !row.trackingNo.trim())) { error.value = '请为每一笔已选订单填写快递公司和物流单号'; return }
  if (rows.value.some(row => selected.has(row.id) && selected.get(row.id).expectedVersion !== row.version)) { error.value = '部分订单已变化，请取消并重新勾选这些订单后再提交'; return }
  emit('submit', drafts.map(row => ({ orderId: row.orderId, expectedVersion: row.expectedVersion, carrier: row.carrier.trim(), trackingNo: row.trackingNo.trim() })))
}
function move(delta) { page.value += delta; load() }
onMounted(load)
onBeforeUnmount(() => { disposed = true; sequence++ })
</script>

<template>
  <section class="batch-shipping"><header><div><h2>选择订单，登记发货</h2><p>每批最多50单，一次寄出每单全部剩余商品。需要分数量发货时，请进入订单详情。</p></div><el-button :disabled="disabled || loading" @click="load">刷新订单</el-button></header><el-alert v-if="error" :title="error" type="warning" :closable="false" show-icon /><div class="shipping-toolbar"><el-select v-model="status" aria-label="发货状态" :disabled="disabled" @change="page = 1; load()"><el-option value="PAID" label="待发货" /><el-option value="PARTIALLY_SHIPPED" label="部分发货" /></el-select><el-input v-model="carrier" placeholder="统一快递公司（如顺丰）" aria-label="统一快递公司" :disabled="disabled" maxlength="80" /><el-button :disabled="disabled || !carrier.trim() || !selected.size" @click="applyCarrier">应用到已选订单</el-button><span>已选 {{ selected.size }} / 50 单</span></div><div class="shipping-table-wrap"><table><thead><tr><th><input type="checkbox" :checked="allSelected" :disabled="disabled || !eligible.length" aria-label="选择本页可发货订单" @change="choosePage($event.target.checked)" /></th><th>订单</th><th>履约方式</th><th>快递公司</th><th>物流单号</th></tr></thead><tbody><tr v-for="row in rows" :key="row.id"><td><input type="checkbox" :checked="selected.has(row.id)" :disabled="disabled || row.fulfillmentType === 'PICKUP'" :aria-label="`选择订单 ${row.orderNo}`" @change="choose(row, $event.target.checked)" /></td><td>{{ row.orderNo }}<small>{{ row.fulfillmentType === 'PICKUP' ? '自提订单请单独核销' : mallText(row.status) }}</small><small v-if="selected.has(row.id) && selected.get(row.id).expectedVersion !== row.version" class="changed-order">资料已变化，请重新勾选</small></td><td>{{ mallText(row.fulfillmentType) }}</td><td><el-input v-if="selected.has(row.id)" v-model="selected.get(row.id).carrier" :disabled="disabled" maxlength="80" :aria-label="`${row.orderNo} 快递公司`" /><span v-else>选择订单后填写</span></td><td><el-input v-if="selected.has(row.id)" v-model="selected.get(row.id).trackingNo" :disabled="disabled" maxlength="100" :aria-label="`${row.orderNo} 物流单号`" /><span v-else>—</span></td></tr><tr v-if="!rows.length"><td colspan="5" class="shipping-empty">{{ loading ? '正在查询…' : error ? '列表暂不可用，请重试' : '当前没有待发货订单' }}</td></tr></tbody></table></div><footer><span>第 {{ page }} 页 · {{ total }} 笔订单</span><el-button :disabled="disabled || loading || page <= 1" @click="move(-1)">上一页</el-button><el-button :disabled="disabled || loading || page * 20 >= total" @click="move(1)">下一页</el-button><el-button type="primary" :disabled="disabled || !selected.size" @click="submit">登记 {{ selected.size || '' }} 单发货</el-button></footer><p>登记只保存运单信息，不会向快递公司真实下单或打印面单。提交后逐笔显示结果，未确认的结果保留原批次重试。</p></section>
</template>

<style scoped>
.batch-shipping{background:white;border:1px solid #e7edf5;border-radius:12px;padding:24px;margin:20px 0}.batch-shipping header{display:flex;align-items:center;justify-content:space-between;gap:18px}.batch-shipping h2{margin:0;font-size:17px;color:#334762;font-weight:600}.batch-shipping p{font-size:12px;color:#98a5b7;line-height:1.8}.shipping-toolbar{display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin:20px 0}.shipping-toolbar .el-select{width:145px}.shipping-toolbar .el-input{width:220px}.shipping-toolbar>span{font-size:12px;color:#8293ac;margin-left:auto}.shipping-table-wrap{overflow:auto}table{width:100%;min-width:780px;border-collapse:collapse;text-align:left}th{font-size:12px;background:#f7f9fc;color:#92a0b5;font-weight:500;padding:13px}td{font-size:12px;color:#697b94;border-bottom:1px solid #edf1f7;padding:16px 13px}td small{display:block;font-size:10px;color:#a2afc0;margin-top:6px}.shipping-empty{text-align:center;padding:40px}.batch-shipping footer{display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin-top:20px}.batch-shipping footer>span{font-size:11px;color:#94a1b4;margin-right:auto}.batch-shipping .changed-order{color:#c18a4d}@media(max-width:650px){.batch-shipping{padding:17px}.batch-shipping header{align-items:flex-start}.shipping-toolbar .el-input{width:100%}.shipping-toolbar>span{margin-left:0}.batch-shipping footer>span{width:100%}.batch-shipping footer .el-button+.el-button{margin-left:0}}
</style>
