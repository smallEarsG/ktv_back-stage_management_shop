<script setup>
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import request from '@/lib/request'
import { useUserStore } from '@/stores/user'
import { ElMessage } from 'element-plus'
const props = defineProps({ order: Object })
const emit = defineEmits(['submitted', 'close'])
const user = useUserStore(), kind = ref('RETURN'), reason = ref(''), items = ref([]), busy = ref(false), error = ref(''), pending = ref(null)
const identity = computed(() => `${user.currentStoreId}:${user.userInfo?.id}`)
const allowed = computed(() => user.hasPermission('refund:approve'))
const key = () => `dining-return:${identity.value}`
let generation = 0, disposed = false
function restore() {
  try {
    const saved = JSON.parse(localStorage.getItem(key()) || 'null')
    if (saved && (!saved.requestKey || !saved.orderId || !['RETURN', 'REFUND'].includes(saved.kind) || !Array.isArray(saved.items))) throw new Error('格式错误')
    pending.value = saved
  } catch { error.value = '售后恢复记录无法读取，请联系店长核对'; pending.value = { invalid: true } }
}
function resetItems() {
  items.value = (props.order?.items || []).map(item => {
    const max = Number(kind.value === 'RETURN' ? item.returnableQty : item.refundableQty) || 0
    return { id: item.id, name: item.name, max, selected: max > 0, qty: max > 0 ? 1 : 0 }
  })
}
async function recover() {
  if (!allowed.value || busy.value || !pending.value || pending.value.invalid) return
  const body = pending.value, version = generation
  busy.value = true
  try {
    const result = await request.post('/dining/aftersales', body, { silent: true, timeout: 30000 })
    if (disposed || version !== generation) return
    if (Number(result.orderId) !== Number(body.orderId) || result.requestKey !== body.requestKey || result.kind !== body.kind) throw new Error('售后记录与原申请不符，请恢复原申请核对')
    localStorage.removeItem(key()); pending.value = null; error.value = ''
    ElMessage.success('申请已登记，请到服务与售后审核，再执行退款'); emit('submitted')
  } catch (e) {
    if (disposed || version !== generation) return
    if (e.definitive) { localStorage.removeItem(key()); pending.value = null }
    error.value = e.message || '申请结果未确认，请恢复原申请'
  } finally { if (!disposed && version === generation) busy.value = false }
}
async function submit() {
  if (!allowed.value || busy.value || pending.value || !props.order) return
  const selected = items.value.filter(item => item.selected && item.max > 0)
  if (!selected.length || selected.some(item => !Number.isInteger(item.qty) || item.qty < 1 || item.qty > item.max) || !reason.value.trim()) { error.value = '请选择可处理的商品数量，并填写原因'; return }
  const body = { orderId: props.order.id, requestKey: crypto.randomUUID(), kind: kind.value, reason: reason.value.trim(), items: selected.map(item => ({ id: item.id, qty: item.qty })) }
  try { localStorage.setItem(key(), JSON.stringify(body)); pending.value = body }
  catch { error.value = '无法保存售后恢复记录，暂不能申请'; return }
  await recover()
}
watch(kind, resetItems)
watch([() => props.order?.id, identity], () => { generation++; busy.value = false; error.value = ''; reason.value = ''; kind.value = 'RETURN'; restore(); resetItems() }, { immediate: true })
onBeforeUnmount(() => { disposed = true; generation++ })
</script>

<template>
  <div class="return-request">
    <p>订单 {{ order?.orderNo }}</p>
    <el-alert v-if="error" :title="error" type="error" :closable="false" show-icon />
    <el-alert v-if="pending" type="warning" :closable="false" title="原售后申请结果待确认，请先恢复，避免重复申请。"><p v-if="!pending.invalid">原订单 #{{ pending.orderId }} · {{ pending.kind === 'RETURN' ? '退菜并退款' : '金额退款' }}</p><el-button v-if="!pending.invalid" :loading="busy" :disabled="!allowed" @click="recover">恢复原申请</el-button></el-alert>
    <el-form label-position="top" :disabled="busy || !!pending || !allowed">
      <el-form-item label="处理方式"><el-radio-group v-model="kind"><el-radio label="RETURN">未制作退菜并退款</el-radio><el-radio label="REFUND">仅金额退款</el-radio></el-radio-group></el-form-item>
      <el-alert :title="kind === 'RETURN' ? '仅处理尚未制作的商品，申请处理中暂停相关菜品；退款成功后减少制作数量并恢复未交付库存。' : '金额退款不会停止制作或减少出餐数量，库存不会自动恢复。'" type="info" :closable="false" />
      <div v-if="!items.some(item => item.max > 0)" class="empty">没有可处理数量，请刷新账单核对制作和退款状态。</div>
      <div v-for="item in items" :key="item.id" class="return-line"><el-checkbox v-model="item.selected" :disabled="!item.max">{{ item.name }} · 可处理 {{ item.max }}份</el-checkbox><el-input-number v-if="item.max" v-model="item.qty" :min="1" :max="item.max" :disabled="!item.selected" aria-label="本次售后份数" /></div>
      <el-form-item label="处理原因"><el-input v-model="reason" type="textarea" :rows="3" maxlength="255" show-word-limit placeholder="例如顾客取消尚未制作的饮料" /></el-form-item>
      <p class="hint">此处登记申请；审核后仍需按实际现金退还、钱包或微信退款结果确认完成。</p>
      <div class="actions"><el-button @click="emit('close')">返回账单</el-button><el-button type="primary" :loading="busy" @click="submit">提交售后申请</el-button></div>
    </el-form>
  </div>
</template>

<style scoped>
.return-request p{margin:12px 0;overflow-wrap:anywhere}.return-line{display:flex;justify-content:space-between;align-items:center;gap:12px;padding:12px 0;border-bottom:1px solid #e2e8f0}.return-line .el-checkbox{white-space:normal;height:auto;min-width:0}.hint{color:#64748b;font-size:13px;line-height:1.7}.actions{display:flex;justify-content:flex-end;gap:8px;flex-wrap:wrap}.actions .el-button{margin-left:0}@media(max-width:600px){.return-line{align-items:flex-start;flex-direction:column}.el-radio-group{display:flex;flex-wrap:wrap;gap:8px}.el-radio{margin-right:0}}
</style>
